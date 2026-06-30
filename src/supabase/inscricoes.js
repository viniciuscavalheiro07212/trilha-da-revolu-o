import { supabase } from "./client.js";

export async function criarInscricao(dados) {
  if (!supabase) {
    throw new Error("Supabase nao configurado. Verifique as variaveis de ambiente.");
  }

  const { data, error } = await supabase
    .from("inscricoes")
    .insert(dados)
    .select("id, voucher_codigo, created_at")
    .single();

  if (error) throw error;
  return data;
}
