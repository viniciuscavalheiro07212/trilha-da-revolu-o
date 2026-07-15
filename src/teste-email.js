import { bindAuthButtons, loginWithGoogle } from "./auth.js";
import { isSupabaseConfigured, supabase } from "./supabase/client.js";
import { initUserMenuToggle, renderUserMenu } from "./user-menu.js";

const account = document.querySelector("#test-account");
const button = document.querySelector("#send-test-email");
const status = document.querySelector("#test-email-status");
let currentSession = null;

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("is-error", isError);
}

function renderPage() {
  renderUserMenu(currentSession);
  const email = currentSession?.user?.email;
  button.disabled = !email;
  account.textContent = email || "Entre com a conta autorizada para enviar o teste.";
}

async function loadSession() {
  if (!isSupabaseConfigured || !supabase) {
    setStatus("Supabase nao configurado.", true);
    return;
  }

  const { data } = await supabase.auth.getSession();
  currentSession = data.session;
  renderPage();
}

button.addEventListener("click", async () => {
  if (!currentSession || !supabase) {
    const { error } = await loginWithGoogle();
    if (error) setStatus("Nao foi possivel iniciar o login com Google.", true);
    return;
  }

  button.disabled = true;
  setStatus("Enviando e-mail de teste...");

  try {
    const { data, error } = await supabase.functions.invoke("send-voucher-emails", {
      body: { mode: "test" },
    });
    if (error || !data?.sent) throw new Error(data?.error || error?.message || "Falha ao enviar teste.");
    setStatus("E-mail de teste enviado. Confira sua caixa de entrada.");
  } catch (error) {
    setStatus(String(error?.message || "Nao foi possivel enviar o e-mail de teste."), true);
  } finally {
    button.disabled = false;
  }
});

bindAuthButtons({
  onLoginError: () => setStatus("Nao foi possivel iniciar o login com Google.", true),
  onLogoutError: () => setStatus("Nao foi possivel sair da conta agora.", true),
  afterLogout: () => {
    currentSession = null;
    renderPage();
  },
});

initUserMenuToggle();
supabase?.auth.onAuthStateChange((_event, session) => {
  currentSession = session;
  renderPage();
});
loadSession();
