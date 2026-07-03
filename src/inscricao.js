import QRCode from "qrcode";
import { criarInscricao, listarMinhasInscricoes } from "./supabase/inscricoes.js";
import { isSupabaseConfigured, supabase } from "./supabase/client.js";
import { initUserMenuToggle, renderUserMenu } from "./user-menu.js";
import { bindAuthButtons, loginWithGoogle, RETURN_TAB_KEY } from "./auth.js";

const form = document.querySelector("#signup-form");
const panel = document.querySelector("#voucher-panel");
const status = document.querySelector("#form-status");
const tabButtons = document.querySelectorAll("[data-tab-target]");
const tabPanels = document.querySelectorAll(".tab-panel");
const vouchers = [];
let currentSession = null;

const eventInfo = {
  nome: "VIII Trilha da Revolucao",
  data: "19 de setembro de 2026",
  rota: "Gravatai -> Cidreira",
  largada: "08:00hs",
  investimento: "R$100,00",
};

function activateTab(target) {
  if (target === "inscricao" && !currentSession) {
    status.textContent = "Use o login no cabecalho para liberar a inscricao.";
  }

  tabButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tabTarget === target);
  });

  tabPanels.forEach((panelElement) => {
    panelElement.classList.toggle("is-active", panelElement.id === `tab-${target}`);
  });
}

function sessionName(session) {
  return (
    session?.user?.user_metadata?.full_name || session?.user?.email || "Conta Google conectada"
  );
}

function updateAuthUi(session) {
  currentSession = session;
  const isLoggedIn = Boolean(session);

  form.classList.toggle("is-locked", !isLoggedIn);
  Array.from(form.elements).forEach((element) => {
    element.disabled = !isLoggedIn;
  });

  // renderUserMenu tambem cuida da visibilidade dos botoes de login/logout e
  // do link de vouchers no cabecalho.
  renderUserMenu(session);

  status.textContent = isLoggedIn
    ? `Logado como ${sessionName(session)}. A inscricao esta liberada.`
    : "Use o login no cabecalho para liberar a inscricao.";
}

async function initAuth() {
  if (!supabase) {
    updateAuthUi(null);
    return;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error(error);
  }

  updateAuthUi(data?.session || null);

  if (data?.session) {
    await loadSavedVouchers();

    const params = new URLSearchParams(window.location.search);
    const returnTab = sessionStorage.getItem(RETURN_TAB_KEY);
    sessionStorage.removeItem(RETURN_TAB_KEY);

    activateTab(
      params.get("vouchers") === "1" || returnTab === "vouchers" ? "vouchers" : "inscricao",
    );
  } else {
    activateTab("inscricao");
  }

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "TOKEN_REFRESHED") return;

    updateAuthUi(session);

    if (!session) {
      vouchersLoadedForUserId = null;
      return;
    }

    // setTimeout evita chamar o Supabase dentro do callback de auth,
    // o que pode causar deadlock (recomendacao da propria documentacao).
    setTimeout(async () => {
      await loadSavedVouchers();

      if (sessionStorage.getItem(RETURN_TAB_KEY)) {
        sessionStorage.removeItem(RETURN_TAB_KEY);
        activateTab("inscricao");
      }
    }, 0);
  });
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function setFieldError(element, message) {
  const label = element.closest("label");
  if (!label) return;

  label.classList.add("is-invalid");

  const error = document.createElement("span");
  error.className = "field-error";
  error.textContent = message;
  label.appendChild(error);
}

function clearFieldErrors() {
  form.querySelectorAll(".field-error").forEach((element) => element.remove());
  form.querySelectorAll(".is-invalid").forEach((element) => element.classList.remove("is-invalid"));
}

// Todos os campos sao obrigatorios, exceto "observacoes".
const requiredFields = [
  ["nome_completo", "Preencha o nome completo."],
  ["telefone", "Preencha o telefone."],
  ["cpf", "Preencha o CPF."],
  ["tipo_sanguineo", "Selecione o tipo sanguineo."],
  ["tamanho_camiseta", "Selecione o tamanho da camiseta."],
  ["grupo", "Preencha o grupo que pertence."],
  ["cidade", "Preencha a cidade."],
  ["veiculo", "Selecione o veiculo."],
];

const requiredChecks = [
  ["solidaria", "Voce precisa marcar esta opcao para gerar o voucher."],
  ["termos", "Voce precisa marcar esta opcao para gerar o voucher."],
];

function validateForm() {
  clearFieldErrors();
  const invalid = [];

  requiredFields.forEach(([name, message]) => {
    const element = form.elements[name];
    if (!String(element.value || "").trim()) {
      setFieldError(element, message);
      invalid.push(element);
    }
  });

  const telefone = form.elements.telefone;
  const telefoneDigits = onlyDigits(telefone.value);
  if (telefone.value.trim() && (telefoneDigits.length < 10 || telefoneDigits.length > 11)) {
    setFieldError(telefone, "Telefone invalido: informe DDD + numero (10 ou 11 digitos).");
    invalid.push(telefone);
  }

  const cpf = form.elements.cpf;
  const cpfDigits = onlyDigits(cpf.value);
  if (cpf.value.trim() && cpfDigits.length !== 11) {
    setFieldError(
      cpf,
      `CPF invalido: voce informou ${cpfDigits.length} digitos e o CPF tem 11. Corrija para continuar.`,
    );
    invalid.push(cpf);
  }

  requiredChecks.forEach(([name, message]) => {
    const element = form.elements[name];
    if (!element.checked) {
      setFieldError(element, message);
      invalid.push(element);
    }
  });

  return invalid;
}

function escapeHtml(value) {
  return String(value || "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[char],
  );
}

function voucherCode(data) {
  const base = `${data.nome_completo}-${data.telefone}-${Date.now()}-${vouchers.length}`;
  let hash = 0;

  for (let i = 0; i < base.length; i += 1) {
    hash = (hash << 5) - hash + base.charCodeAt(i);
    hash |= 0;
  }

  return `TR-${Math.abs(hash).toString(36).toUpperCase().padStart(6, "0").slice(0, 6)}`;
}

function formToData(formElement) {
  const formData = new FormData(formElement);
  const data = Object.fromEntries(formData.entries());

  data.telefone = onlyDigits(data.telefone);
  data.cpf = onlyDigits(data.cpf);
  data.solidaria = formData.has("solidaria");
  data.termos = formData.has("termos");
  data.voucher_codigo = voucherCode(data);
  data.voucher_emitido_em = new Date().toISOString();
  data.status = "voucher-gerado";

  return data;
}

function field(label, value) {
  return `
    <div>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "-")}</strong>
    </div>
  `;
}

function emptyVoucher() {
  panel.innerHTML = `
    <div class="voucher-empty">
      <span>Meus vouchers</span>
      <strong>Preencha o formulario para gerar sua inscricao.</strong>
      <p>Depois de gerar, o voucher aparece aqui com QR Code, codigo unico e aviso sobre a camiseta dos 200 primeiros inscritos.</p>
    </div>
  `;
}

function camisetaMessage(data) {
  if (data.camiseta_garantida === true) {
    return "Camiseta garantida: este voucher esta entre os 200 primeiros inscritos.";
  }

  if (data.camiseta_garantida === false) {
    return "Cota de camisetas encerrada: os 200 primeiros vouchers ja foram gerados.";
  }

  return "Os 200 primeiros vouchers gerados ganham camiseta. Confirme a posicao no credenciamento.";
}

function qrPayload(data) {
  return JSON.stringify({
    evento: eventInfo.nome,
    voucher: data.voucher_codigo,
    inscricao: data.numero_inscricao || null,
    nome: data.nome_completo,
    telefone: data.telefone,
    validacao: "pendente",
  });
}

async function voucherCard(data, index) {
  const qrCode = await QRCode.toString(qrPayload(data), {
    type: "svg",
    margin: 1,
    width: 128,
    errorCorrectionLevel: "M",
  });

  const voucherNumber = data.numero_inscricao
    ? `#${String(data.numero_inscricao).padStart(3, "0")}`
    : index + 1;

  return `
    <article class="voucher-card">
      <header class="voucher-top">
        <div class="voucher-title">
          <span>Voucher ${voucherNumber} de inscricao</span>
          <strong>${eventInfo.nome}</strong>
        </div>
        <div class="voucher-code">${escapeHtml(data.voucher_codigo)}</div>
      </header>
      <div class="voucher-body">
        <div class="voucher-details">
          <div class="voucher-name">
            <span>Participante</span>
            <strong>${escapeHtml(data.nome_completo)}</strong>
          </div>
          <div class="voucher-data">
            ${field("Telefone", data.telefone)}
            ${field("CPF", data.cpf)}
            ${field("Tipo sanguineo", data.tipo_sanguineo)}
            ${field("Tamanho camiseta", data.tamanho_camiseta)}
            ${field("Grupo", data.grupo)}
            ${field("Cidade", data.cidade)}
            ${field("Veiculo", data.veiculo)}
            ${field("Data", eventInfo.data)}
            ${field("Rota", eventInfo.rota)}
            ${field("Largada", eventInfo.largada)}
            ${field("Investimento", eventInfo.investimento)}
          </div>
          <div class="voucher-alert ${data.camiseta_garantida === false ? "is-over" : ""}">
            ${escapeHtml(camisetaMessage(data))}
          </div>
          <div class="voucher-alert">
            Para retirar a pulseira: apresentar este voucher, comprovante do PIX, 1kg de alimento nao perecivel e um agasalho.
          </div>
        </div>
        <div class="voucher-qr">
          ${qrCode}
          <span>QR Code para validacao futura</span>
        </div>
      </div>
    </article>
  `;
}

async function renderVouchers() {
  if (!vouchers.length) {
    emptyVoucher();
    return;
  }

  const cards = await Promise.all(vouchers.map((voucher, index) => voucherCard(voucher, index)));

  panel.innerHTML = `
    <div class="voucher-list">
      <div class="voucher-summary">
        <span>${vouchers.length} ${vouchers.length === 1 ? "inscricao gerada" : "inscricoes geradas"}</span>
        <strong>${vouchers.map((voucher) => escapeHtml(voucher.voucher_codigo)).join(" - ")}</strong>
      </div>
      ${cards.join("")}
      <div class="voucher-actions">
        <button type="button" id="print-voucher">Imprimir vouchers</button>
        <button type="button" id="clear-vouchers">Limpar vouchers</button>
      </div>
    </div>
  `;

  document.querySelector("#print-voucher").addEventListener("click", () => window.print());
  document.querySelector("#clear-vouchers").addEventListener("click", () => {
    vouchers.splice(0, vouchers.length);
    form.reset();
    emptyVoucher();
    status.textContent = "";
    activateTab("inscricao");
    form.querySelector("[name='nome_completo']").focus();
  });
}

let vouchersLoadedForUserId = null;

async function loadSavedVouchers() {
  if (!isSupabaseConfigured || !currentSession) return;

  // Evita recarregar (e re-renderizar) quando os vouchers deste usuario
  // ja foram buscados — o onAuthStateChange dispara mais de uma vez no load.
  if (vouchersLoadedForUserId === currentSession.user?.id) return;

  try {
    const savedVouchers = await listarMinhasInscricoes();
    vouchersLoadedForUserId = currentSession.user?.id || null;
    vouchers.splice(0, vouchers.length, ...savedVouchers);
    await renderVouchers();
  } catch (error) {
    status.textContent = "Nao foi possivel carregar seus vouchers agora.";
    console.error(error);
  }
}

async function maybeSaveToSupabase(data) {
  if (!isSupabaseConfigured || !currentSession) return null;

  return criarInscricao({
    nome_completo: data.nome_completo,
    telefone: data.telefone,
    cpf: data.cpf,
    tipo_sanguineo: data.tipo_sanguineo,
    grupo: data.grupo,
    cidade: data.cidade,
    tamanho_camiseta: data.tamanho_camiseta,
    veiculo: data.veiculo,
    comprovante_url: data.comprovante,
    observacoes: data.observacoes,
    solidaria: data.solidaria,
    termos: data.termos,
    voucher_codigo: data.voucher_codigo,
    voucher_emitido_em: data.voucher_emitido_em,
    status: data.status,
  });
}

tabButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const target = button.dataset.tabTarget;

    // Sem login, o botao de inscricao leva direto ao login com Google
    // (que volta para esta pagina depois de logar).
    if (target === "inscricao" && !currentSession) {
      const { error } = await loginWithGoogle();
      if (error) status.textContent = "Nao foi possivel iniciar o login com Google.";
      return;
    }

    activateTab(target);
  });
});

bindAuthButtons({
  onLoginError: () => {
    status.textContent = "Nao foi possivel iniciar o login com Google.";
  },
  onLogoutError: () => {
    status.textContent = "Nao foi possivel sair da conta agora.";
  },
  afterLogout: async () => {
    vouchersLoadedForUserId = null;
    vouchers.splice(0, vouchers.length);
    await renderVouchers();
    activateTab("inscricao");
  },
});

initUserMenuToggle();

// Remove o aviso vermelho do campo assim que a pessoa comeca a corrigir.
form.addEventListener("input", (event) => {
  const label = event.target.closest("label");
  if (!label || !label.classList.contains("is-invalid")) return;

  label.classList.remove("is-invalid");
  label.querySelector(".field-error")?.remove();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentSession) {
    status.textContent = "Use o login no cabecalho antes de gerar o voucher.";
    activateTab("inscricao");
    return;
  }

  const invalidFields = validateForm();
  if (invalidFields.length) {
    status.classList.add("is-error");
    status.textContent = "Corrija os campos destacados em vermelho para gerar o voucher.";
    invalidFields[0].focus();
    return;
  }

  status.classList.remove("is-error");
  const data = formToData(form);
  status.textContent = "Gerando voucher...";

  try {
    const saved = await maybeSaveToSupabase(data);
    const voucher = saved ? { ...data, ...saved } : data;

    vouchers.unshift(voucher);
    await renderVouchers();
    activateTab("vouchers");
    form.reset();
    form.querySelector("[name='nome_completo']").focus();

    status.textContent = saved
      ? `Voucher ${voucher.voucher_codigo} gerado e enviado ao Supabase.`
      : `Voucher ${voucher.voucher_codigo} gerado. Supabase ainda nao configurado; voce pode preencher outra inscricao.`;
  } catch (error) {
    status.textContent = "Nao foi possivel salvar no Supabase agora. Tente novamente em instantes.";
    console.error(error);
  }
});

initAuth();
