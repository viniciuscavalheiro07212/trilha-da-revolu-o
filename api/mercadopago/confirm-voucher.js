import { assertOrderBelongsToUser, getPixOrder, isOrderApproved } from "../_lib/mercadopago.js";
import { getAuthenticatedUser } from "../_lib/supabase-admin.js";
import { handleApiError, methodNotAllowed, readJsonBody, sendJson } from "../_lib/http.js";
import { createPaidVoucher, getPendingPixPayment } from "../_lib/voucher.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    methodNotAllowed(response, ["POST"]);
    return;
  }

  try {
    const user = await getAuthenticatedUser(request);
    const body = await readJsonBody(request);
    const order = await getPixOrder(body.orderId);
    const pending = await getPendingPixPayment(order.id);

    assertOrderBelongsToUser(order, user.id);

    if (!pending || pending.usuario_id !== user.id) {
      const error = new Error("Pagamento pendente nao encontrado para esta conta.");
      error.statusCode = 404;
      throw error;
    }

    if (!isOrderApproved(order)) {
      const error = new Error("Pagamento ainda nao foi aprovado.");
      error.statusCode = 409;
      throw error;
    }

    const voucher = await createPaidVoucher({ user, order, registration: pending.dados });
    sendJson(response, 201, { voucher });
  } catch (error) {
    handleApiError(response, error);
  }
}
