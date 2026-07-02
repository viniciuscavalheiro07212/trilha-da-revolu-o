import { supabase } from "./client.js";

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase nao configurado. Verifique as variaveis de ambiente.");
  }
}

export async function souValidador() {
  requireSupabase();

  const { data, error } = await supabase.rpc("is_validador");

  if (error) throw error;
  return data === true;
}

export async function validarVoucher(codigo) {
  requireSupabase();

  const { data, error } = await supabase.rpc("validar_voucher", { codigo });

  if (error) throw error;
  return data;
}

export async function desfazerValidacao(codigo) {
  requireSupabase();

  const { data, error } = await supabase.rpc("desfazer_validacao", { codigo });

  if (error) throw error;
  return data;
}

export async function listarTodasInscricoes() {
  requireSupabase();

  const { data, error } = await supabase
    .from("inscricoes")
    .select(
      `
      nome_completo,
      telefone,
      grupo,
      cidade,
      veiculo,
      tamanho_camiseta,
      voucher_codigo,
      numero_inscricao,
      camiseta_garantida,
      validado_em,
      validado_por,
      created_at
    `,
    )
    .order("numero_inscricao", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function carregarValorInscricao() {
  requireSupabase();

  const { data, error } = await supabase
    .from("evento_config")
    .select("valor_inscricao")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw error;
  return data ? Number(data.valor_inscricao) : null;
}

export async function salvarValorInscricao(valor) {
  requireSupabase();

  const { error } = await supabase
    .from("evento_config")
    .update({ valor_inscricao: valor })
    .eq("id", 1);

  if (error) throw error;
}
