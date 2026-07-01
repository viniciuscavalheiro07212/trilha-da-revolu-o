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
// Event delegation no document: o runtime da home re-renderiza o cabecalho a
// partir do template <x-dc> e listeners presos direto nos botoes se perdem.
export function bindAuthButtons({ onLoginError, onLogoutError, afterLogout } = {}) {
  if (document.body.dataset.authButtonsBound === "1") return;
  document.body.dataset.authButtonsBound = "1";

  document.addEventListener("click", async (event) => {
    if (event.target.closest(".auth-login-button")) {
      // Nao passar o evento para loginWithGoogle: entraria como redirectTo.
      const { error } = await loginWithGoogle();
      if (error && onLoginError) onLoginError(error);
      return;
    }

    if (event.target.closest(".auth-logout-button")) {
      const { error } = await logoutFromGoogle();

      if (error) {
        if (onLogoutError) onLogoutError(error);
        return;
      }

      if (afterLogout) afterLogout();
    }
  });
}
