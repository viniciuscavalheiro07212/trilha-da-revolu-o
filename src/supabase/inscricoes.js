import { supabase } from "./client.js";

export async function criarInscricao(dados) {
  if (!supabase) {
    throw new Error("Supabase nao configurado. Verifique as variaveis de ambiente.");
  }

  const { error } = await supabase
    .from("inscricoes")
    .insert(dados);

  if (error) throw error;
  return true;
}
