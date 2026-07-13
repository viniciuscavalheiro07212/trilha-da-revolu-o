import crypto from "node:crypto";
import { assertOrderBelongsToUser, getPixOrder, isOrderApproved } from "../_lib/mercadopago.js";
import { requireEnv } from "../_lib/env.js";
import {
  handleApiError,
  methodNotAllowed,
  queryParam,
  readJsonBody,
  sendJson,
} from "../_lib/http.js";
import { createPaidVoucher, getPendingPixPayment } from "../_lib/voucher.js";

function signaturePart(header, name) {
  for (const part of String(header || "").split(",")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;

    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === name) return value;
  }

  return "";
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");
  return (
    leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function validateWebhookSignature(request, dataId) {
  const secret = requireEnv("MERCADO_PAGO_WEBHOOK_SECRET");
  const xSignature = request.headers["x-signature"];
  const xRequestId = request.headers["x-request-id"];
  const ts = signaturePart(xSignature, "ts");
  const hash = signaturePart(xSignature, "v1");

  const parts = [];
  if (dataId) parts.push(`id:${dataId.toLowerCase()}`);
  if (xRequestId) parts.push(`request-id:${xRequestId}`);
  parts.push(`ts:${ts}`);

  const manifest = `${parts.join(";")};`;
  const computed = crypto.createHmac("sha256", secret).update(manifest).digest("hex");

  if (!hash || !safeEqual(computed, hash)) {
    const error = new Error("Assinatura do webhook invalida.");
    error.statusCode = 401;
    throw error;
  }
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    methodNotAllowed(response, ["POST"]);
    return;
  }

  try {
    const body = await readJsonBody(request);
    const orderId = queryParam(request, "data.id") || body?.data?.id;

    validateWebhookSignature(request, orderId);

    const pending = await getPendingPixPayment(orderId);
    if (!pending) {
      sendJson(response, 200, { received: true, voucher: null });
      return;
    }

    const user = {
      id: pending.usuario_id,
      email: pending.usuario_email,
    };
    const order = await getPixOrder(orderId);
    assertOrderBelongsToUser(order, user.id);

    if (isOrderApproved(order)) {
      const voucher = await createPaidVoucher({ user, order, registration: pending.dados });
      sendJson(response, 201, { received: true, voucher });
      return;
    }

    sendJson(response, 200, { received: true, voucher: null });
  } catch (error) {
    handleApiError(response, error);
  }
}
