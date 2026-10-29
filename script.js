/* ===================== CONFIGURAÇÃO ===================== */
const CONFIG = {
  // Cole aqui a URL do Web App do Google Apps Script (termina em /exec).
  // Se ficar vazio, o site roda em modo de teste (salva só no navegador).
  ENDPOINT: "",

  // Fim do evento: 6 de novembro de 2026, 00:00, horário de Brasília.
  DEADLINE: "2026-11-06T00:00:00-03:00",

  // Limite de inscrições.
  MAX: 20,

  // true = a senha vai para a planilha como hash SHA-256 (recomendado).
  // false = a senha vai em texto puro (não recomendado).
  HASH_PASSWORD: true,
};
/* ======================================================== */

const $ = (id) => document.getElementById(id);
const deadline = new Date(CONFIG.DEADLINE).getTime();
let count = null; // null = ainda carregando

/* ---------- logo: se logo.png não existir, esconde ---------- */
$("logo").addEventListener("error", () => { $("logo").style.display = "none"; });

/* ---------- chuva de código ---------- */
(function matrixRain() {
  const canvas = $("rain");
  const ctx = canvas.getContext("2d");
  const chars = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF<>/\\{}[]$#";
  const size = 16;
  let cols, drops;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    cols = Math.ceil(canvas.width / size);
    drops = Array.from({ length: cols }, () => Math.random() * -50);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function draw() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.07)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = size + "px monospace";
    for (let i = 0; i < cols; i++) {
      const ch = chars[Math.floor(Math.random() * chars.length)];
      const y = drops[i] * size;
      ctx.fillStyle = Math.random() > 0.975 ? "#c8ffd4" : "rgba(0, 255, 65, 0.55)";
      ctx.fillText(ch, i * size, y);
      if (y > canvas.height && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    }
  }

  resize();
  window.addEventListener("resize", resize);
  if (reduced) {
    for (let k = 0; k < 120; k++) draw(); // quadro estático
  } else {
    setInterval(draw, 50);
  }
})();

/* ---------- cronômetro ---------- */
const pad = (n) => String(n).padStart(2, "0");

function tick() {
  const diff = deadline - Date.now();
  const ended = diff <= 0;
  const total = Math.max(0, Math.floor(diff / 1000));
  $("t-d").textContent = pad(Math.floor(total / 86400));
  $("t-h").textContent = pad(Math.floor((total % 86400) / 3600));
  $("t-m").textContent = pad(Math.floor((total % 3600) / 60));
  $("t-s").textContent = pad(total % 60);
  $("timer").classList.toggle("ended", ended);
  if (ended) renderState();
}
tick();
setInterval(tick, 1000);

/* ---------- estado da inscrição ---------- */
function renderState() {
  const expired = Date.now() >= deadline;
  const full = count !== null && count >= CONFIG.MAX;
  const done = !$("done").hidden;

  if (done) return; // já mostrou "cadastro realizado"

  if (expired) {
    showClosed("prazo encerrado");
  } else if (full) {
    showClosed("inscrições encerradas");
  } else {
    $("form").hidden = false;
    $("closed").hidden = true;
  }

  if (count === null) {
    $("spots").textContent = "verificando vagas...";
  } else {
    const left = Math.max(0, CONFIG.MAX - count);
    $("spots").innerHTML = "vagas restantes: <strong></strong>";
    $("spots").querySelector("strong").textContent = left + " de " + CONFIG.MAX;
  }
}

function showClosed(text) {
  $("form").hidden = true;
  $("closed").hidden = false;
  $("closed-text").textContent = text;
}

/* ---------- comunicação com a planilha ---------- */
const LOCAL_KEY = "exfiltrus_demo";
const localRows = () => JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");

async function fetchCount() {
  try {
    if (!CONFIG.ENDPOINT) {
      count = localRows().length;
    } else {
      const res = await fetch(CONFIG.ENDPOINT, { method: "GET" });
      const data = await res.json();
      count = Number(data.count);
    }
  } catch (err) {
    count = null;
    $("spots").textContent = "não foi possível verificar as vagas agora.";
    return;
  }
  renderState();
}

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sendRegistration(payload) {
  if (!CONFIG.ENDPOINT) {
    const rows = localRows();
    if (rows.length >= CONFIG.MAX) return { ok: false, error: "full" };
    if (rows.some((r) => r.email === payload.email)) return { ok: false, error: "duplicate_email" };
    if (rows.some((r) => r.nick.toLowerCase() === payload.nick.toLowerCase())) return { ok: false, error: "duplicate_nick" };
    rows.push(payload);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(rows));
    return { ok: true, count: rows.length };
  }
  // text/plain evita o preflight CORS, que o Apps Script não responde.
  const res = await fetch(CONFIG.ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

/* ---------- formulário ---------- */
const ERRORS = {
  full: "as vagas acabaram. inscrições encerradas.",
  closed: "o prazo acabou. inscrições encerradas.",
  duplicate_email: "esse email já está cadastrado.",
  duplicate_nick: "esse nickname já está em uso. escolha outro.",
  invalid: "dados inválidos. confira os campos.",
  server: "erro no servidor. tente de novo em instantes.",
};

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("msg");
  msg.textContent = "";

  const nome = $("nome").value.trim();
  const nick = $("nick").value.trim();
  const email = $("email").value.trim().toLowerCase();
  const senha = $("senha").value;

  if (nome.split(/\s+/).length < 2 || nome.length < 5) { msg.textContent = "informe o nome completo."; return; }
  if (!/^[A-Za-z0-9_.-]{3,20}$/.test(nick)) { msg.textContent = "nickname: 3 a 20 caracteres (letras, números, _ - .)."; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = "email inválido."; return; }
  if (senha.length < 8) { msg.textContent = "a senha precisa ter no mínimo 8 caracteres."; return; }
  if (Date.now() >= deadline) { renderState(); return; }

  const btn = $("submit");
  btn.disabled = true;
  btn.textContent = "registrando...";

  try {
    const senhaFinal = CONFIG.HASH_PASSWORD ? await sha256(email + ":" + senha) : senha;
    const result = await sendRegistration({ nome, nick, email, senha: senhaFinal });

    if (result.ok) {
      count = Number(result.count);
      $("done-nick").textContent = nick;
      $("form").hidden = true;
      $("done").hidden = false;
      $("form").reset();
      renderState();
    } else {
      msg.textContent = ERRORS[result.error] || ERRORS.server;
      if (result.error === "full") count = CONFIG.MAX;
      renderState();
    }
  } catch (err) {
    msg.textContent = ERRORS.server;
  } finally {
    btn.disabled = false;
    btn.textContent = "entrar no exfiltrus";
  }
});

fetchCount();
