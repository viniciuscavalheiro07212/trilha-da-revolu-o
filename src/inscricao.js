import { criarInscricao } from "./supabase/inscricoes.js";
import { isSupabaseConfigured } from "./supabase/client.js";

const form = document.querySelector("#signup-form");
const panel = document.querySelector("#voucher-panel");
const status = document.querySelector("#form-status");
const vouchers = [];

const eventInfo = {
  nome: "VIII Trilha da Revolucao",
  data: "20 de setembro de 2026",
  rota: "Gravatai -> Cidreira",
  largada: "08:00hs",
  investimento: "R$100,00",
};

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
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
      <span>Voucher</span>
      <strong>Preencha o formulario para gerar sua inscricao.</strong>
      <p>O voucher aparecera aqui com codigo unico, dados do participante e resumo do evento.</p>
    </div>
  `;
}

function voucherCard(data, index) {
  return `
    <article class="voucher-card">
      <header class="voucher-top">
        <div class="voucher-title">
          <span>Voucher ${index + 1} de inscricao</span>
          <strong>${eventInfo.nome}</strong>
        </div>
        <div class="voucher-code">${escapeHtml(data.voucher_codigo)}</div>
      </header>
      <div class="voucher-body">
        <div class="voucher-name">
          <span>Participante</span>
          <strong>${escapeHtml(data.nome_completo)}</strong>
        </div>
        <div class="voucher-data">
          ${field("Telefone", data.telefone)}
          ${field("CPF", data.cpf)}
          ${field("Tipo sanguineo", data.tipo_sanguineo)}
          ${field("Camiseta", data.tamanho_camiseta)}
          ${field("Grupo", data.grupo)}
          ${field("Cidade", data.cidade)}
          ${field("Veiculo", data.veiculo)}
          ${field("Comprovante", data.comprovante)}
          ${field("Data", eventInfo.data)}
          ${field("Rota", eventInfo.rota)}
          ${field("Largada", eventInfo.largada)}
          ${field("Investimento", eventInfo.investimento)}
        </div>
        <div class="voucher-alert">
          Para retirar a pulseira: apresentar este voucher, comprovante do PIX, 1kg de alimento nao perecivel e um agasalho.
        </div>
      </div>
    </article>
  `;
}

function renderVouchers() {
  if (!vouchers.length) {
    emptyVoucher();
    return;
  }

  panel.innerHTML = `
    <div class="voucher-list">
      <div class="voucher-summary">
        <span>${vouchers.length} ${vouchers.length === 1 ? "inscricao gerada" : "inscricoes geradas"}</span>
        <strong>${vouchers.map((voucher) => escapeHtml(voucher.voucher_codigo)).join(" · ")}</strong>
      </div>
      ${vouchers.map((voucher, index) => voucherCard(voucher, index)).join("")}
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
    form.querySelector("[name='nome_completo']").focus();
  });
}

async function maybeSaveToSupabase(data) {
  if (!isSupabaseConfigured) return false;

  await criarInscricao({
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

  return true;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!form.reportValidity()) return;

  const data = formToData(form);
  vouchers.push(data);
  renderVouchers();
  form.reset();
  form.querySelector("[name='nome_completo']").focus();

  try {
    const saved = await maybeSaveToSupabase(data);
    status.textContent = saved
      ? `Voucher ${data.voucher_codigo} gerado e enviado ao Supabase. Voce pode preencher outra inscricao.`
      : `Voucher ${data.voucher_codigo} gerado. Supabase ainda nao configurado; voce pode preencher outra inscricao.`;
  } catch (error) {
    status.textContent = `Voucher ${data.voucher_codigo} gerado, mas nao foi possivel salvar no Supabase agora.`;
    console.error(error);
  }
});
