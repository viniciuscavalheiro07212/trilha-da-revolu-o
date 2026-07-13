import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "./env.js";

let adminClient = null;

export function getSupabaseAdmin() {
  if (adminClient) return adminClient;

  adminClient = createClient(
    requireEnv("SUPABASE_URL", "VITE_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  return adminClient;
}

export function getBearerToken(request) {
  const authorization = request.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    const error = new Error("Login obrigatorio para iniciar o pagamento.");
    error.statusCode = 401;
    throw error;
  }
  return match[1];
}

export async function getAuthenticatedUser(request) {
  const token = getBearerToken(request);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) {
    const isApiKeyError = /api key|apikey|invalid key|unauthorized/i.test(error?.message || "");
    const authError = new Error(
      isApiKeyError
        ? "Chave secreta do Supabase invalida. Confira a SUPABASE_SERVICE_ROLE_KEY no .env."
        : "Sessao invalida ou expirada. Faca login novamente.",
    );
    authError.statusCode = 401;
    throw authError;
  }

  return data.user;
}
