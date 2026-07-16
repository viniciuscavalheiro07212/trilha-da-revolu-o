import QrScanner from "qr-scanner";
import { supabase } from "./supabase/client.js";
import { initUserMenuToggle, renderUserMenu } from "./user-menu.js";
import { bindAuthButtons } from "./auth.js";
import {
  souValidador,
  validarVoucher,
  desfazerValidacao,
  listarTodasInscricoes,
  carregarValorInscricao,
  salvarValorInscricao,
} from "./supabase/validacao.js";

const gate = document.querySelector("#access-gate");
const gateStatus = document.querySelector("#gate-status");
const gateLogin = document.querySelector("#gate-login");
const app = document.querySelector("#validator-app");
const tabButtons = document.querySelectorAll("[data-tab-target]");
const tabPanels = app.querySelectorAll(".app-screen");

const video = document.querySelector("#scanner-video");
const scannerFrame = document.querySelector("#scanner-frame");
const scannerHint = document.querySelector("#scanner-hint");
const toggleCameraButton = document.querySelector("#toggle-camera");
const manualForm = document.querySelector("#manual-form");
const manualInput = document.querySelector("#manual-code");
const scanStatus = document.querySelector("#scan-status");
const resultPanel = document.querySelector("#result-panel");

const searchInput = document.querySelector("#voucher-search");
const refreshButton = document.querySelector("#refresh-vouchers");
const voucherCounters = document.querySelector("#voucher-counters");
const voucherRows = document.querySelector("#voucher-rows");
const tableStatus = document.querySelector("#table-status");

const priceForm = document.querySelector("#price-form");
const priceInput = document.querySelector("#price-input");
const profitCards = document.querySelector("#profit-cards");
const profitRows = document.querySelector("#profit-rows");
const profitStatus = document.querySelector("#profit-status");
const shirtCounters = document.querySelector("#shirt-counters");
const shirtRows = document.querySelector("#shirt-rows");
const shirtStatus = document.querySelector("#shirt-status");

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

let inscricoes = [];
let valorInscricao = 100;
let scanner = null;
let cameraLigada = false;
let ultimoCodigo = null;
let ultimoCodigoEm = 0;
let validando = false;

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

function activateTab(target) {
  tabButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tabTarget === target);
  });

  tabPanels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === `tab-${target}`);
  });

  // A camera so precisa ficar ligada na aba de validacao.
  if (target !== "validar" && cameraLigada) {
    stopCamera();
  }

  if (target === "camisetas") renderShirtSummary();
}

// ---------------------------------------------------------------------------
// Portao de acesso
// ---------------------------------------------------------------------------

function showGate(message) {
  app.hidden = true;
  gate.classList.add("is-active");
  gateStatus.textContent = message;
}

async function showApp() {
  gate.classList.remove("is-active");
  app.hidden = false;
  await Promise.all([loadInscricoes(), loadValor()]);
}

async function handleSession(session) {
  renderUserMenu(session);

  if (!supabase) {
    showGate("Supabase nao configurado. Verifique as variaveis de ambiente.");
    return;
  }

  if (!session) {
    stopCamera();
    gateLogin.hidden = false;
    showGate("Entre com a conta Google autorizada para liberar o validador.");
    return;
  }

  gateStatus.textContent = "Conferindo autorizacao...";

  try {
    const autorizado = await souValidador();

    if (autorizado) {
      await showApp();
      return;
    }

    gateLogin.hidden = true;
    showGate(
      `A conta ${session.user?.email || "atual"} nao esta na lista de validadores. ` +
        "Peca para a organizacao adicionar seu e-mail.",
    );
  } catch (error) {
    console.error(error);
    gateLogin.hidden = true;
    showGate(
      "Nao foi possivel conferir a autorizacao. Confirme se a migracao de validacao foi aplicada no Supabase.",
    );
  }
}

async function initAuth() {
  if (!supabase) {
    showGate("Supabase nao configurado. Verifique as variaveis de ambiente.");
    return;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) console.error(error);

  await handleSession(data?.session || null);

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "TOKEN_REFRESHED") return;

    // setTimeout evita chamar o Supabase dentro do callback de auth,
    // o que pode causar deadlock (recomendacao da propria documentacao).
    setTimeout(() => handleSession(session), 0);
  });
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

function extractVoucherCode(rawText) {
  const text = String(rawText || "").trim();

  // O QR do site carrega um JSON com o campo "voucher"; aceita tambem o
  // codigo puro (TR-XXXXXX) digitado ou impresso.
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.voucher === "string") return parsed.voucher.trim();
  } catch {
    // Nao era JSON: segue para o formato de codigo puro.
  }

  const match = text.match(/TR-[A-Z0-9]+/i);
  return match ? match[0] : null;
}

async function startCamera() {
  if (!scanner) {
    scanner = new QrScanner(video, (result) => onScan(result.data), {
      returnDetailedScanResult: true,
      preferredCamera: "environment",
      highlightScanRegion: true,
      highlightCodeOutline: true,
    });
  }

  try {
    await scanner.start();
    cameraLigada = true;
    scannerHint.hidden = true;
    scannerFrame.classList.add("is-live");
    toggleCameraButton.textContent = "Desligar camera";
    scanStatus.textContent = "Aponte a camera para o QR Code do voucher.";
  } catch (error) {
    console.error(error);
    scanStatus.textContent =
      "Nao foi possivel acessar a camera. Verifique a permissao no navegador ou digite o codigo.";
  }
}

function stopCamera() {
  if (scanner) scanner.stop();
  cameraLigada = false;
  scannerHint.hidden = false;
  scannerFrame.classList.remove("is-live");
  toggleCameraButton.textContent = "Ligar camera";
}

async function onScan(rawText) {
  const codigo = extractVoucherCode(rawText);

  if (!codigo) {
    scanStatus.textContent = "QR Code lido, mas sem codigo de voucher valido.";
    return;
  }

  // Evita validar o mesmo QR varias vezes enquanto ele segue na frente da camera.
  const agora = Date.now();
  if (validando || (codigo === ultimoCodigo && agora - ultimoCodigoEm < 4000)) return;
  ultimoCodigo = codigo;
  ultimoCodigoEm = agora;

  await processCode(codigo);
}

async function processCode(codigo) {
  validando = true;
  scanStatus.textContent = `Validando ${codigo}...`;

  try {
    const resultado = await validarVoucher(codigo);
    renderResult(resultado);
    scanStatus.textContent = "";

    if (navigator.vibrate) {
      navigator.vibrate(resultado.resultado === "validado" ? 120 : [80, 60, 80]);
    }

    if (resultado.resultado !== "nao-encontrado") {
      updateLocalInscricao(resultado);
    }
  } catch (error) {
    console.error(error);
    scanStatus.textContent = "Falha ao validar. Confira a conexao e tente de novo.";
  } finally {
    validando = false;
  }
}

function resultMeta(resultado) {
  if (resultado === "validado") {
    return { classe: "is-ok", titulo: "Liberado", detalhe: "Voucher validado agora." };
  }

  if (resultado === "ja-validado") {
    return { classe: "is-warn", titulo: "Ja validado", detalhe: "Este voucher ja foi usado." };
  }

  return { classe: "is-error", titulo: "Nao encontrado", detalhe: "Codigo sem inscricao." };
}

function renderResult(dados) {
  const meta = resultMeta(dados.resultado);

  const camiseta =
    dados.resultado === "nao-encontrado"
      ? ""
      : dados.camiseta_garantida
        ? `<div class="result-shirt is-yes">Entregar camiseta — tamanho ${escapeHtml(dados.tamanho_camiseta || "-")} (entre os 200 primeiros)</div>`
        : `<div class="result-shirt is-no">Sem camiseta — fora dos 200 primeiros vouchers</div>`;

  const detalhes =
    dados.resultado === "nao-encontrado"
      ? ""
      : `
        <div class="result-data">
          <div><span>Nome</span><strong>${escapeHtml(dados.nome_completo)}</strong></div>
          <div><span>Inscricao</span><strong>#${escapeHtml(dados.numero_inscricao)}</strong></div>
          <div><span>Grupo</span><strong>${escapeHtml(dados.grupo || "-")}</strong></div>
          <div><span>Veiculo</span><strong>${escapeHtml(dados.veiculo || "-")}</strong></div>
          <div><span>Camiseta</span><strong>${escapeHtml(dados.tamanho_camiseta || "-")}${
            dados.camiseta_garantida ? " (garantida)" : ""
          }</strong></div>
          <div><span>Validado em</span><strong>${
            dados.validado_em ? dataHora.format(new Date(dados.validado_em)) : "-"
          }</strong></div>
        </div>
        ${
          // Tambem no "validado" recem-feito: permite corrigir um engano na
          // hora, sem precisar escanear o voucher de novo.
          dados.resultado === "validado" || dados.resultado === "ja-validado"
            ? `<button type="button" class="result-undo" data-undo="${escapeHtml(dados.voucher_codigo)}">Desfazer validacao</button>`
            : ""
        }
      `;

  resultPanel.innerHTML = `
    <div class="result-card ${meta.classe}">
      <span class="result-badge">${meta.titulo}</span>
      <strong class="result-code">${escapeHtml(dados.voucher_codigo)}</strong>
      <p>${meta.detalhe}</p>
      ${camiseta}
      ${detalhes}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Tabela de vouchers
// ---------------------------------------------------------------------------

function updateLocalInscricao(dados) {
  const inscricao = inscricoes.find((item) => item.voucher_codigo === dados.voucher_codigo);

  if (inscricao) {
    inscricao.validado_em = dados.validado_em;
    inscricao.validado_por = dados.validado_por;
  }

  renderTable();
  renderProfit();
}

async function loadInscricoes() {
  tableStatus.textContent = "Carregando inscricoes...";

  try {
    inscricoes = await listarTodasInscricoes();
    tableStatus.textContent = "";
    renderTable();
    renderProfit();
    renderShirtSummary();
  } catch (error) {
    console.error(error);
    tableStatus.textContent = "Nao foi possivel carregar as inscricoes.";
  }
}

function filteredInscricoes() {
  const query = (searchInput.value || "").trim().toLowerCase();
  if (!query) return inscricoes;

  return inscricoes.filter((item) =>
    [item.nome_completo, item.voucher_codigo, item.grupo, item.cidade]
      .join(" ")
      .toLowerCase()
      .includes(query),
  );
}

function renderTable() {
  const validadas = inscricoes.filter((item) => item.validado_em).length;
  const comCamiseta = inscricoes.filter((item) => item.camiseta_garantida).length;

  voucherCounters.innerHTML = `
    <div><span>Total</span><strong>${inscricoes.length}</strong></div>
    <div><span>Validados</span><strong>${validadas}</strong></div>
    <div><span>Pendentes</span><strong>${inscricoes.length - validadas}</strong></div>
    <div><span>Com camiseta</span><strong>${comCamiseta}/200</strong></div>
  `;

  const lista = filteredInscricoes();

  if (!lista.length) {
    voucherRows.innerHTML = `<tr><td colspan="7" class="table-empty">Nenhuma inscricao encontrada.</td></tr>`;
    return;
  }

  voucherRows.innerHTML = lista
    .map((item) => {
      const validado = Boolean(item.validado_em);

      return `
        <tr>
          <td>${escapeHtml(item.numero_inscricao)}</td>
          <td class="cell-code">${escapeHtml(item.voucher_codigo)}</td>
          <td>${escapeHtml(item.nome_completo)}</td>
          <td>${escapeHtml(item.grupo || "-")}</td>
          <td>${escapeHtml(item.tamanho_camiseta || "-")}${item.camiseta_garantida ? " ✓" : ""}</td>
          <td>
            <span class="status-pill ${validado ? "is-ok" : "is-pending"}">
              ${validado ? `Validado ${dataHora.format(new Date(item.validado_em))}` : "Pendente"}
            </span>
          </td>
          <td>${escapeHtml(item.validado_por || "-")}</td>
        </tr>
      `;
    })
    .join("");
}

// ---------------------------------------------------------------------------
// Camisetas
// ---------------------------------------------------------------------------

function renderShirtSummary() {
  const sizes = ["P", "M", "G", "GG", "G1", "G2", "G3"];
  const guaranteed = inscricoes.filter((item) => item.camiseta_garantida);
  const quantities = new Map(sizes.map((size) => [size, 0]));

  guaranteed.forEach((item) => {
    const size = String(item.tamanho_camiseta || "")
      .trim()
      .toUpperCase();
    if (quantities.has(size)) quantities.set(size, quantities.get(size) + 1);
  });

  const withoutSize = guaranteed.filter(
    (item) => !String(item.tamanho_camiseta || "").trim(),
  ).length;
  const remaining = Math.max(0, 200 - guaranteed.length);

  shirtCounters.innerHTML = `
    <div><span>Reservadas</span><strong>${guaranteed.length}/200</strong></div>
    <div><span>Restantes</span><strong>${remaining}</strong></div>
  `;
  shirtRows.innerHTML = sizes
    .map((size) => `<tr><td>${size}</td><td>${quantities.get(size)}</td></tr>`)
    .join("");
  shirtStatus.textContent = withoutSize
    ? `${withoutSize} camiseta(s) garantida(s) ainda sem tamanho informado.`
    : remaining === 0
      ? "Camisetas esgotadas. As inscricoes continuam disponiveis."
      : "Atualizado conforme os pagamentos confirmados.";
}

// ---------------------------------------------------------------------------
// Lucro
// ---------------------------------------------------------------------------

async function loadValor() {
  try {
    const valor = await carregarValorInscricao();
    if (valor !== null) valorInscricao = valor;
  } catch (error) {
    console.error(error);
    profitStatus.textContent = "Nao foi possivel carregar o valor da inscricao (usando padrao).";
  }

  priceInput.value = valorInscricao;
  renderProfit();
}

function renderProfit() {
  const total = inscricoes.length;
  const validadas = inscricoes.filter((item) => item.validado_em).length;
  const receitaPrevista = total * valorInscricao;
  const receitaConfirmada = validadas * valorInscricao;

  profitCards.innerHTML = `
    <div class="profit-card is-hero"><span>Receita confirmada</span><strong>${brl.format(receitaConfirmada)}</strong></div>
    <div class="profit-card"><span>Receita prevista</span><strong>${brl.format(receitaPrevista)}</strong></div>
    <div class="profit-card"><span>A confirmar</span><strong>${brl.format(receitaPrevista - receitaConfirmada)}</strong></div>
  `;

  profitRows.innerHTML = `
    <tr>
      <td>Inscricoes geradas</td>
      <td>${total}</td>
      <td>${brl.format(receitaPrevista)}</td>
    </tr>
    <tr>
      <td>Vouchers validados no evento</td>
      <td>${validadas}</td>
      <td>${brl.format(receitaConfirmada)}</td>
    </tr>
    <tr>
      <td>Vouchers pendentes</td>
      <td>${total - validadas}</td>
      <td>${brl.format(receitaPrevista - receitaConfirmada)}</td>
    </tr>
  `;
}

// ---------------------------------------------------------------------------
// PWA
// ---------------------------------------------------------------------------

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => console.error(error));
  });
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------

tabButtons.forEach((button) => {
  button.addEventListener("click", () => activateTab(button.dataset.tabTarget));
});

toggleCameraButton.addEventListener("click", () => {
  if (cameraLigada) {
    stopCamera();
    scanStatus.textContent = "";
  } else {
    startCamera();
  }
});

manualForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const codigo = extractVoucherCode(manualInput.value);

  if (!codigo) {
    scanStatus.textContent = "Digite um codigo no formato TR-XXXXXX.";
    return;
  }

  await processCode(codigo.toUpperCase());
  manualInput.value = "";
});

resultPanel.addEventListener("click", async (event) => {
  const undoButton = event.target.closest("[data-undo]");
  if (!undoButton) return;

  undoButton.disabled = true;

  try {
    const resultado = await desfazerValidacao(undoButton.dataset.undo);
    scanStatus.textContent = `Validacao de ${resultado.voucher_codigo} desfeita.`;
    updateLocalInscricao({
      voucher_codigo: resultado.voucher_codigo,
      validado_em: null,
      validado_por: null,
    });
    resultPanel.innerHTML = `
      <div class="result-empty">
        <span>Resultado</span>
        <strong>Validacao desfeita</strong>
        <p>O voucher ${escapeHtml(resultado.voucher_codigo)} voltou para pendente.</p>
      </div>
    `;
  } catch (error) {
    console.error(error);
    scanStatus.textContent = "Nao foi possivel desfazer a validacao.";
    undoButton.disabled = false;
  }
});

searchInput.addEventListener("input", renderTable);
refreshButton.addEventListener("click", loadInscricoes);

priceForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const valor = Number(priceInput.value);

  if (!Number.isFinite(valor) || valor < 0) {
    profitStatus.textContent = "Informe um valor valido.";
    return;
  }

  profitStatus.textContent = "Salvando valor...";

  try {
    await salvarValorInscricao(valor);
    valorInscricao = valor;
    renderProfit();
    profitStatus.textContent = `Valor da inscricao atualizado para ${brl.format(valor)}.`;
  } catch (error) {
    console.error(error);
    profitStatus.textContent = "Nao foi possivel salvar o valor.";
  }
});

initUserMenuToggle();
bindAuthButtons();
registerServiceWorker();
initAuth();
