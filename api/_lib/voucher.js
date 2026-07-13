import crypto from "node:crypto";
import { getSupabaseAdmin } from "./supabase-admin.js";
import { getOrderPayment } from "./mercadopago.js";

const requiredFields = [
  "nome_completo",
  "telefone",
  "cpf",
  "tipo_sanguineo",
  "tamanho_camiseta",
  "grupo",
  "cidade",
  "veiculo",
];

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function cleanText(value, maxLength = 160) {
  return String(value || "")
    .trim()
    .slice(0, maxLength);
}

export function sanitizeRegistration(input = {}) {
  const data = {
    nome_completo: cleanText(input.nome_completo, 180),
    telefone: onlyDigits(input.telefone),
    cpf: onlyDigits(input.cpf),
    tipo_sanguineo: cleanText(input.tipo_sanguineo, 20),
    tamanho_camiseta: cleanText(input.tamanho_camiseta, 20),
    grupo: cleanText(input.grupo, 120),
    cidade: cleanText(input.cidade, 120),
    veiculo: cleanText(input.veiculo, 40),
    observacoes: cleanText(input.observacoes, 500),
    solidaria: Boolean(input.solidaria),
    termos: Boolean(input.termos),
  };

  for (const field of requiredFields) {
    if (!data[field]) {
      const error = new Error("Preencha todos os campos obrigatorios antes do pagamento.");
      error.statusCode = 400;
      throw error;
    }
  }

  if (data.telefone.length < 8) {
    const error = new Error("Telefone invalido.");
    error.statusCode = 400;
    throw error;
  }

  if (!data.solidaria || !data.termos) {
    const error = new Error("Confirme os termos para gerar o pagamento.");
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

export async function createPaidVoucher({ user, order, registration }) {
  const supabase = getSupabaseAdmin();
  const payment = getOrderPayment(order);

  const { data: existing, error: existingError } = await supabase
    .from("inscricoes")
    .select(
      `
      usuario_id,
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
    return { ...existing, comprovante: existing.comprovante_url };
  }

  const voucher_emitido_em = new Date().toISOString();
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
    pagamento_status: payment?.status || order.status || "approved",
    pago_em: voucher_emitido_em,
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
