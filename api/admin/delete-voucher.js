import { getAuthenticatedUser, getSupabaseAdmin } from "../_lib/supabase-admin.js";
import { handleApiError, methodNotAllowed, readJsonBody, sendJson } from "../_lib/http.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    methodNotAllowed(response, ["POST"]);
    return;
  }

  try {
    const user = await getAuthenticatedUser(request);
    const body = await readJsonBody(request);
    const voucherCode = String(body.voucherCode || "").trim().toUpperCase();

    if (body.confirm !== true || !/^TR-[A-Z0-9]+$/.test(voucherCode)) {
      const error = new Error("Confirmacao ou codigo de voucher invalido.");
      error.statusCode = 400;
      throw error;
    }

    const supabase = getSupabaseAdmin();
    const { data: validator, error: validatorError } = await supabase
      .from("validadores")
      .select("email")
      .eq("email", String(user.email || "").toLowerCase())
      .maybeSingle();

    if (validatorError) throw validatorError;
    if (!validator) {
      const error = new Error("Acesso restrito a validadores.");
      error.statusCode = 403;
      throw error;
    }

    const { data: voucher, error: voucherError } = await supabase
      .from("inscricoes")
      .select("id, voucher_codigo, mercado_pago_order_id")
      .eq("voucher_codigo", voucherCode)
      .maybeSingle();

    if (voucherError) throw voucherError;
    if (!voucher) {
      const error = new Error("Voucher nao encontrado.");
      error.statusCode = 404;
      throw error;
    }

    const { error: deleteError } = await supabase.from("inscricoes").delete().eq("id", voucher.id);
    if (deleteError) throw deleteError;

    if (voucher.mercado_pago_order_id) {
      const { error: paymentError } = await supabase
        .from("pagamentos_pix_pendentes")
        .update({ status: "voucher-excluido", updated_at: new Date().toISOString() })
        .eq("mercado_pago_order_id", voucher.mercado_pago_order_id);

      if (paymentError) throw paymentError;
    }

    sendJson(response, 200, { deleted: true, voucherCode });
  } catch (error) {
    handleApiError(response, error);
  }
}
