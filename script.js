"use strict";

/* ==========================================================
   UTILITÁRIOS
   ========================================================== */
const $ = (id) => document.getElementById(id);
const root = document.documentElement;

const formatarMoeda = (v) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const arred = (n) => Math.round(n * 100) / 100;

// Evita injeção de HTML a partir de nomes digitados pelo usuário
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

const icone = (nome) =>
  `<svg class="icon" aria-hidden="true"><use href="#i-${nome}"/></svg>`;

function lerLocal(chave, padrao) {
  try {
    return JSON.parse(localStorage.getItem(chave)) ?? padrao;
  } catch {
    return padrao;
  }
}
function gravarLocal(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    /* armazenamento indisponível: segue só em memória */
  }
}

/* ==========================================================
   TOASTS E CONFIRMAÇÃO
   ========================================================== */
function toast(mensagem, tipo = "ok") {
  const el = document.createElement("div");
  el.className = `toast ${tipo === "erro" ? "erro" : ""}`;
  el.textContent = mensagem;
  $("toast-area").appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function confirmar(titulo, texto, rotuloOk = "Confirmar") {
  return new Promise((resolve) => {
    const dlg = $("dlg-confirmar");
    $("dlg-titulo").textContent = titulo;
    $("dlg-texto").textContent = texto;
    $("dlg-ok").textContent = rotuloOk;
    const fechar = (resultado) => {
      dlg.close();
      $("dlg-ok").onclick = $("dlg-cancelar").onclick = null;
      resolve(resultado);
    };
    $("dlg-ok").onclick = () => fechar(true);
    $("dlg-cancelar").onclick = () => fechar(false);
    dlg.addEventListener("cancel", () => resolve(false), { once: true });
    dlg.showModal();
    $("dlg-cancelar").focus();
  });
}

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Alternativa para navegadores sem Clipboard API
    const ta = document.createElement("textarea");
    ta.value = texto;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/* ==========================================================
   ACESSIBILIDADE (preferências salvas no localStorage)
   ========================================================== */
const FONTE_MIN = 14;
const FONTE_MAX = 26;
const prefs = Object.assign(
  { fonte: 18, contraste: false },
  lerLocal("patota_prefs", {}),
);

function aplicarPrefs() {
  prefs.fonte = Math.min(FONTE_MAX, Math.max(FONTE_MIN, Number(prefs.fonte) || 18));
  root.style.fontSize = prefs.fonte + "px";
  if (prefs.contraste) root.setAttribute("data-contrast", "alto");
  else root.removeAttribute("data-contrast");
  $("btn-contrast").setAttribute("aria-pressed", String(prefs.contraste));
  $("btn-font-up").disabled = prefs.fonte >= FONTE_MAX;
  $("btn-font-down").disabled = prefs.fonte <= FONTE_MIN;
  gravarLocal("patota_prefs", prefs);
}

$("btn-font-up").addEventListener("click", () => {
  prefs.fonte += 2;
  aplicarPrefs();
  toast(`Texto em ${prefs.fonte}px`);
});
$("btn-font-down").addEventListener("click", () => {
  prefs.fonte -= 2;
  aplicarPrefs();
  toast(`Texto em ${prefs.fonte}px`);
});
$("btn-contrast").addEventListener("click", () => {
  prefs.contraste = !prefs.contraste;
  aplicarPrefs();
  toast(prefs.contraste ? "Alto contraste ligado" : "Alto contraste desligado");
});

/* ==========================================================
   ESTADO (localStorage)
   ========================================================== */
const estadoPadrao = () => ({
  aviso: "Sábado às 08:30 - Campo Comunitário (Levar colete)",
  cota: 10,
  saldoCaixa: 150.0,
  jogadores: [
    { nome: "Seu Carlos (Organizador)", pago: true, valorPago: 10 },
    { nome: "Lucas", pago: false, valorPago: 0 },
    { nome: "Seu Antônio", pago: true, valorPago: 10 },
  ],
  historico: [{ tipo: "entrada", desc: "Saldo inicial anterior", valor: 150.0 }],
  sorteio: null,
});

// Mesma chave da versão anterior: os dados já salvos continuam funcionando
const estado = Object.assign(estadoPadrao(), lerLocal("patota_dados", {}));

function salvarDados() {
  gravarLocal("patota_dados", estado);
  renderizarTudo();
}

/* ==========================================================
   ABAS (WAI-ARIA Tabs, com setas do teclado)
   ========================================================== */
const abas = [...document.querySelectorAll('[role="tab"]')];

function ativarAba(aba, focar = false) {
  abas.forEach((t) => {
    const ativa = t === aba;
    t.setAttribute("aria-selected", String(ativa));
    t.tabIndex = ativa ? 0 : -1;
    $(t.getAttribute("aria-controls")).hidden = !ativa;
  });
  if (focar) aba.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

abas.forEach((aba, i) => {
  aba.addEventListener("click", () => ativarAba(aba));
  aba.addEventListener("keydown", (e) => {
    let alvo = null;
    if (e.key === "ArrowRight") alvo = abas[(i + 1) % abas.length];
    if (e.key === "ArrowLeft") alvo = abas[(i - 1 + abas.length) % abas.length];
    if (e.key === "Home") alvo = abas[0];
    if (e.key === "End") alvo = abas[abas.length - 1];
    if (alvo) {
      e.preventDefault();
      ativarAba(alvo, true);
    }
  });
});

/* ==========================================================
   COMUNICAÇÃO: MURAL DO PRÓXIMO JOGO
   ========================================================== */
$("info-jogo").value = estado.aviso;

$("btn-salvar-aviso").addEventListener("click", () => {
  if (!exigirAdmin()) return;
  const texto = $("info-jogo").value.trim();
  if (!texto) {
    toast("Escreva o dia, o horário ou um recado antes de salvar.", "erro");
    $("info-jogo").focus();
    return;
  }
  estado.aviso = texto;
  salvarDados();
  toast("Aviso do próximo jogo atualizado!");
});

/* ==========================================================
   COORDENAÇÃO: COTA E LISTA DE PRESENÇA
   ========================================================== */
const selectCota = $("valor-cota");
selectCota.value = String(estado.cota);

selectCota.addEventListener("change", () => {
  if (!exigirAdmin()) return;
  estado.cota = Number(selectCota.value);
  salvarDados();
  toast(`Cota do dia: ${formatarMoeda(estado.cota)}`);
});

$("form-presenca").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("nome-jogador");
  const nome = input.value.trim();

  if (!nome) {
    input.setAttribute("aria-invalid", "true");
    toast("Digite o nome ou apelido do jogador.", "erro");
    input.focus();
    return;
  }
  input.removeAttribute("aria-invalid");
  estado.jogadores.push({ nome, pago: false, valorPago: 0 });
  estado.sorteio = null; // lista mudou: o sorteio anterior perdeu validade
  input.value = "";
  salvarDados();
  toast(`${nome} entrou na lista!`);
  input.focus();
});

function alternarPagamento(index) {
  if (!exigirAdmin()) return;
  const j = estado.jogadores[index];
  if (!j) return;

  if (!j.pago) {
    const valor = Number(selectCota.value);
    j.pago = true;
    j.valorPago = valor;
    estado.saldoCaixa = arred(estado.saldoCaixa + valor);
    estado.historico.unshift({ tipo: "entrada", desc: `Pix Cota - ${j.nome}`, valor });
    toast(`Pagamento de ${j.nome} registrado`);
  } else {
    estado.saldoCaixa = arred(estado.saldoCaixa - j.valorPago);
    estado.historico.unshift({ tipo: "saida", desc: `Estorno Cota - ${j.nome}`, valor: j.valorPago });
    j.pago = false;
    j.valorPago = 0;
    toast(`Pagamento de ${j.nome} estornado`);
  }
  salvarDados();
}

async function removerJogador(index) {
  if (!exigirAdmin()) return;
  const j = estado.jogadores[index];
  if (!j) return;
  const ok = await confirmar(
    "Remover da lista?",
    j.pago
      ? `${j.nome} já pagou ${formatarMoeda(j.valorPago)}. Ao remover, o valor será estornado do caixa.`
      : `${j.nome} será removido da lista de hoje.`,
    "Remover",
  );
  if (!ok) return;
  if (j.pago) {
    estado.saldoCaixa = arred(estado.saldoCaixa - j.valorPago);
    estado.historico.unshift({ tipo: "saida", desc: `Estorno Cota - ${j.nome}`, valor: j.valorPago });
  }
  estado.jogadores.splice(index, 1);
  estado.sorteio = null;
  salvarDados();
  toast(`${j.nome} saiu da lista`);
}

// Delegação de eventos: sem onclick inline
$("lista-jogadores").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-acao]");
  if (!btn) return;
  const i = Number(btn.dataset.index);
  if (btn.dataset.acao === "pagar") alternarPagamento(i);
  if (btn.dataset.acao === "remover") removerJogador(i);
});

$("btn-limpar-lista").addEventListener("click", async () => {
  if (!exigirAdmin()) return;
  const ok = await confirmar(
    "Começar uma nova lista?",
    "A lista de jogadores e o sorteio serão apagados. O saldo em caixa será mantido.",
    "Zerar o dia",
  );
  if (!ok) return;
  estado.jogadores = [];
  estado.sorteio = null;
  salvarDados();
  toast("Nova lista criada. O saldo em caixa foi mantido.");
});

/* ==========================================================
   COORDENAÇÃO: SORTEIO DE TIMES
   ========================================================== */
function embaralhar(lista) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

$("btn-sortear").addEventListener("click", () => {
  if (!exigirAdmin()) return;
  if (estado.jogadores.length < 2) {
    toast("Adicione pelo menos 2 jogadores para sortear.", "erro");
    return;
  }
  const embaralhados = embaralhar(estado.jogadores.map((j) => j.nome));
  const metade = Math.ceil(embaralhados.length / 2);
  estado.sorteio = {
    colete: embaralhados.slice(0, metade),
    camisa: embaralhados.slice(metade),
  };
  salvarDados();
  toast("Times sorteados!");
});

/* ==========================================================
   COOPERAÇÃO: LIVRO CAIXA
   ========================================================== */
$("form-despesa").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!exigirAdmin()) return;
  const inDesc = $("desc-despesa");
  const inValor = $("valor-despesa");
  const desc = inDesc.value.trim();
  const valor = parseFloat(inValor.value);

  if (!desc || !(valor > 0)) {
    toast("Informe o que foi pago e um valor maior que zero.", "erro");
    (desc ? inValor : inDesc).focus();
    return;
  }
  estado.saldoCaixa = arred(estado.saldoCaixa - valor);
  estado.historico.unshift({ tipo: "saida", desc, valor });
  inDesc.value = "";
  inValor.value = "";
  salvarDados();
  toast(`Gasto de ${formatarMoeda(valor)} descontado do caixa`);
});

$("btn-copiar-pix").addEventListener("click", async () => {
  const ok = await copiar($("chave-pix").textContent.trim());
  toast(ok ? "Chave Pix copiada!" : "Não foi possível copiar. Selecione a chave e copie manualmente.", ok ? "ok" : "erro");
});

$("btn-copiar-relatorio").addEventListener("click", async () => {
  const totalDia = estado.jogadores.reduce((acc, j) => acc + j.valorPago, 0);
  const listaNomes = estado.jogadores
    .map((j) => `- ${j.nome} (${j.pago ? "PAGO ✅" : "Pendente ⏳"})`)
    .join("\n");

  const texto =
    `⚽ *RESUMO DA PATOTA*\n📅 ${estado.aviso}\n\n` +
    `📋 *Jogadores (${estado.jogadores.length}):*\n${listaNomes || "- Nenhum jogador na lista"}\n\n` +
    `💵 *Arrecadado Hoje:* ${formatarMoeda(totalDia)}\n` +
    `💰 *Saldo Atual em Caixa:* ${formatarMoeda(estado.saldoCaixa)}`;

  const ok = await copiar(texto);
  toast(
    ok ? "Prestação de contas copiada! Cole no grupo do WhatsApp." : "Não foi possível copiar o texto.",
    ok ? "ok" : "erro",
  );
});

/* ==========================================================
   RENDERIZAÇÃO
   ========================================================== */
function estadoVazio(icone_, titulo, texto) {
  return `<div class="empty">${icone(icone_)}<strong>${titulo}</strong><span>${texto}</span></div>`;
}

function renderizarTudo() {
  // Mural
  $("aviso-atual").textContent = estado.aviso;
  $("cota-info").textContent = `Cota do dia: ${formatarMoeda(estado.cota)} por jogador`;
  aplicarAdminUI();

  // Lista de jogadores
  const ul = $("lista-jogadores");
  let arrecadado = 0;

  if (!estado.jogadores.length) {
    ul.innerHTML = `<li style="display:block;border:0;padding:0">${estadoVazio(
      "users",
      "Ninguém na lista ainda",
      "Digite um nome acima para confirmar o primeiro jogador.",
    )}</li>`;
  } else {
    ul.innerHTML = estado.jogadores
      .map((j, i) => {
        arrecadado += j.valorPago;
        const rotulo = j.pago
          ? `${icone("check")}Pago (${formatarMoeda(j.valorPago)})`
          : `${icone("clock")}Marcar pago (${formatarMoeda(Number(selectCota.value))})`;
        const aria = j.pago
          ? `${j.nome}: pago. Toque para estornar o pagamento.`
          : `${j.nome}: pendente. Toque para marcar como pago.`;
        return `
          <li>
            <span class="player-name">${esc(j.nome)}</span>
            <span class="player-actions">
              ${acoes(j, i, rotulo, aria)}
            </span>
          </li>`;
      })
      .join("");
  }

  $("contador-jogadores").textContent = estado.jogadores.length;
  $("arrecadado-hoje").textContent = formatarMoeda(arrecadado);
  $("saldo-caixa").textContent = formatarMoeda(estado.saldoCaixa);

  // Sorteio
  const n = estado.jogadores.length;
  $("sorteio-info").textContent =
    n < 2
      ? "Confirme pelo menos 2 jogadores na lista para sortear."
      : `${n} jogadores confirmados. Os times serão divididos de forma equilibrada.`;
  $("btn-sortear").lastChild.textContent = estado.sorteio ? "Sortear novamente" : "Sortear times";

  const box = $("resultado-sorteio");
  if (estado.sorteio) {
    const lista = (nomes) => nomes.map((nome) => `<li>${esc(nome)}</li>`).join("");
    box.innerHTML = `
      <div class="time time-colete">
        <h3><span>🟢 Time Colete</span><span>${estado.sorteio.colete.length}</span></h3>
        <ul>${lista(estado.sorteio.colete)}</ul>
      </div>
      <div class="time time-camisa">
        <h3><span>⚪ Time Camisa</span><span>${estado.sorteio.camisa.length}</span></h3>
        <ul>${lista(estado.sorteio.camisa)}</ul>
      </div>`;
  } else {
    box.innerHTML = estadoVazio("shuffle", "Nenhum sorteio feito", "Toque em “Sortear times” para dividir a turma.");
  }

  // Histórico do caixa (últimas 8 movimentações)
  const hist = $("historico-caixa");
  if (!estado.historico.length) {
    hist.innerHTML = `<li style="display:block;border:0;padding:0">${estadoVazio(
      "wallet",
      "Sem movimentações",
      "Pagamentos de cota e gastos do campo aparecem aqui.",
    )}</li>`;
  } else {
    hist.innerHTML = estado.historico
      .slice(0, 8)
      .map((item) => {
        const entrada = item.tipo === "entrada";
        return `
          <li class="${entrada ? "mov-entrada" : "mov-saida"}">
            <span class="mov-icon">${icone(entrada ? "in" : "out")}</span>
            <span class="mov-desc">${esc(item.desc)}</span>
            <span class="mov-valor"><span class="sr-only">${entrada ? "Entrada" : "Saída"} </span>${entrada ? "+" : "−"} ${formatarMoeda(item.valor)}</span>
          </li>`;
      })
      .join("");
  }
}

/* ==========================================================
   MODO ORGANIZADOR (PIN)
   Atenção: protege apenas a interface deste aparelho. Para proteção
   real entre vários aparelhos é preciso um servidor (login no backend).
   ========================================================== */
const CHAVE_ADMIN = "patota_admin";
let admin = false;
try {
  admin = sessionStorage.getItem("patota_admin_ativo") === "1";
} catch {
  admin = false;
}

async function hashPin(pin) {
  const texto = "patota:" + pin;
  if (window.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  let h = 5381; // alternativa simples se o navegador não tiver crypto.subtle
  for (const ch of texto) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
  return "s" + h;
}

function exigirAdmin() {
  if (admin) return true;
  toast("Só o organizador pode fazer isso. Toque em “Organizador” no topo.", "erro");
  return false;
}

function acoes(j, i, rotulo, aria) {
  if (admin) {
    return `<button type="button" class="btn-pay ${j.pago ? "pago" : "pendente"}"
        data-acao="pagar" data-index="${i}" aria-label="${esc(aria)}">${rotulo}</button>
      <button type="button" class="btn-icon" data-acao="remover" data-index="${i}"
        aria-label="Remover ${esc(j.nome)} da lista">${icone("x")}</button>`;
  }
  const status = j.pago ? `${icone("check")}Pago` : `${icone("clock")}Pendente`;
  return `<span class="badge ${j.pago ? "pago" : "pendente"}">${status}</span>`;
}

function aplicarAdminUI() {
  document.querySelectorAll(".admin-only").forEach((el) => (el.hidden = !admin));
  $("btn-admin").setAttribute("aria-pressed", String(admin));
  $("btn-admin-txt").textContent = admin ? "Sair do organizador" : "Organizador";
}

function pedirPin(titulo, texto) {
  return new Promise((resolve) => {
    const dlg = $("dlg-pin");
    const input = $("pin-input");
    $("pin-titulo").textContent = titulo;
    $("pin-texto").textContent = texto;
    $("pin-erro").textContent = "";
    input.value = "";
    $("form-pin").onsubmit = (e) => {
      e.preventDefault();
      dlg.close();
      resolve(input.value.trim());
    };
    $("pin-cancelar").onclick = () => {
      dlg.close();
      resolve(null);
    };
    dlg.addEventListener("cancel", () => resolve(null), { once: true });
    dlg.showModal();
    input.focus();
  });
}

function definirAdmin(valor) {
  admin = valor;
  try {
    sessionStorage.setItem("patota_admin_ativo", valor ? "1" : "0");
  } catch {
    /* ignora */
  }
  renderizarTudo();
}

$("btn-admin").addEventListener("click", async () => {
  if (admin) {
    definirAdmin(false);
    toast("Você saiu do modo organizador");
    return;
  }
  const salvo = lerLocal(CHAVE_ADMIN, null);
  if (!salvo) {
    const pin = await pedirPin(
      "Criar PIN do organizador",
      "Escolha um PIN de 4 a 8 números. Com ele, só você marca pagamentos e mexe no caixa.",
    );
    if (pin === null) return;
    if (!/^\d{4,8}$/.test(pin)) {
      toast("O PIN precisa ter de 4 a 8 números.", "erro");
      return;
    }
    gravarLocal(CHAVE_ADMIN, await hashPin(pin));
    definirAdmin(true);
    toast("PIN criado. Modo organizador ativado!");
  } else {
    const pin = await pedirPin("Entrar como organizador", "Digite o seu PIN.");
    if (pin === null) return;
    if ((await hashPin(pin)) !== salvo) {
      toast("PIN incorreto. Tente de novo.", "erro");
      return;
    }
    definirAdmin(true);
    toast("Modo organizador ativado");
  }
});

/* ==========================================================
   INÍCIO
   ========================================================== */
aplicarPrefs();
renderizarTudo();
