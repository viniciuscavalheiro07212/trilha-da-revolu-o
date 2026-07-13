import QRCode from "qrcode";
import { criarPedidoPix, confirmarVoucherPago, consultarPedidoPix } from "./mercadopago.js";
import { listarMinhasInscricoes } from "./supabase/inscricoes.js";
import { isSupabaseConfigured, supabase } from "./supabase/client.js";
import { initUserMenuToggle, renderUserMenu } from "./user-menu.js";
import { bindAuthButtons, loginWithGoogle, RETURN_TAB_KEY } from "./auth.js";

const form = document.querySelector("#signup-form");
const panel = document.querySelector("#voucher-panel");
const paymentPanel = document.querySelector("#payment-panel");
const status = document.querySelector("#form-status");
const tabButtons = document.querySelectorAll("[data-tab-target]");
const tabPanels = document.querySelectorAll(".tab-panel");
const vouchers = [];
let currentSession = null;
let pendingPayment = null;
let paymentPolling = null;
let isConfirmingPayment = false;

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

  if (target === "pagamento" && !pendingPayment) {
    status.textContent = "Preencha a inscricao para abrir o pagamento Pix.";
    target = "inscricao";
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

function paymentTabButton() {
  return document.querySelector("[data-tab-target='pagamento']");
}

function showPaymentTab(show) {
  const button = paymentTabButton();
  if (button) button.hidden = !show;
}

function stopPaymentPolling() {
  if (paymentPolling) {
    window.clearInterval(paymentPolling);
    paymentPolling = null;
  }
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
      // Logout vindo de outra aba tambem limpa os vouchers da tela,
      // senao os dados do usuario anterior ficam visiveis ate recarregar.
      vouchersLoadedForUserId = null;
      vouchers.splice(0, vouchers.length);
      pendingPayment = null;
      stopPaymentPolling();
      showPaymentTab(false);
      emptyPayment();
      emptyVoucher();
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

function formatCurrencyBRL(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount);
}

function formToData(formElement) {
  const formData = new FormData(formElement);
  const data = Object.fromEntries(formData.entries());

  data.telefone = onlyDigits(data.telefone);
  data.cpf = onlyDigits(data.cpf);
  data.solidaria = formData.has("solidaria");
  data.termos = formData.has("termos");

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

function emptyPayment() {
  if (!paymentPanel) return;

  paymentPanel.innerHTML = `
    <div class="payment-empty">
      <span>Pagamento Pix</span>
      <strong>Aguardando inscricao</strong>
      <p>Depois de preencher os dados, o QR Code do Mercado Pago aparece aqui.</p>
    </div>
  `;
}

function camisetaMessage(data) {
  const tamanho = data.tamanho_camiseta ? ` (tamanho ${data.tamanho_camiseta})` : "";

  if (data.camiseta_garantida === true) {
    return `Camiseta garantida${tamanho}: este voucher esta entre os 200 primeiros inscritos. Retire a camiseta no credenciamento.`;
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
            ${field("Pagamento", data.mercado_pago_payment_id || data.comprovante)}
            ${field("Data", eventInfo.data)}
            ${field("Rota", eventInfo.rota)}
            ${field("Largada", eventInfo.largada)}
            ${field("Investimento", eventInfo.investimento)}
          </div>
          <div class="voucher-alert ${
            data.camiseta_garantida === true
              ? "is-shirt"
              : data.camiseta_garantida === false
                ? "is-over"
                : ""
          }">
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

function paymentStatusText(payment) {
  const paymentStatus = payment?.status?.paymentStatus || payment?.status?.status;

  if (paymentStatus === "approved") return "Pagamento aprovado. Gerando voucher...";
  if (paymentStatus === "rejected") return "Pagamento recusado. Gere uma nova cobranca Pix.";
  if (paymentStatus === "cancelled" || paymentStatus === "canceled") return "Pagamento cancelado.";
  return "Aguardando pagamento Pix.";
}

function renderPayment() {
  if (!paymentPanel || !pendingPayment) {
    emptyPayment();
    return;
  }

  const qrImage = pendingPayment.qrCodeBase64
    ? `<img src="data:image/png;base64,${escapeHtml(pendingPayment.qrCodeBase64)}" alt="QR Code Pix Mercado Pago">`
    : "";

  paymentPanel.innerHTML = `
    <div class="payment-card">
      <div class="payment-heading">
        <span>Pagamento Pix</span>
        <strong>${escapeHtml(formatCurrencyBRL(pendingPayment.amount))}</strong>
      </div>
      <div class="payment-qr-box">
        ${qrImage}
        <p>${escapeHtml(paymentStatusText(pendingPayment))}</p>
      </div>
      <label class="pix-copy">
        Pix copia e cola
        <textarea readonly rows="4">${escapeHtml(pendingPayment.qrCode || "")}</textarea>
      </label>
      <div class="payment-actions">
        <button type="button" id="copy-pix-code">Copiar codigo Pix</button>
        <button type="button" id="check-payment">Ja paguei</button>
        ${pendingPayment.ticketUrl ? `<a href="${escapeHtml(pendingPayment.ticketUrl)}" target="_blank" rel="noopener">Abrir no Mercado Pago</a>` : ""}
      </div>
      <p class="payment-note">O voucher sera liberado automaticamente quando o Mercado Pago confirmar o pagamento.</p>
    </div>
  `;

  document.querySelector("#copy-pix-code")?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(pendingPayment.qrCode || "");
    status.textContent = "Codigo Pix copiado.";
  });

  document
    .querySelector("#check-payment")
    ?.addEventListener("click", () => checkPaymentStatus(true));
}

async function finishPaidVoucher() {
  if (!pendingPayment || isConfirmingPayment) return;

  isConfirmingPayment = true;
  status.textContent = "Pagamento aprovado. Gerando voucher...";

  try {
    const { voucher } = await confirmarVoucherPago(pendingPayment.orderId);
    vouchers.unshift(voucher);
    await renderVouchers();

    stopPaymentPolling();
    pendingPayment = null;
    isConfirmingPayment = false;
    showPaymentTab(false);
    emptyPayment();
    form.reset();
    activateTab("vouchers");
    form.querySelector("[name='nome_completo']").focus();
    status.textContent = `Voucher ${voucher.voucher_codigo} gerado apos confirmacao do pagamento.`;
  } catch (error) {
    isConfirmingPayment = false;
    status.textContent =
      "Pagamento aprovado, mas nao foi possivel gerar o voucher agora. Tente conferir novamente.";
    console.error(error);
  }
}

async function checkPaymentStatus(showWaitingMessage = false) {
  if (!pendingPayment) return;

  try {
    const paymentStatus = await consultarPedidoPix(pendingPayment.orderId);
    pendingPayment.status = paymentStatus;
    renderPayment();

    if (paymentStatus.approved) {
      await finishPaidVoucher();
      return;
    }

    if (showWaitingMessage) {
      status.textContent =
        "Ainda nao apareceu como pago. Aguarde alguns segundos e confira novamente.";
    }
  } catch (error) {
    if (showWaitingMessage) {
      status.textContent = "Nao foi possivel consultar o pagamento agora.";
    }
    console.error(error);
  }
}

function startPaymentPolling() {
  stopPaymentPolling();
  paymentPolling = window.setInterval(() => checkPaymentStatus(false), 8000);
}

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
    pendingPayment = null;
    stopPaymentPolling();
    showPaymentTab(false);
    emptyPayment();
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
  status.textContent = "Gerando pagamento Pix...";

  try {
    pendingPayment = {
      ...(await criarPedidoPix(data)),
      registration: data,
    };

    showPaymentTab(true);
    renderPayment();
    activateTab("pagamento");
    startPaymentPolling();
    status.textContent = "Pagamento Pix criado. Escaneie o QR Code para liberar o voucher.";
  } catch (error) {
    status.textContent = error.message || "Nao foi possivel criar o pagamento agora.";
    console.error(error);
  }
});

showPaymentTab(false);
emptyPayment();
initAuth();
