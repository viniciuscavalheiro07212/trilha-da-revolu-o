import { supabase } from "./supabase/client.js";
import { initUserMenuToggle, renderUserMenu } from "./user-menu.js";
import { bindAuthButtons, loginWithGoogle } from "./auth.js";
import { initCarousel } from "./carousel.js";

const signupUrl = `${window.location.origin}/inscricao.html`;

initUserMenuToggle();
bindAuthButtons();
initCarousel();

// Qualquer link/botao que leve a pagina de inscricao: sem login, vai direto
// para o login com Google. Delegation no document porque o runtime da home
// re-renderiza o conteudo do <x-dc> e listeners diretos se perderiam.
document.addEventListener("click", async (event) => {
  const link = event.target.closest("a[href^='inscricao.html']");
  if (!link || !supabase) return;

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
