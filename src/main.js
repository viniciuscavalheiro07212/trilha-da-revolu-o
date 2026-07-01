import { supabase } from "./supabase/client.js";
import { initUserMenuToggle, renderUserMenu } from "./user-menu.js";
import { bindAuthButtons, loginWithGoogle } from "./auth.js";

const signupLinks = document.querySelectorAll("a[href^='inscricao.html']");

const signupUrl = `${window.location.origin}/inscricao.html`;

initUserMenuToggle();
bindAuthButtons();

signupLinks.forEach((link) => {
  link.addEventListener("click", async (event) => {
    if (!supabase) return;

    // Respeita abrir em nova aba/janela (ctrl/cmd/shift + clique ou botao do meio).
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0)
      return;

    // Bloqueia a navegacao imediatamente (sincronamente). So depois de checar
    // a sessao decidimos: ir direto para a inscricao ou para o login do Google.
    event.preventDefault();

    const destino = link.href;

    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.error(error);
      window.location.href = destino;
      return;
    }

    if (data?.session) {
      // Ja esta logado -> vai direto para a inscricao.
      window.location.href = destino;
      return;
    }

    // Nao esta logado -> login com Google e, apos logar, volta para a inscricao.
    await loginWithGoogle(signupUrl);
  });
});

if (supabase) {
  const { data, error } = await supabase.auth.getSession();
  if (error) console.error(error);

  renderUserMenu(data?.session || null);
  supabase.auth.onAuthStateChange((_event, session) => renderUserMenu(session));
} else {
  renderUserMenu(null);
}

window.appServices = {
  supabase,
};
