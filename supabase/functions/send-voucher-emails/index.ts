import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import QRCode from "qrcode";

const resendEndpoint = "https://api.resend.com/emails";
const voucherQrContentId = "voucher-qr-code";
const approvedPaymentStatuses = ["approved", "processed", "completed"];
const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_URL") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ??
      character,
  );
}

function makeHtmlEncodingSafe(value: string) {
  return value.replace(/[^\u0000-\u007f]/gu, (character) => `&#${character.codePointAt(0)};`);
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function formatPhone(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return String(value || "-");
}

function voucherQrPayload(voucher: Record<string, unknown>) {
  return JSON.stringify({
    evento: "VIII Trilha da Revolucao",
    voucher: voucher.voucher_codigo,
    inscricao: voucher.numero_inscricao || null,
    nome: voucher.nome_completo,
    telefone: voucher.telefone,
    validacao: "pendente",
  });
}

async function voucherQrCodeBase64(voucher: Record<string, unknown>) {
  const dataUrl = await QRCode.toDataURL(voucherQrPayload(voucher), {
    type: "image/png",
    width: 240,
    margin: 1,
    errorCorrectionLevel: "M",
  });
  const prefix = "data:image/png;base64,";
  if (!dataUrl.startsWith(prefix)) throw new Error("Falha ao gerar o QR Code do voucher.");
  return dataUrl.slice(prefix.length);
}

function voucherEmailHtml(voucher: Record<string, unknown>) {
  const siteUrl = Deno.env.get("SITE_URL")?.replace(/\/$/, "");
  const voucherUrl = siteUrl ? `${siteUrl}/inscricao.html?vouchers=1` : "";
  const voucherCode = escapeHtml(voucher.voucher_codigo);
  const rows = [
    ["Inscricao", voucher.numero_inscricao || "Em processamento"],
    ["Nome", voucher.nome_completo],
    ["Telefone", formatPhone(voucher.telefone)],
    ["CPF", voucher.cpf],
    ["Grupo", voucher.grupo],
    ["Cidade", voucher.cidade],
    ["Veiculo", voucher.veiculo],
    ["Camiseta", voucher.tamanho_camiseta],
    ["Emitido em", formatDate(String(voucher.voucher_emitido_em || ""))],
  ]
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#64748b">${escapeHtml(label)}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#0f172a">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  return makeHtmlEncodingSafe(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
</head>
<body style="margin:0;background:#111111;font-family:Arial,sans-serif;color:#191919">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#111111;padding:28px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#f8f6ed;border-radius:16px;overflow:hidden">
      <tr><td style="padding:28px 32px;background:#0b0b0c;border-bottom:4px solid #f4c20d;text-align:center">
        <div style="color:#f4c20d;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase">Pagamento confirmado</div>
        <h1 style="margin:10px 0 0;color:#ffffff;font-size:27px;line-height:1.1">VIII Trilha da Revolução</h1>
      </td></tr>
      <tr><td style="padding:30px 32px 12px;text-align:center">
        <p style="margin:0;color:#494949;font-size:16px;line-height:1.5">Olá, <strong>${escapeHtml(voucher.nome_completo)}</strong>! Seu pagamento foi aprovado e sua inscrição está confirmada.</p>
      </td></tr>
      <tr><td style="padding:18px 32px;text-align:center">
        <div style="padding:18px;border:1px solid #d8d2c1;border-radius:12px;background:#ffffff">
          <div style="color:#717171;font-size:11px;font-weight:700;letter-spacing:1.5px">CÓDIGO DO VOUCHER</div>
          <div style="margin-top:6px;color:#111111;font-size:25px;font-weight:700;letter-spacing:1px">${voucherCode}</div>
          <img src="cid:${voucherQrContentId}" width="180" height="180" alt="QR Code do voucher ${voucherCode}" style="display:block;width:180px;height:180px;margin:18px auto 6px;border:0" />
          <div style="color:#606060;font-size:13px;line-height:1.4">Apresente este QR Code no credenciamento.</div>
        </div>
      </td></tr>
      <tr><td style="padding:8px 32px 14px">
        <h2 style="margin:0;color:#111111;font-size:17px">Dados da inscrição</h2>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:10px;border:1px solid #ded8c9;border-radius:10px;overflow:hidden;background:#ffffff">${rows}</table>
      </td></tr>
      ${voucher.camiseta_garantida ? '<tr><td style="padding:0 32px 14px"><div style="padding:14px;border-radius:10px;background:#188a3a;color:#ffffff;font-size:14px;font-weight:700;line-height:1.4">Camiseta garantida para esta inscrição. Retire-a no credenciamento.</div></td></tr>' : ""}
      <tr><td style="padding:8px 32px 30px;text-align:center">
        <p style="margin:0 0 18px;color:#555555;font-size:14px;line-height:1.5">Para retirar a pulseira, leve este voucher, 1 kg de alimento não perecível e um agasalho.</p>
        ${voucherUrl ? `<a href="${escapeHtml(voucherUrl)}" style="display:inline-block;padding:14px 22px;border-radius:8px;background:#f4c20d;color:#111111;font-size:14px;font-weight:700;text-decoration:none">ABRIR MEUS VOUCHERS</a>` : ""}
        <p style="margin:22px 0 0;color:#555555;font-size:14px;line-height:1.5">Precisa de ajuda? Fale com a organização pelo WhatsApp:<br><a href="https://wa.me/5551993725451" style="color:#188a3a;font-weight:700;text-decoration:none">+55 (51) 99372-5451</a></p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`);
}

async function sendVoucherEmail(voucher: Record<string, unknown>) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("VOUCHER_EMAIL_FROM");
  const replyTo = Deno.env.get("VOUCHER_EMAIL_REPLY_TO");
  if (!apiKey || !from) throw new Error("RESEND_API_KEY ou VOUCHER_EMAIL_FROM nao configurado.");
  const qrCodeBase64 = await voucherQrCodeBase64(voucher);

  const response = await fetch(resendEndpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [voucher.usuario_email],
      subject: `Voucher ${voucher.voucher_codigo} - VIII Trilha da Revolucao`,
      html: voucherEmailHtml(voucher),
      attachments: [
        {
          content: qrCodeBase64,
          filename: "voucher-qr-code.png",
          content_id: voucherQrContentId,
          content_type: "image/png",
        },
      ],
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.error || "Falha ao enviar email.");
  return payload;
}

function sendJson(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

function getPublishableKey() {
  const legacyKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (legacyKey) return legacyKey;

  const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
  return keys.default || Object.values(keys)[0];
}

async function sendTestVoucherEmail(request: Request, supabaseUrl: string) {
  const allowedRecipient = Deno.env.get("VOUCHER_EMAIL_TEST_RECIPIENT")?.trim().toLowerCase();
  if (!allowedRecipient) {
    return sendJson(
      { error: "Configure VOUCHER_EMAIL_TEST_RECIPIENT nos segredos da Edge Function." },
      503,
    );
  }

  const authorization = request.headers.get("Authorization");
  const publishableKey = getPublishableKey();
  if (!authorization || !publishableKey) {
    return sendJson({ error: "Login necessario para enviar o email de teste." }, 401);
  }

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: String(publishableKey) },
  });
  const user = await userResponse.json().catch(() => ({}));
  const recipient = String(user?.email || "")
    .trim()
    .toLowerCase();

  if (!userResponse.ok || !recipient) {
    return sendJson({ error: "Nao foi possivel confirmar a conta logada." }, 401);
  }

  if (recipient !== allowedRecipient) {
    return sendJson({ error: "Esta conta nao esta autorizada a enviar emails de teste." }, 403);
  }

  try {
    const result = await sendVoucherEmail({
      voucher_codigo: "TESTE-EMAIL",
      usuario_email: recipient,
      nome_completo: user.user_metadata?.full_name || "Cliente de teste",
      telefone: "51999999999",
      cpf: "000.000.000-00",
      grupo: "Grupo demonstracao",
      cidade: "Gravatai - RS",
      veiculo: "Motocicleta",
      tamanho_camiseta: "M",
      numero_inscricao: "TESTE",
      camiseta_garantida: true,
      voucher_emitido_em: new Date().toISOString(),
    });
    return sendJson({ sent: true, emailId: result?.id || null });
  } catch (error) {
    return sendJson({ error: String(error?.message || "Falha ao enviar email de teste.") }, 502);
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return sendJson({ error: "Metodo nao permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return sendJson({ error: "Configuracao Supabase ausente." }, 500);
  }

  const body = await request.json().catch(() => ({}));
  if (body?.mode === "test") return sendTestVoucherEmail(request, supabaseUrl);

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const now = new Date();
  const staleProcessingAt = new Date(now.getTime() - 10 * 60_000).toISOString();
  const { data: candidates, error } = await supabase
    .from("inscricoes")
    .select("voucher_codigo")
    .is("email_voucher_enviado_em", null)
    .lte("email_voucher_agendado_em", now.toISOString())
    .in("pagamento_status", approvedPaymentStatuses)
    .or(`email_voucher_processando_em.is.null,email_voucher_processando_em.lt.${staleProcessingAt}`)
    .limit(20);
  if (error) return sendJson({ error: error.message }, 500);

  let sent = 0;
  let failed = 0;
  for (const candidate of candidates || []) {
    const { data: voucher, error: claimError } = await supabase
      .from("inscricoes")
      .update({ email_voucher_processando_em: now.toISOString() })
      .eq("voucher_codigo", candidate.voucher_codigo)
      .is("email_voucher_enviado_em", null)
      .lte("email_voucher_agendado_em", now.toISOString())
      .in("pagamento_status", approvedPaymentStatuses)
      .or(
        `email_voucher_processando_em.is.null,email_voucher_processando_em.lt.${staleProcessingAt}`,
      )
      .select(
        "voucher_codigo, usuario_email, nome_completo, telefone, cpf, grupo, cidade, veiculo, tamanho_camiseta, numero_inscricao, camiseta_garantida, voucher_emitido_em",
      )
      .maybeSingle();

    if (claimError || !voucher) continue;
    try {
      await sendVoucherEmail(voucher);
      await supabase
        .from("inscricoes")
        .update({
          email_voucher_enviado_em: new Date().toISOString(),
          email_voucher_processando_em: null,
          email_voucher_erro: null,
        })
        .eq("voucher_codigo", voucher.voucher_codigo);
      sent += 1;
    } catch (sendError) {
      await supabase
        .from("inscricoes")
        .update({
          email_voucher_processando_em: null,
          email_voucher_agendado_em: new Date(Date.now() + 5 * 60_000).toISOString(),
          email_voucher_erro: String(sendError?.message || "Falha ao enviar email.").slice(0, 500),
        })
        .eq("voucher_codigo", voucher.voucher_codigo);
      failed += 1;
    }
  }

  return sendJson({ processed: (candidates || []).length, sent, failed });
});
