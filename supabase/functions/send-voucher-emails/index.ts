import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resendEndpoint = "https://api.resend.com/emails";
const approvedPaymentStatuses = ["approved", "processed", "completed"];
const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_URL") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ] ?? character,
  );
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function voucherEmailHtml(voucher: Record<string, unknown>) {
  const siteUrl = Deno.env.get("SITE_URL")?.replace(/\/$/, "");
  const voucherUrl = siteUrl ? `${siteUrl}/meus-vouchers.html` : "";
  const rows = [
    ["Inscricao", voucher.numero_inscricao || "Em processamento"],
    ["Nome", voucher.nome_completo],
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

  return `<!doctype html>
<html lang="pt-BR"><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a">
  <main style="max-width:600px;margin:24px auto;background:#ffffff;border:1px solid #e2e8f0;padding:32px">
    <h1 style="margin:0 0 8px;font-size:24px">VIII Trilha da Revolucao</h1>
    <p style="margin:0 0 24px;color:#475569">Pagamento confirmado. Seu voucher esta pronto.</p>
    <div style="padding:18px;background:#ecfdf5;border:1px solid #a7f3d0;text-align:center">
      <div style="font-size:12px;color:#047857">CODIGO DO VOUCHER</div>
      <strong style="font-size:24px;letter-spacing:1px">${escapeHtml(voucher.voucher_codigo)}</strong>
    </div>
    <table style="width:100%;border-collapse:collapse;margin:24px 0">${rows}</table>
    ${voucher.camiseta_garantida ? "<p style=\"color:#047857\">Camiseta garantida para esta inscricao.</p>" : ""}
    ${voucherUrl ? `<p style="margin-top:28px"><a href="${escapeHtml(voucherUrl)}" style="display:inline-block;padding:12px 18px;background:#0f766e;color:#fff;text-decoration:none">Abrir meus vouchers</a></p>` : ""}
  </main>
</body></html>`;
}

async function sendVoucherEmail(voucher: Record<string, unknown>) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("VOUCHER_EMAIL_FROM");
  const replyTo = Deno.env.get("VOUCHER_EMAIL_REPLY_TO");
  if (!apiKey || !from) throw new Error("RESEND_API_KEY ou VOUCHER_EMAIL_FROM nao configurado.");

  const response = await fetch(resendEndpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [voucher.usuario_email],
      subject: `Voucher ${voucher.voucher_codigo} - VIII Trilha da Revolucao`,
      html: voucherEmailHtml(voucher),
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
    return sendJson({ error: "Configure VOUCHER_EMAIL_TEST_RECIPIENT nos segredos da Edge Function." }, 503);
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
  const recipient = String(user?.email || "").trim().toLowerCase();

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
      .or(`email_voucher_processando_em.is.null,email_voucher_processando_em.lt.${staleProcessingAt}`)
      .select("voucher_codigo, usuario_email, nome_completo, cpf, grupo, cidade, veiculo, tamanho_camiseta, numero_inscricao, camiseta_garantida, voucher_emitido_em")
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
