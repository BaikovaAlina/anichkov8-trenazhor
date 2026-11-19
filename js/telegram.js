/* ============================================================
 * TELEGRAM.JS — ОТПРАВКА РЕЗУЛЬТАТОВ УЧИТЕЛЮ (Telegram Bot API, без бэкенда)
 * ============================================================
 * Схема эталона: fetch → https://api.telegram.org/bot<TOKEN>/sendMessage,
 * parse_mode: HTML. Токен/Chat ID берутся из config.js (подставлены из GitHub
 * Secrets при деплое) или из localStorage (меню «⚙️ Настройки Telegram»).
 * ============================================================ */

"use strict";

/** Экранирование пользовательского текста для parse_mode=HTML. @param {*} s @returns {string} */
function tgEscape(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Форматирует секунды в mm:ss.
 * @param {number} totalSec
 * @returns {string}
 */
function formatMMSS(totalSec) {
  const s = Math.max(0, Math.round(totalSec || 0));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/**
 * Формирует текст отчёта (форма и порядок полей — как в эталоне).
 * Обязательные поля: Ученик, Урок, Результат X/Y, Время mm:ss.
 * @param {{studentName:string, title:string, topic:string, totalScore:number, maxScore:number,
 *          percent:number, gradeText:string, timeSec:number, date:string,
 *          mistakes:Array<{qNum:string,qTitle:string,userVal:string,correctVal:string}>}} r
 * @returns {string} HTML-текст для parse_mode=HTML
 */
function buildTelegramMessage(r) {
  const name = r.studentName || "Ученик (без имени)";
  let msg = `📚 <b>Тренажёр по математике · Поступление в 8 класс Аничкова лицея</b>\n\n`;
  msg += `👤 <b>Ученик:</b> ${tgEscape(name)}\n`;
  msg += `📖 <b>Урок:</b> ${tgEscape(r.title)}\n`;
  msg += `📌 <b>Тема:</b> ${tgEscape(r.topic)}\n`;
  msg += `📊 <b>Результат:</b> ${r.totalScore}/${r.maxScore} (${r.percent}%)\n`;
  msg += `⏱ <b>Время:</b> ${formatMMSS(r.timeSec)}\n`;
  msg += `🏆 <b>Оценка:</b> ${tgEscape(r.gradeText)}\n`;
  msg += `📅 <b>Дата:</b> ${tgEscape(r.date)}\n\n`;

  const mistakes = r.mistakes || [];
  if (mistakes.length === 0) {
    msg += `✅ <b>Все задания выполнены безупречно!</b> 🌟`;
  } else {
    msg += `⚠️ <b>Ошибки в заданиях (${mistakes.length}):</b>\n`;
    mistakes.slice(0, 25).forEach((m) => {
      msg += `• Зад. ${tgEscape(m.qNum)} (${tgEscape(m.qTitle)}): ответ "${tgEscape(m.userVal)}", верно "${tgEscape(m.correctVal)}"\n`;
    });
    if (mistakes.length > 25) msg += `… и ещё ${mistakes.length - 25}\n`;
  }
  return msg;
}

/**
 * Отправляет сообщение учителю через Telegram Bot API (sendMessage) прямо из браузера.
 * @param {string} text - HTML-текст сообщения
 * @param {string} [chatIdOverride] - Chat ID (по умолчанию из настроек/config.js)
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
async function sendToTelegram(text, chatIdOverride) {
  const botToken = getTelegramBotToken();
  const chatId = (chatIdOverride || getTelegramChatId() || "").trim();
  if (!botToken) return { ok: false, error: "NO_TOKEN" };
  if (!chatId) return { ok: false, error: "NO_CHAT" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    const data = await res.json();
    if (res.ok && data.ok) return { ok: true };
    return { ok: false, error: data.description || `HTTP ${res.status}` };
  } catch (err) {
    console.error("Telegram send error:", err);
    return { ok: false, error: err.message || String(err) };
  }
}

/**
 * Показ статуса отправки в элементе .send-status-msg (классы ok / err / wait — как в эталоне).
 * @param {string} elId
 * @param {"ok"|"err"|"wait"} type
 * @param {string} text
 */
function showStatusMsg(elId, type, text) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.className = `send-status-msg ${type}`;
  el.textContent = text;
}

/**
 * Отправка с UI-обработкой ошибок (используется и в тренажёре, и на странице урока).
 * @param {string[]} messages - один или несколько отчётов
 * @param {string} statusElId - id элемента статуса
 * @returns {Promise<boolean>}
 */
async function sendReportsWithUI(messages, statusElId) {
  if (!getTelegramChatId()) {
    showStatusMsg(statusElId, "err", "⚠️ Chat ID учителя не указан! Нажмите «⚙️ Настройки Telegram» вверху страницы и введите ваш Chat ID.");
    openTelegramSettingsModal();
    return false;
  }
  if (!getTelegramBotToken()) {
    showStatusMsg(statusElId, "err", "⚠️ Токен Telegram-бота не найден! Настройте GitHub Secrets (см. README).");
    return false;
  }
  showStatusMsg(statusElId, "wait", "Отправляю отчёт учителю в Telegram... ⏳");
  for (const text of messages) {
    const res = await sendToTelegram(text);
    if (!res.ok) {
      showStatusMsg(statusElId, "err", `❌ Ошибка отправки: ${res.error}. Проверьте Chat ID и напишите боту @${CONFIG.telegram.botUsername} команду /start.`);
      return false;
    }
  }
  showStatusMsg(statusElId, "ok", "✅ Результат успешно отправлен учителю в Telegram!");
  return true;
}

/* ---------------- Модальное окно «⚙️ Настройки Telegram» (как в эталоне) ---------------- */

function openTelegramSettingsModal() {
  const modal = document.getElementById("settingsModal");
  if (!modal) return;
  const input = document.getElementById("settingChatId");
  if (input) input.value = getTelegramChatId();
  modal.classList.add("open");
}

function closeTelegramSettingsModal() {
  const modal = document.getElementById("settingsModal");
  if (modal) modal.classList.remove("open");
}

/** Сохранение Chat ID в браузере. */
function saveTelegramSettings() {
  const input = document.getElementById("settingChatId");
  if (!input) return;
  setTelegramChatId(input.value.trim());
  showStatusMsg("settingStatusMsg", "ok", "✅ Chat ID успешно сохранён в браузере!");
  setTimeout(closeTelegramSettingsModal, 1200);
}

/** Тестовая отправка сообщения из настроек. */
async function testTelegramPing() {
  const input = document.getElementById("settingChatId");
  const chatId = input ? input.value.trim() : "";
  if (!chatId) {
    showStatusMsg("settingStatusMsg", "err", "⚠️ Сначала введите Chat ID!");
    return;
  }
  if (!getTelegramBotToken()) {
    showStatusMsg("settingStatusMsg", "err", "⚠️ Токен Telegram-бота не найден!");
    return;
  }
  showStatusMsg("settingStatusMsg", "wait", "Отправляю тестовый сигнал боту... ⏳");
  const text = `🔔 <b>Тестовое подключение успешно!</b>\n\nТренажёр «Аничков лицей · 8 класс» подключён к Telegram-боту @${CONFIG.telegram.botUsername}. Отчёты учеников будут приходить в этот чат! 🎉`;
  const res = await sendToTelegram(text, chatId);
  if (res.ok) {
    setTelegramChatId(chatId);
    showStatusMsg("settingStatusMsg", "ok", "🎉 Сообщение доставлено в Telegram! Связь установлена.");
  } else {
    showStatusMsg("settingStatusMsg", "err", `❌ Ошибка: ${res.error}. Убедитесь, что вы нажали /start боту @${CONFIG.telegram.botUsername}.`);
  }
}
