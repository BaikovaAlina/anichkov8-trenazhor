/* ============================================================
 * CONFIG.JS — НАСТРОЙКИ ТРЕНАЖЁРА «АНИЧКОВ ЛИЦЕЙ · 8 КЛАСС»
 * ============================================================
 * Токен бота и Chat ID НЕ хранятся в публичном репозитории!
 * В ветке main здесь лежат ТОЛЬКО плейсхолдеры. При деплое GitHub Actions
 * (.github/workflows/deploy.yml) подставляет реальные значения из GitHub Secrets:
 *   - TELEGRAM_BOT_TOKEN
 *   - TELEGRAM_CHAT_ID
 *
 * Поддерживается переопределение Chat ID (и токена — для локальной отладки)
 * через меню «⚙️ Настройки Telegram» (сохраняется в localStorage браузера).
 * ============================================================ */

const CONFIG = {
  // Telegram Bot API
  telegram: {
    // Плейсхолдеры для безопасного внедрения через GitHub Actions Secrets
    botToken: "__TELEGRAM_BOT_TOKEN__",
    chatId: "__TELEGRAM_CHAT_ID__",
    botUsername: "ZVEROKZVEROKBOT",
  },

  // Префикс ключей localStorage (не пересекается с эталоном math6_*)
  storagePrefix: "anichkov8_",

  teacherName: "Учитель математики",
  schoolName: "Поступление в 8 класс Аничкова лицея · Алгебра + Геометрия",

  // Шкала оценивания (в процентах от максимума) — как в эталоне
  gradeScale: {
    5: 85, // от 85% — «5»
    4: 68, // от 68% — «4»
    3: 50, // от 50% — «3»
    2: 0,  // менее 50% — «2»
  },
};

/**
 * Возвращает актуальный токен бота: localStorage (локальная отладка) → config.js (после деплоя).
 * Незаменённый плейсхолдер (начинается с "__") считается отсутствующим.
 * @returns {string}
 */
function getTelegramBotToken() {
  const localToken = localStorage.getItem(CONFIG.storagePrefix + "telegram_bot_token");
  if (localToken && localToken.trim()) return localToken.trim();
  if (CONFIG.telegram.botToken && !CONFIG.telegram.botToken.startsWith("__")) {
    return CONFIG.telegram.botToken.trim();
  }
  return "";
}

/**
 * Возвращает актуальный Chat ID: localStorage → config.js.
 * @returns {string}
 */
function getTelegramChatId() {
  const localChatId = localStorage.getItem(CONFIG.storagePrefix + "telegram_chat_id");
  if (localChatId && localChatId.trim()) return localChatId.trim();
  if (CONFIG.telegram.chatId && !CONFIG.telegram.chatId.startsWith("__")) {
    return CONFIG.telegram.chatId.trim();
  }
  return "";
}

/** Сохраняет Chat ID в localStorage (пустое значение — удаляет). @param {string} chatId */
function setTelegramChatId(chatId) {
  if (chatId) localStorage.setItem(CONFIG.storagePrefix + "telegram_chat_id", chatId.trim());
  else localStorage.removeItem(CONFIG.storagePrefix + "telegram_chat_id");
}

/** Сохраняет токен в localStorage (только для локального тестирования). @param {string} token */
function setTelegramBotToken(token) {
  if (token) localStorage.setItem(CONFIG.storagePrefix + "telegram_bot_token", token.trim());
  else localStorage.removeItem(CONFIG.storagePrefix + "telegram_bot_token");
}
