import {
  assertOrderBelongsToUser,
  getPixOrder,
  pixExpirationAt,
  publicPixPayment,
} from "../_lib/mercadopago.js";
import { getAuthenticatedUser } from "../_lib/supabase-admin.js";
import { handleApiError, methodNotAllowed, sendJson } from "../_lib/http.js";
import { listPixPayments, updatePendingPixPaymentStatus } from "../_lib/voucher.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    methodNotAllowed(response, ["GET"]);
    return;
  }

  try {
    const user = await getAuthenticatedUser(request);
    const pendingPayments = await listPixPayments(user.id);
    const payments = await Promise.all(
      pendingPayments.map(async (pending) => {
        if (pending.status === "voucher-gerado") {
          return {
            orderId: pending.mercado_pago_order_id,
            status: { status: "approved", paymentStatus: "approved", approved: true },
            amount: pending.amount,
            registration: pending.dados,
            createdAt: pending.created_at,
            expired: false,
          };
        }

        const expiresAt = pixExpirationAt(pending.created_at);
        const expired = Date.now() >= expiresAt.getTime();

        if (expired) {
          if (pending.status !== "cancelado") {
            await updatePendingPixPaymentStatus(pending.mercado_pago_order_id, "cancelado");
          }

          return {
            orderId: pending.mercado_pago_order_id,
            status: {
              status: "cancelled",
              paymentStatus: "cancelled",
              approved: false,
            },
            amount: pending.amount,
            registration: pending.dados,
            createdAt: pending.created_at,
            expiresAt: expiresAt.toISOString(),
            expired: true,
          };
        }

        const order = await getPixOrder(pending.mercado_pago_order_id);
        assertOrderBelongsToUser(order, user.id);

        return {
          ...publicPixPayment(order),
          amount: pending.amount,
          registration: pending.dados,
          createdAt: pending.created_at,
          expiresAt: expiresAt.toISOString(),
          expired: false,
        };
      }),
    );

    sendJson(response, 200, { payments });
  } catch (error) {
    handleApiError(response, error);
  }
}
