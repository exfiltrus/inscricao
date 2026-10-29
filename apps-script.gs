/**
 * Exfiltrus CTF: backend de inscrições (Google Apps Script + Google Sheets).
 * Cole este código em Extensões > Apps Script de uma planilha do Google.
 */

const MAX = 20;
const DEADLINE = new Date("2026-11-06T00:00:00-03:00");
const SHEET_NAME = "Inscricoes";

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(["data_hora", "nome_completo", "nickname", "email", "senha"]);
  }
  return sh;
}

function countRows_(sh) {
  return Math.max(sh.getLastRow() - 1, 0);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Evita que o conteúdo seja interpretado como fórmula na planilha.
function safe_(v) {
  v = String(v);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

// Consulta de vagas.
function doGet() {
  const sh = getSheet_();
  return json_({ count: countRows_(sh), max: MAX });
}

// Nova inscrição.
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = JSON.parse(e.postData.contents);
    const nome = String(d.nome || "").trim();
    const nick = String(d.nick || "").trim();
    const email = String(d.email || "").trim().toLowerCase();
    const senha = String(d.senha || "");

    if (new Date() >= DEADLINE) return json_({ ok: false, error: "closed" });

    if (nome.length < 5 || nome.length > 100 ||
        !/^[A-Za-z0-9_.-]{3,20}$/.test(nick) ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        senha.length < 8 || senha.length > 200) {
      return json_({ ok: false, error: "invalid" });
    }

    const sh = getSheet_();
    const total = countRows_(sh);
    if (total >= MAX) return json_({ ok: false, error: "full", count: total });

    if (total > 0) {
      const rows = sh.getRange(2, 3, total, 2).getValues(); // nickname, email
      for (const r of rows) {
        if (String(r[1]).toLowerCase() === email) return json_({ ok: false, error: "duplicate_email" });
        if (String(r[0]).toLowerCase() === nick.toLowerCase()) return json_({ ok: false, error: "duplicate_nick" });
      }
    }

    sh.appendRow([new Date(), safe_(nome), safe_(nick), safe_(email), safe_(senha)]);
    return json_({ ok: true, count: total + 1 });
  } catch (err) {
    return json_({ ok: false, error: "server" });
  } finally {
    lock.releaseLock();
  }
}
