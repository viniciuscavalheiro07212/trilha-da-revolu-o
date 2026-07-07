import { supabase } from "./client.js";

export async function criarInscricao(dados) {
  if (!supabase) {
    throw new Error("Supabase nao configurado. Verifique as variaveis de ambiente.");
  }

  const { data, error } = await supabase.rpc("criar_inscricao_publica", { dados });

  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function listarMinhasInscricoes() {
  if (!supabase) {
    throw new Error("Supabase nao configurado. Verifique as variaveis de ambiente.");
  }

  // Filtra pelo usuario logado: sem isso, contas que tambem sao validadoras
  // (policy de SELECT liberada para a tabela toda) veriam vouchers de todos.
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const userId = sessionData?.session?.user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from("inscricoes")
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
      created_at
    `,
    )
    .eq("usuario_id", userId)
    .order("numero_inscricao", { ascending: false });

  if (error) throw error;

  return (data || []).map((inscricao) => ({
    ...inscricao,
    comprovante: inscricao.comprovante_url,
  }));
}
