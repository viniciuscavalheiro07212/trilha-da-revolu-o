import crypto from "node:crypto";
import { getSupabaseAdmin } from "./supabase-admin.js";
import { getOrderPayment } from "./mercadopago.js";

const requiredFields = [
  "nome_completo",
  "telefone",
  "cpf",
  "tipo_sanguineo",
  "grupo",
  "cidade",
  "veiculo",
];

export const SHIRT_STOCK = Object.freeze({
  P: 15,
  M: 30,
  G: 56,
  GG: 59,
  G1: 25,
  G2: 11,
  G3: 4,
});
export const SHIRT_SIZES = Object.freeze(Object.keys(SHIRT_STOCK));
export const PRIVACY_POLICY_VERSION = "2026-07-16";

export async function getShirtAvailability() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("camiseta_estoque")
    .select("tamanho, limite, reservadas");

  if (error) throw error;

  const stockBySize = new Map(
    (data || []).map((item) => [String(item.tamanho || "").toUpperCase(), item]),
  );
  const sizes = Object.fromEntries(
    SHIRT_SIZES.map((size) => {
      const stock = stockBySize.get(size);
      return [size, Boolean(stock && Number(stock.reservadas) < Number(stock.limite))];
    }),
  );
  return {
    available: Object.values(sizes).some(Boolean),
    sizes,
  };
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function cleanText(value, maxLength = 160) {
  return String(value || "")
    .trim()
    .slice(0, maxLength);
}

export function sanitizeRegistration(input = {}, { availableShirtSizes = [] } = {}) {
  const tipoSanguineo = cleanText(input.tipo_sanguineo, 20);
  const data = {
    nome_completo: cleanText(input.nome_completo, 180),
    telefone: onlyDigits(input.telefone),
    cpf: onlyDigits(input.cpf),
    tipo_sanguineo: tipoSanguineo,
    tamanho_camiseta: cleanText(input.tamanho_camiseta, 20),
    grupo: cleanText(input.grupo, 120),
    cidade: cleanText(input.cidade, 120),
    veiculo: cleanText(input.veiculo, 40),
    observacoes: cleanText(input.observacoes, 500),
    solidaria: input.solidaria === true,
    termos: input.termos === true,
    privacidade_aceita_em: input.privacidade === true ? new Date().toISOString() : null,
    consentimento_saude_aceito_em:
      tipoSanguineo && tipoSanguineo !== "Nao sei" ? new Date().toISOString() : null,
    politica_privacidade_versao: PRIVACY_POLICY_VERSION,
  };

  for (const field of requiredFields) {
    if (!data[field]) {
      const error = new Error("Preencha todos os campos obrigatorios antes do pagamento.");
      error.statusCode = 400;
      throw error;
    }
  }

  data.tamanho_camiseta = data.tamanho_camiseta.toUpperCase();
  const hasShirtsAvailable = availableShirtSizes.length > 0;

  if (hasShirtsAvailable && !data.tamanho_camiseta) {
    const error = new Error("Selecione o tamanho da camiseta.");
    error.statusCode = 400;
    throw error;
  }

  if (!hasShirtsAvailable) data.tamanho_camiseta = "";

  if (data.tamanho_camiseta && !SHIRT_SIZES.includes(data.tamanho_camiseta)) {
    const error = new Error("Selecione um tamanho de camiseta valido.");
    error.statusCode = 400;
    throw error;
  }

  if (data.tamanho_camiseta && !availableShirtSizes.includes(data.tamanho_camiseta)) {
    const error = new Error("Este tamanho de camiseta esta esgotado. Escolha outro tamanho.");
    error.statusCode = 409;
    throw error;
  }

  if (data.telefone.length < 8) {
    const error = new Error("Telefone invalido.");
    error.statusCode = 400;
    throw error;
  }

  if (!data.solidaria || !data.termos || !data.privacidade_aceita_em) {
    const error = new Error("Confirme os termos e o Aviso de Privacidade.");
    error.statusCode = 400;
    throw error;
  }

  return data;
}

function voucherCode({ user, order }) {
  const seed = `${user.id}-${order.id}-${Date.now()}-${crypto.randomUUID()}`;
  const hash = crypto.createHash("sha256").update(seed).digest("hex").slice(0, 9).toUpperCase();
  return `TR-${hash}`;
}

function approvedPaymentStatus(order, payment) {
  if (payment?.status === "approved") return "approved";
  if (["approved", "processed", "completed"].includes(order?.status)) return order.status;
  return payment?.status || order?.status || "approved";
}

export async function createPaidVoucher({ user, order, registration }) {
  const supabase = getSupabaseAdmin();
  const payment = getOrderPayment(order);

  const { data: existing, error: existingError } = await supabase
    .from("inscricoes")
    .select(
      `
      usuario_id,
      usuario_email,
      nome_completo,
      telefone,
      cpf,
      tipo_sanguineo,
      grupo,
      cidade,
      tamanho_camiseta,
      veiculo,
      comprovante_url,
      observacoes,
      solidaria,
      termos,
      voucher_codigo,
      voucher_emitido_em,
      status,
      numero_inscricao,
      camiseta_garantida,
      mercado_pago_order_id,
      mercado_pago_payment_id,
      pagamento_status,
      pago_em,
      email_voucher_agendado_em,
      email_voucher_processando_em,
      email_voucher_enviado_em,
      email_voucher_erro,
      created_at
    `,
    )
    .eq("mercado_pago_order_id", order.id)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) {
    if (existing.usuario_id && existing.usuario_id !== user.id) {
      const error = new Error("Este pagamento ja foi usado em outra conta.");
      error.statusCode = 403;
      throw error;
    }
    const voucher = { ...existing, comprovante: existing.comprovante_url };
    if (!voucher.email_voucher_enviado_em && !voucher.email_voucher_agendado_em) {
      const scheduledAt = voucherEmailScheduledAt();
      await supabase
        .from("inscricoes")
        .update({ email_voucher_agendado_em: scheduledAt, email_voucher_erro: null })
        .eq("voucher_codigo", voucher.voucher_codigo);
      voucher.email_voucher_agendado_em = scheduledAt;
      voucher.email_voucher_erro = null;
    }
    return voucher;
  }

  const voucher_emitido_em = new Date().toISOString();
  const email_voucher_agendado_em = voucherEmailScheduledAt();
  const row = {
    ...registration,
    usuario_id: user.id,
    usuario_email: user.email,
    comprovante_url: payment?.id || order.id,
    voucher_codigo: voucherCode({ user, order }),
    voucher_emitido_em,
    status: "voucher-gerado",
    mercado_pago_order_id: order.id,
    mercado_pago_payment_id: payment?.id || null,
    pagamento_status: approvedPaymentStatus(order, payment),
    pago_em: voucher_emitido_em,
    email_voucher_agendado_em,
  };

  const { data, error } = await supabase
    .from("inscricoes")
    .insert(row)
    .select(
      `
      nome_completo,
      telefone,
      cpf,
      tipo_sanguineo,
      grupo,
      cidade,
      tamanho_camiseta,
      veiculo,
      comprovante_url,
      observacoes,
      solidaria,
      termos,
      voucher_codigo,
      voucher_emitido_em,
      status,
      numero_inscricao,
      camiseta_garantida,
      mercado_pago_order_id,
      mercado_pago_payment_id,
      pagamento_status,
      pago_em,
      usuario_email,
      email_voucher_agendado_em,
      email_voucher_processando_em,
      email_voucher_enviado_em,
      email_voucher_erro,
      created_at
    `,
    )
    .single();

  if (error) throw error;

  await supabase
    .from("pagamentos_pix_pendentes")
    .update({ status: "voucher-gerado", updated_at: new Date().toISOString() })
    .eq("mercado_pago_order_id", order.id);

  return { ...data, comprovante: data.comprovante_url };
}

function voucherEmailScheduledAt() {
  return new Date(Date.now() + 60_000).toISOString();
}

export async function savePendingPixPayment({ user, orderId, registration, amount }) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("pagamentos_pix_pendentes").upsert(
    {
      mercado_pago_order_id: orderId,
      usuario_id: user.id,
      usuario_email: user.email,
      dados: registration,
      amount,
      status: "aguardando_pagamento",
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "mercado_pago_order_id",
    },
  );

  if (error) {
    if (error.message?.includes("pagamentos_pix_pendentes")) {
      const setupError = new Error(
        "Tabela de pagamentos pendentes ainda nao existe no Supabase. Rode o SQL atualizado no SQL Editor.",
      );
      setupError.statusCode = 500;
      throw setupError;
    }

    throw error;
  }
}

export async function getPendingPixPayment(orderId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("pagamentos_pix_pendentes")
    .select("mercado_pago_order_id, usuario_id, usuario_email, dados, amount, status")
    .eq("mercado_pago_order_id", orderId)
    .maybeSingle();

  if (error) throw error;
  return data;
}
