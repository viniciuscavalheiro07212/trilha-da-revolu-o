import { assertOrderBelongsToUser, getPixOrder, publicOrderStatus } from "../_lib/mercadopago.js";
import { getAuthenticatedUser } from "../_lib/supabase-admin.js";
import { handleApiError, methodNotAllowed, queryParam, sendJson } from "../_lib/http.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    methodNotAllowed(response, ["GET"]);
    return;
  }

  try {
    const user = await getAuthenticatedUser(request);
    const order = await getPixOrder(queryParam(request, "id"));
    assertOrderBelongsToUser(order, user.id);
    sendJson(response, 200, publicOrderStatus(order));
  } catch (error) {
    handleApiError(response, error);
  }
}
