import crypto from "node:crypto";
import { requireEnv } from "./env.js";

const MERCADO_PAGO_API = "https://api.mercadopago.com";

export function pixAmount() {
  return Number(process.env.MERCADO_PAGO_PIX_AMOUNT || "100").toFixed(2);
}

function pixExpirationMs() {
  const value = String(process.env.MERCADO_PAGO_PIX_EXPIRATION || "PT30M");
  const match = /^PT(\d+)M$/i.exec(value);
  return Number(match?.[1] || 30) * 60 * 1000;
}

export function pixExpirationAt(createdAt = new Date()) {
  return new Date(new Date(createdAt).getTime() + pixExpirationMs());
}

function isTestEnvironment() {
  return String(process.env.MERCADO_PAGO_ENV || "").toLowerCase() === "test";
}

function payerEmail(user) {
  if (isTestEnvironment()) {
    return process.env.MERCADO_PAGO_TEST_PAYER_EMAIL || "test_user_br@testuser.com";
  }

  return user.email;
}

function payerFirstName(registration) {
  if (isTestEnvironment()) {
    return "APRO";
  }

  return String(registration.nome_completo || "").split(" ")[0] || undefined;
}

function userReferenceHash(userId) {
  return crypto.createHash("sha256").update(String(userId)).digest("hex").slice(0, 16);
}

export function externalReferenceForUser(userId) {
  const randomPart = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  return `trilha-${userReferenceHash(userId)}-${randomPart}`;
}

export function assertOrderBelongsToUser(order, userId) {
  if (!String(order.external_reference || "").startsWith(`trilha-${userReferenceHash(userId)}-`)) {
    const error = new Error("Pagamento nao pertence a esta conta.");
    error.statusCode = 403;
    throw error;
  }
}

export function getOrderPayment(order) {
  const payments = order?.transactions?.payments;
  return Array.isArray(payments) ? payments[0] : null;
}

export function isOrderApproved(order) {
  const payment = getOrderPayment(order);
  return (
    payment?.status === "approved" || ["approved", "processed", "completed"].includes(order?.status)
  );
}

export function publicOrderStatus(order) {
  const payment = getOrderPayment(order);
  return {
    id: order.id,
    status: order.status || null,
    statusDetail: order.status_detail || null,
    paymentStatus: payment?.status || null,
    paymentStatusDetail: payment?.status_detail || null,
    approved: isOrderApproved(order),
  };
}

export function publicPixPayment(order) {
  const payment = getOrderPayment(order);
  const method = payment?.payment_method || {};

  return {
    orderId: order.id,
    status: publicOrderStatus(order),
    ticketUrl: method.ticket_url || null,
    qrCode: method.qr_code || null,
    qrCodeBase64: method.qr_code_base64 || null,
  };
}

async function mercadoPagoFetch(path, options = {}) {
  const accessToken = requireEnv("MERCADO_PAGO_ACCESS_TOKEN");
  const response = await fetch(`${MERCADO_PAGO_API}${path}`, {
    ...options,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload.message || payload.error || "Erro na API do Mercado Pago.";
    const error = new Error(message);
    error.statusCode = response.status >= 400 && response.status < 500 ? 400 : 502;
    error.details = payload;
    throw error;
  }

  return payload;
}

export async function createPixOrder({ user, registration }) {
  const amount = pixAmount();
  const externalReference = externalReferenceForUser(user.id);

  const order = await mercadoPagoFetch("/v1/orders", {
    method: "POST",
    headers: {
      "x-idempotency-key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      type: "online",
      total_amount: amount,
      external_reference: externalReference,
      processing_mode: "automatic",
      transactions: {
        payments: [
          {
            amount,
            payment_method: {
              id: "pix",
              type: "bank_transfer",
            },
            expiration_time: process.env.MERCADO_PAGO_PIX_EXPIRATION || "PT30M",
          },
        ],
      },
      payer: {
        email: payerEmail(user),
        first_name: payerFirstName(registration),
      },
    }),
  });

  return {
    ...publicPixPayment(order),
    amount,
    expiresAt: pixExpirationAt().toISOString(),
  };
}

export async function getPixOrder(orderId) {
  if (!orderId || !/^ORD[A-Z0-9]+$/i.test(orderId)) {
    const error = new Error("ID de pagamento invalido.");
    error.statusCode = 400;
    throw error;
  }

  return mercadoPagoFetch(`/v1/orders/${encodeURIComponent(orderId)}`, {
    method: "GET",
  });
}
