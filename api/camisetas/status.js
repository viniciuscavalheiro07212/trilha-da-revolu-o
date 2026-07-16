import { handleApiError, methodNotAllowed, sendJson } from "../_lib/http.js";
import { getShirtAvailability } from "../_lib/voucher.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    methodNotAllowed(response, ["GET"]);
    return;
  }

  try {
    const availability = await getShirtAvailability();
    sendJson(response, 200, availability);
  } catch (error) {
    handleApiError(response, error);
  }
}
