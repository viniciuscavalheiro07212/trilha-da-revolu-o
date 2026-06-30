import { supabase } from "./client.js";

export async function criarInscricao(dados) {
  if (!supabase) {
    throw new Error("Supabase nao configurado. Verifique as variaveis de ambiente.");
  }

  const { data, error } = await supabase.rpc("criar_inscricao_publica", { dados });

  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}
