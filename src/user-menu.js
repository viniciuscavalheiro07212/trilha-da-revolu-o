// Menu de usuario compartilhado entre a home e a pagina de inscricao.
// Quando logado, o cabecalho mostra o nome + avatar; ao clicar, abre um
// dropdown com "Meus vouchers" e "Sair".

function sessionName(session) {
  return session?.user?.user_metadata?.full_name
    || session?.user?.user_metadata?.name
    || session?.user?.email
    || "Minha conta";
}

function firstName(name) {
  return String(name).trim().split(/\s+/)[0] || String(name);
}

export function closeUserMenus() {
  document.querySelectorAll(".auth-user-menu").forEach((menu) => {
    menu.hidden = true;
  });
  document.querySelectorAll(".auth-user-trigger").forEach((trigger) => {
    trigger.setAttribute("aria-expanded", "false");
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
}

export function renderUserMenu(session) {
  const isLoggedIn = Boolean(session);

  document.querySelectorAll(".auth-user").forEach((menu) => {
    menu.hidden = !isLoggedIn;
  });

  if (!isLoggedIn) {
    closeUserMenus();
    return;
  }

  const name = firstName(sessionName(session));
  const initial = name.charAt(0).toUpperCase();

  document.querySelectorAll(".auth-user-name").forEach((el) => {
    el.textContent = name;
  });
  document.querySelectorAll(".auth-user-avatar").forEach((el) => {
    el.textContent = initial;
  });
}
