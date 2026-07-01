// Menu de usuario compartilhado entre a home e a pagina de inscricao.
// Quando logado, o cabecalho mostra o nome + avatar; ao clicar, abre um
// dropdown com "Meus vouchers" e "Sair".

// undefined = renderUserMenu ainda nao rodou; null = deslogado.
let lastSession;

function sessionName(session) {
  return (
    session?.user?.user_metadata?.full_name ||
    session?.user?.user_metadata?.name ||
    session?.user?.email ||
    "Minha conta"
  );
}

function firstName(name) {
  return String(name).trim().split(/\s+/)[0] || String(name);
}

export function closeUserMenus() {
  document.querySelectorAll(".auth-user-menu").forEach((menu) => {
    if (!menu.hidden) menu.hidden = true;
  });
  document.querySelectorAll(".auth-user-trigger").forEach((trigger) => {
    if (trigger.getAttribute("aria-expanded") !== "false") {
      trigger.setAttribute("aria-expanded", "false");
    }
  });
}

// Aplica o estado de auth do cabecalho (menu de usuario, botoes de login/
// logout e link de vouchers). O runtime da home re-renderiza o cabecalho a
// partir do template <x-dc> depois deste script, descartando atributos e
// classes aplicados via JS — por isso o estado vive em lastSession e esta
// funcao e re-executada pelo MutationObserver apos cada re-renderizacao.
// Idempotente: so escreve no DOM quando o valor difere, para nao realimentar
// o proprio observer.
function applyUserMenuState() {
  if (lastSession === undefined) return;

  const isLoggedIn = Boolean(lastSession);

  document.querySelectorAll(".auth-user").forEach((menu) => {
    menu.classList.toggle("is-authenticated", isLoggedIn);
    if (menu.hidden === isLoggedIn) menu.hidden = !isLoggedIn;
  });

  document.querySelectorAll(".auth-login-button").forEach((button) => {
    if (button.hidden !== isLoggedIn) button.hidden = isLoggedIn;
  });
  document.querySelectorAll(".auth-logout-button").forEach((button) => {
    if (button.hidden === isLoggedIn) button.hidden = !isLoggedIn;
  });
  document.querySelectorAll(".auth-vouchers-link").forEach((link) => {
    if (link.hidden === isLoggedIn) link.hidden = !isLoggedIn;
  });

  if (!isLoggedIn) {
    closeUserMenus();
    return;
  }

  const name = firstName(sessionName(lastSession));
  const initial = name.charAt(0).toUpperCase();

  document.querySelectorAll(".auth-user-name").forEach((el) => {
    if (el.textContent !== name) el.textContent = name;
  });
  document.querySelectorAll(".auth-user-avatar").forEach((el) => {
    if (el.textContent !== initial) el.textContent = initial;
  });
}

export function initUserMenuToggle() {
  // Registrado uma unica vez. Usa event delegation no document porque o
  // cabecalho da home e renderizado por um framework depois deste script,
  // entao os elementos podem ainda nao existir agora.
  if (document.body.dataset.userMenuGlobalBound === "1") return;
  document.body.dataset.userMenuGlobalBound = "1";

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest(".auth-user-trigger");

    if (trigger) {
      const menu = trigger.parentElement.querySelector(".auth-user-menu");
      if (!menu) return;

      const willOpen = menu.hidden;
      closeUserMenus();
      menu.hidden = !willOpen;
      trigger.setAttribute("aria-expanded", String(willOpen));
      return;
    }

    // Clique fora do menu: fecha (a menos que seja dentro do proprio dropdown).
    if (!event.target.closest(".auth-user-menu")) {
      closeUserMenus();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeUserMenus();
  });

  // Re-aplica o estado quando o runtime da home re-renderiza o cabecalho
  // (nos recriados ou atributos hidden/class resetados pelo template).
  new MutationObserver(() => applyUserMenuState()).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden", "class"],
  });
}

export function renderUserMenu(session) {
  lastSession = session || null;
  applyUserMenuState();
}
