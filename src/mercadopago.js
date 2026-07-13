import { supabase } from "./supabase/client.js";

async function authHeaders() {
  if (!supabase) {
    throw new Error("Supabase ainda nao esta configurado.");
  }

  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session?.access_token) {
    throw new Error("Faca login novamente para continuar.");
  }

  return {
    authorization: `Bearer ${data.session.access_token}`,
  };
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(await authHeaders()),
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const details = payload.details ? ` ${JSON.stringify(payload.details)}` : "";
    throw new Error(`${payload.error || "Nao foi possivel comunicar com o pagamento."}${details}`);
  }

  return payload;
}

export function criarPedidoPix(registration) {
  return requestJson("/api/mercadopago/create-pix-order", {
    method: "POST",
    body: JSON.stringify({ registration }),
  });
}

export function consultarPedidoPix(orderId) {
  return requestJson(`/api/mercadopago/order-status?id=${encodeURIComponent(orderId)}`, {
    method: "GET",
  });
}

export function confirmarVoucherPago(orderId) {
  return requestJson("/api/mercadopago/confirm-voucher", {
    method: "POST",
    body: JSON.stringify({ orderId }),
  });
}
