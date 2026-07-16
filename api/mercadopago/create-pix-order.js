import { createPixOrder } from "../_lib/mercadopago.js";
import { getAuthenticatedUser } from "../_lib/supabase-admin.js";
import { handleApiError, methodNotAllowed, readJsonBody, sendJson } from "../_lib/http.js";
import {
  getShirtAvailability,
  sanitizeRegistration,
  savePendingPixPayment,
} from "../_lib/voucher.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    methodNotAllowed(response, ["POST"]);
    return;
  }

  try {
    const user = await getAuthenticatedUser(request);
    const body = await readJsonBody(request);
    const shirtAvailability = await getShirtAvailability();
    const registration = sanitizeRegistration(body.registration, {
      availableShirtSizes: Object.entries(shirtAvailability.sizes)
        .filter(([, available]) => available)
        .map(([size]) => size),
    });
    const payment = await createPixOrder({ user, registration });
    await savePendingPixPayment({
      user,
      orderId: payment.orderId,
      registration,
      amount: payment.amount,
    });
    sendJson(response, 201, payment);
  } catch (error) {
    handleApiError(response, error);
  }
}
