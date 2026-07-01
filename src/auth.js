// Autenticacao Google compartilhada entre a home e a pagina de inscricao.
// A visibilidade dos controles de auth do cabecalho fica em user-menu.js
// (renderUserMenu); aqui vive apenas o fluxo de login/logout.

import { supabase } from "./supabase/client.js";

export const RETURN_TAB_KEY = "trilha-return-tab";

export async function loginWithGoogle(
  redirectTo = `${window.location.origin}${window.location.pathname}`,
) {
  if (!supabase) {
    return { error: new Error("Supabase nao configurado. Verifique as variaveis de ambiente.") };
  }

  sessionStorage.setItem(RETURN_TAB_KEY, "inscricao");

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
    },
  });

  if (error) console.error(error);
  return { error };
}

export async function logoutFromGoogle() {
  if (!supabase) return { error: null };

  const { error } = await supabase.auth.signOut();
  if (error) console.error(error);
  return { error };
}

// Liga os botoes de login/logout do cabecalho. Os callbacks sao opcionais e
// permitem que cada pagina mostre suas proprias mensagens de status.
export function bindAuthButtons({ onLoginError, onLogoutError, afterLogout } = {}) {
  document.querySelectorAll(".auth-login-button").forEach((button) => {
    // Nao passar loginWithGoogle direto: o evento de clique entraria como redirectTo.
    button.addEventListener("click", async () => {
      const { error } = await loginWithGoogle();
      if (error && onLoginError) onLoginError(error);
    });
  });

  document.querySelectorAll(".auth-logout-button").forEach((button) => {
    button.addEventListener("click", async () => {
      const { error } = await logoutFromGoogle();

      if (error) {
        if (onLogoutError) onLogoutError(error);
        return;
      }

      if (afterLogout) afterLogout();
    });
  });
}
