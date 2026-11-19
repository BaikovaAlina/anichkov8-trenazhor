/* ============================================================
 * APP.JS — ДВИЖОК ТРЕНАЖЁРА «АНИЧКОВ ЛИЦЕЙ · 8 КЛАСС»
 * ============================================================
 * Логика эталона (math6-trenazhor/script.js) сохранена:
 *   слайды-«тетрадные листы», навигация ◀ ▶, «Проверить ответ ✏️»,
 *   итоговый слайд с баллами/оценкой/разбором, отправка в Telegram, отчёт .txt.
 * Добавлено:
 *   1. Hash-роутинг: lesson.html#/lesson/7, trainer.html#/K-7 (и ?variant=K-7 как в эталоне)
 *   2. Рендер главной / урока / статистики из данных (js/tasks.js ← data/*.json)
 *   3. Типы заданий: ввод, выбор варианта, перетаскивание точки на клетчатом чертеже
 *   4. Пояснение к правильному ответу при ошибке
 *   5. Статистика сессии и уроков в localStorage
 * ============================================================ */

"use strict";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Экранирование для HTML-атрибутов и текста. @param {*} s @returns {string} */
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Отображаемое имя варианта: K-7 → «К-7», D-7 → «Д-7». @param {string} key */
function variantLabel(key) {
  return key.replace(/^K-/, "К-").replace(/^D-/, "Д-");
}

/** Поиск урока по номеру. @param {number} num */
function getLesson(num) {
  return LESSONS_DATA.lessons.find((l) => l.num === Number(num));
}

/** Модуль по номеру. @param {number} num */
function getModule(num) {
  return LESSONS_DATA.modules.find((m) => m.num === Number(num));
}

/* ============================================================
 * ФОРМАТИРОВАНИЕ ВЕРТИКАЛЬНЫХ ДРОБЕЙ (из эталона, без изменений)
 * ============================================================ */

/**
 * Превращает «3/4», «2 1/3», «(a+b)/(a-b)» в дроби с горизонтальной чертой.
 * @param {string} text
 * @returns {string} HTML
 */
function formatMath(text) {
  if (!text || typeof text !== "string") return text;

  const urls = [];
  text = text.replace(/https?:\/\/[^\s"'<>]+/g, (m) => {
    urls.push(m);
    return `___URL_${urls.length - 1}___`;
  });

  text = text.replace(
    /\(([^)]+)\)\s*\/\s*\(([^)]+)\)/g,
    `<span class="frac"><span class="num">$1</span><span class="den">$2</span></span>`
  );
  text = text.replace(
    /\(([^)]+)\)\s*\/\s*([a-zA-Zа-яА-Я0-9]+)/g,
    `<span class="frac"><span class="num">$1</span><span class="den">$2</span></span>`
  );
  text = text.replace(
    /(?<![<a-zA-Z0-9\/:\\])([a-zA-Zа-яА-Я0-9]+)\s*\/\s*\(([^)]+)\)/g,
    `<span class="frac"><span class="num">$1</span><span class="den">$2</span></span>`
  );
  text = text.replace(
    /(?<![<a-zA-Z0-9\/:\\])([-−]?\d+)\s+(\d+)\s*\/\s*(\d+)(?![a-zA-Z0-9\/>])/g,
    `<span class="mixed-num">$1<span class="frac"><span class="num">$2</span><span class="den">$3</span></span></span>`
  );
  text = text.replace(
    /(?<![<a-zA-Z0-9\/:\\])[-−]\s*([a-zA-Zа-яА-Я0-9]+)\s*\/\s*([a-zA-Zа-яА-Я0-9]+)(?![a-zA-Z0-9\/>])/g,
    `<span class="neg-frac"><span class="frac"><span class="num">$1</span><span class="den">$2</span></span></span>`
  );
  text = text.replace(
    /(?<![<a-zA-Z0-9\/:\\])([a-zA-Zа-яА-Я0-9]+)\s*\/\s*([a-zA-Zа-яА-Я0-9]+)(?![a-zA-Z0-9\/>])/g,
    `<span class="frac"><span class="num">$1</span><span class="den">$2</span></span>`
  );

  text = text.replace(/___URL_(\d+)___/g, (_, i) => urls[i]);
  return text;
}

/* ============================================================
 * СТАТИСТИКА (localStorage)
 * ============================================================ */

const Stats = {
  key: () => CONFIG.storagePrefix + "stats",

  /** @returns {{sessionStart:string, session:{correct:number,incorrect:number,works:number}, lessons:Object}} */
  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.key()) || "null");
      if (raw && raw.session && raw.lessons) return raw;
    } catch (e) { /* повреждённые данные — начинаем заново */ }
    return { sessionStart: new Date().toLocaleString("ru-RU"), session: { correct: 0, incorrect: 0, works: 0 }, lessons: {} };
  },

  save(data) {
    localStorage.setItem(this.key(), JSON.stringify(data));
  },

  /** Запись по варианту (создаётся при первом обращении). */
  entry(data, vKey) {
    if (!data.lessons[vKey]) {
      data.lessons[vKey] = { correct: 0, incorrect: 0, attempts: 0, best: 0, last: null };
    }
    return data.lessons[vKey];
  },

  /**
   * Учёт первой проверки поля: верно/неверно (повторные проверки того же поля не считаются).
   * @param {string} vKey
   * @param {number} ok - число верных
   * @param {number} bad - число неверных
   */
  recordChecks(vKey, ok, bad) {
    if (!ok && !bad) return;
    const d = this.load();
    const e = this.entry(d, vKey);
    d.session.correct += ok;
    d.session.incorrect += bad;
    e.correct += ok;
    e.incorrect += bad;
    this.save(d);
  },

  /** Сохранение итога работы. @param {string} vKey @param {Object} result */
  recordAttempt(vKey, result) {
    const d = this.load();
    const e = this.entry(d, vKey);
    e.attempts += 1;
    e.best = Math.max(e.best, result.percent);
    e.last = result;
    d.session.works += 1;
    this.save(d);
  },

  newSession() {
    const d = this.load();
    d.session = { correct: 0, incorrect: 0, works: 0 };
    d.sessionStart = new Date().toLocaleString("ru-RU");
    this.save(d);
  },

  resetAll() {
    localStorage.removeItem(this.key());
  },
};

/* ============================================================
 * ГЛАВНАЯ: СПИСОК МОДУЛЕЙ И УРОКОВ
 * ============================================================ */

const BADGE_CLASS = { base: "badge-base", adv: "badge-adv", oly: "badge-oly" };

/** Рендер модулей на главной странице. */
function renderIndex() {
  const cont = $("#modulesContainer");
  if (!cont) return;
  let html = "";
  LESSONS_DATA.modules.forEach((mod) => {
    html += `
      <section class="module-block" data-module="${mod.num}">
        <div class="module-header">
          <div class="module-num">${mod.num}</div>
          <h2 class="module-title">${esc(mod.title)}</h2>
        </div>
        <div class="lesson-grid">`;
    LESSONS_DATA.lessons.filter((l) => l.module === mod.num).forEach((l) => {
      html += `
          <div class="lesson-card" data-level="${l.level}">
            <div class="lesson-top">
              <div class="lesson-meta">
                <span>Урок ${l.num} · ${esc(mod.section)}</span>
                <span class="badge ${BADGE_CLASS[l.level]}">${esc(l.badge)}</span>
              </div>
              <h4><a href="lesson.html#/lesson/${l.num}">${esc(l.title)}</a></h4>
            </div>
            <div class="lesson-actions">
              <a href="trainer.html?variant=K-${l.num}" class="btn-lesson btn-cw">К-${l.num} · Классная</a>
              <a href="trainer.html?variant=D-${l.num}" class="btn-lesson btn-hw">Д-${l.num} · Домашняя</a>
              <button class="btn-lesson btn-theory" onclick="openTheoryModal(${l.num})" title="Теория и памятка">📖</button>
            </div>
          </div>`;
    });
    html += `</div></section>`;
  });
  cont.innerHTML = html;
}

/**
 * Фильтрация карточек по уровню (логика эталона).
 * @param {"all"|"base"|"adv"|"oly"} level
 * @param {HTMLElement} btn
 */
function filterLessons(level, btn) {
  $$(".filter-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  $$(".lesson-card").forEach((card) => {
    const cl = card.dataset.level;
    const show =
      level === "all" ||
      (level === "base" && cl === "base") ||
      (level === "adv" && (cl === "adv" || cl === "oly")) ||
      (level === "oly" && cl === "oly");
    card.style.display = show ? "flex" : "none";
  });
  $$(".module-block").forEach((mod) => {
    const visible = mod.querySelectorAll('.lesson-card:not([style*="display: none"])');
    mod.style.display = visible.length === 0 ? "none" : "block";
  });
}

/* ============================================================
 * СТРАНИЦА УРОКА: «Классная работа» + «Домашнее задание»
 * ============================================================ */

/** Количество заданий (строк) в варианте. @param {string} vKey */
function countTasks(vKey) {
  const v = TASKS[vKey];
  return v ? v.questions.reduce((s, q) => s + q.tasks.length, 0) : 0;
}

/** Рендер страницы урока по hash #/lesson/N. */
function renderLessonPage() {
  const m = location.hash.match(/lesson\/(\d+)/);
  const num = m ? Number(m[1]) : 1;
  const lesson = getLesson(num) || LESSONS_DATA.lessons[0];
  const mod = getModule(lesson.module);
  const stats = Stats.load();

  document.title = `Урок ${lesson.num} · ${lesson.title} — Аничков лицей · 8 класс`;
  $("#lessonTitle").textContent = `Урок ${lesson.num} · ${lesson.short}`;
  $("#lessonTopic").textContent = `Модуль ${mod.num}: ${mod.title} · ${lesson.title}`;

  const card = (kind) => {
    const vKey = `${kind}-${lesson.num}`;
    const v = TASKS[vKey];
    const e = stats.lessons[vKey];
    const isK = kind === "K";
    const last = e && e.last
      ? `Последний результат: <b>${e.last.totalScore}/${e.last.maxScore}</b> (${e.last.percent}%) · ${formatMMSS(e.last.timeSec)}`
      : "Ещё не выполнялась";
    return `
      <div class="lesson-card" data-level="${lesson.level}">
        <div class="lesson-top">
          <div class="lesson-meta">
            <span>${variantLabel(vKey)} · ${countTasks(vKey)} заданий</span>
            <span class="badge ${BADGE_CLASS[lesson.level]}">${esc(lesson.badge)}</span>
          </div>
          <h4>${isK ? "✏️ Классная работа" : "🏠 Домашнее задание"}</h4>
          <p style="font-size:14px; color:#4f422e; margin-top:6px;">${esc(v.topic)}</p>
          <p style="font-size:13px; color:#8c7857; margin-top:6px;">${last}</p>
          <p style="font-size:13px; color:#8c7857;">Верно: ${e ? e.correct : 0} · Ошибок: ${e ? e.incorrect : 0} · Лучший: ${e ? e.best : 0}%</p>
        </div>
        <div class="lesson-actions">
          <a href="trainer.html?variant=${vKey}" class="btn-lesson ${isK ? "btn-cw" : "btn-hw"}">${isK ? "Начать классную работу ▶" : "Начать домашнюю работу ▶"}</a>
        </div>
      </div>`;
  };

  $("#lessonWorks").innerHTML = card("K") + card("D");

  const th = lesson.theory;
  let tHtml = `
    <div class="margin-line"></div>
    <div class="crumb">Урок ${lesson.num} · Теория и памятка</div>
    <h2 class="task-heading"><span class="task-num-badge">📖</span>${esc(lesson.title)}</h2>
    <div class="task-sub">— ${esc(th.source)}</div>`;
  th.rules.forEach((r) => { tHtml += `<div class="theory-rule-item">📌 ${formatMath(r)}</div>`; });
  if (th.sample) tHtml += `<div class="theory-sample"><b>💡 Пример решения:</b><br>${formatMath(th.sample)}</div>`;
  const theorySlide = $("#lessonTheory");
  theorySlide.innerHTML = tHtml;
  theorySlide.style.minHeight = "0";

  const prev = getLesson(lesson.num - 1);
  const next = getLesson(lesson.num + 1);
  $("#lessonNav").innerHTML = `
    ${prev ? `<a href="lesson.html#/lesson/${prev.num}" class="btn-nav" style="text-decoration:none;">◀ Урок ${prev.num}</a>` : ""}
    <a href="index.html" class="btn-nav" style="text-decoration:none;">📚 Ко всем урокам</a>
    ${next ? `<a href="lesson.html#/lesson/${next.num}" class="btn-nav" style="text-decoration:none;">Урок ${next.num} ▶</a>` : ""}`;

  const nameInp = $("#lessonStudentName");
  nameInp.value = localStorage.getItem(CONFIG.storagePrefix + "student_name") || "";
  $("#lessonSendBtn").onclick = () => sendLessonResults(lesson.num);
  $("#lessonStatusMsg").className = "send-status-msg";
  window.scrollTo({ top: 0 });
}

/**
 * Отправка последних результатов К- и Д-работ урока в Telegram.
 * @param {number} num - номер урока
 */
async function sendLessonResults(num) {
  const name = $("#lessonStudentName").value.trim();
  if (name) localStorage.setItem(CONFIG.storagePrefix + "student_name", name);
  const stats = Stats.load();
  const messages = ["K", "D"]
    .map((k) => stats.lessons[`${k}-${num}`])
    .filter((e) => e && e.last)
    .map((e) => buildTelegramMessage({ ...e.last, studentName: name || e.last.studentName }));
  if (!messages.length) {
    showStatusMsg("lessonStatusMsg", "err", "⚠️ Сначала выполните классную или домашнюю работу этого урока — потом отправьте результат.");
    return;
  }
  await sendReportsWithUI(messages, "lessonStatusMsg");
}

/* ============================================================
 * ТРЕНАЖЁР
 * ============================================================ */

const appState = {
  studentName: "",
  variantKey: "K-1",
  slides: [],
  currentSlide: 0,
  startTime: null,
  results: null,
  recorded: false,
};

/** Заполнение выпадающего списка работ (группы по модулям — как в эталоне). */
function buildVariantSelect() {
  const sel = $("#variantSelect");
  if (!sel) return;
  let html = "";
  LESSONS_DATA.modules.forEach((mod) => {
    html += `<optgroup label="Модуль ${mod.num}: ${esc(mod.title)}">`;
    LESSONS_DATA.lessons.filter((l) => l.module === mod.num).forEach((l) => {
      html += `<option value="K-${l.num}">Урок ${l.num} · К-${l.num} (Классная) — ${esc(l.short)}</option>`;
      html += `<option value="D-${l.num}">Урок ${l.num} · Д-${l.num} (Домашняя) — ${esc(l.short)}</option>`;
    });
    html += `</optgroup>`;
  });
  sel.innerHTML = html;
}

/** Ключ варианта из URL: ?variant=K-1 (эталон) или #/K-1. @returns {string|null} */
function variantFromUrl() {
  const p = new URLSearchParams(location.search).get("variant");
  const h = (location.hash.match(/#\/?([KD]-\d+)/) || [])[1];
  const key = h || p;
  return key && TASKS[key] ? key : null;
}

function initTrainer() {
  const savedName = localStorage.getItem(CONFIG.storagePrefix + "student_name") || "";
  const nameInput = $("#studentNameInput");
  if (nameInput) {
    nameInput.value = savedName;
    appState.studentName = savedName;
    nameInput.addEventListener("input", (e) => {
      appState.studentName = e.target.value.trim();
      localStorage.setItem(CONFIG.storagePrefix + "student_name", appState.studentName);
    });
  }

  buildVariantSelect();
  appState.variantKey = variantFromUrl() || "K-1";

  const variantSelect = $("#variantSelect");
  if (variantSelect) {
    variantSelect.value = appState.variantKey;
    variantSelect.addEventListener("change", (e) => {
      history.replaceState(null, "", `trainer.html?variant=${e.target.value}`);
      loadVariant(e.target.value);
    });
  }

  window.addEventListener("hashchange", () => {
    const k = variantFromUrl();
    if (k && k !== appState.variantKey) {
      if (variantSelect) variantSelect.value = k;
      loadVariant(k);
    }
  });

  loadVariant(appState.variantKey);
  setupEvents();
}

/**
 * HTML поля ответа по типу.
 * @param {Object} inp - метаданные поля {a, type, w, g, options?, grid?}
 * @param {string} id
 * @param {Object} q - вопрос (для data-qnum/qtitle)
 * @returns {string}
 */
function renderInput(inp, id, q) {
  const common = `id="${id}" data-answer="${esc(inp.a)}" data-type="${esc(inp.type || "")}"
    data-weight="${inp.w || 1}" data-group="${esc(inp.g || "")}"
    data-qnum="${esc(q.num)}" data-qtitle="${esc(q.title)}"`;

  if (inp.type === "choice") {
    const opts = inp.options.map((o, i) =>
      `<button type="button" class="choice-btn" data-value="${esc(o)}" data-input="${id}">${formatMath(esc(o))}</button>`
    ).join("");
    return `<span class="choice-group" id="${id}_wrap" role="radiogroup">${opts}</span>
      <input type="hidden" class="math-input" data-wrap="${id}_wrap" ${common} />`;
  }

  if (inp.type === "point") {
    return `<span class="geo-board" id="${id}_wrap">${renderGeoSvg(inp.grid, id)}
      <span class="geo-readout" id="${id}_readout">Перетащите точку ${esc(inp.grid.label || "")} на чертеже</span></span>
      <input type="hidden" class="math-input" data-wrap="${id}_wrap" ${common} />`;
  }

  return `<input type="text" class="math-input" ${common}
    placeholder="ответ" autocomplete="off" autocapitalize="off" spellcheck="false" />`;
}

/* ---------------- Клетчатый чертёж с перетаскиванием точки ---------------- */

const GEO_UNIT = 28; // шаг клетки = шагу тетрадной сетки эталона
const GEO_PAD = 16;

/**
 * SVG-чертёж: сетка, оси, данные точки/отрезки/прямые/окружности, перетаскиваемая точка.
 * @param {{x:number[], y:number[], axes?:boolean, pts?:Object, segs?:Array, polys?:Array,
 *          lines?:Array, vlines?:number[], curves?:Array, hyper?:number[], circles?:Array,
 *          label?:string}} g  curves: [[a,m,n]] → y=a(x−m)²+n; hyper: [k] → y=k/x
 * @param {string} id
 * @returns {string}
 */
function renderGeoSvg(g, id) {
  const [x0, x1] = g.x;
  const [y0, y1] = g.y;
  const W = (x1 - x0) * GEO_UNIT + 2 * GEO_PAD;
  const H = (y1 - y0) * GEO_UNIT + 2 * GEO_PAD;
  const X = (x) => GEO_PAD + (x - x0) * GEO_UNIT;
  const Y = (y) => GEO_PAD + (y1 - y) * GEO_UNIT;
  let s = `<svg viewBox="0 0 ${W} ${H}" tabindex="0" data-geo="${id}"
    data-x0="${x0}" data-x1="${x1}" data-y0="${y0}" data-y1="${y1}" aria-label="Чертёж: перетащите точку">`;
  s += `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`;
  for (let x = x0; x <= x1; x++) s += `<line x1="${X(x)}" y1="${Y(y0)}" x2="${X(x)}" y2="${Y(y1)}" stroke="#C9D9E8" stroke-width="1"/>`;
  for (let y = y0; y <= y1; y++) s += `<line x1="${X(x0)}" y1="${Y(y)}" x2="${X(x1)}" y2="${Y(y)}" stroke="#C9D9E8" stroke-width="1"/>`;

  if (g.axes) {
    s += `<line x1="${X(x0)}" y1="${Y(0)}" x2="${X(x1)}" y2="${Y(0)}" stroke="#2B2B2B" stroke-width="1.5"/>`;
    s += `<line x1="${X(0)}" y1="${Y(y0)}" x2="${X(0)}" y2="${Y(y1)}" stroke="#2B2B2B" stroke-width="1.5"/>`;
    s += `<text x="${X(x1) - 10}" y="${Y(0) - 6}" font-size="13" fill="#2B2B2B">x</text>`;
    s += `<text x="${X(0) + 6}" y="${Y(y1) + 12}" font-size="13" fill="#2B2B2B">y</text>`;
    s += `<text x="${X(1) - 3}" y="${Y(0) + 15}" font-size="11" fill="#705e41">1</text>`;
    s += `<text x="${X(0) - 12}" y="${Y(1) + 4}" font-size="11" fill="#705e41">1</text>`;
  }

  (g.lines || []).forEach(([k, b]) => {
    s += `<line x1="${X(x0)}" y1="${Y(k * x0 + b)}" x2="${X(x1)}" y2="${Y(k * x1 + b)}" stroke="#2E5D4B" stroke-width="2"/>`;
  });
  (g.vlines || []).forEach((a) => {
    s += `<line x1="${X(a)}" y1="${Y(y0)}" x2="${X(a)}" y2="${Y(y1)}" stroke="#2E5D4B" stroke-width="2" stroke-dasharray="6 4"/>`;
  });
  // Кривые строятся ломаной с мелким шагом и обрезаются по рамке сетки
  const plot = (f) => {
    let d = "", pen = false;
    for (let i = 0; i <= 400; i++) {
      const x = x0 + ((x1 - x0) * i) / 400;
      const y = f(x);
      if (!isFinite(y) || y < y0 || y > y1) { pen = false; continue; }
      d += `${pen ? "L" : "M"}${X(x).toFixed(1)},${Y(y).toFixed(1)} `;
      pen = true;
    }
    return `<path d="${d}" fill="none" stroke="#2E5D4B" stroke-width="2"/>`;
  };
  (g.curves || []).forEach(([a, m, n]) => { s += plot((x) => a * (x - m) * (x - m) + n); });
  (g.hyper || []).forEach((k) => { s += plot((x) => (Math.abs(x) < 1e-9 ? NaN : k / x)); });
  (g.circles || []).forEach(([cx, cy, r]) => {
    s += `<circle cx="${X(cx)}" cy="${Y(cy)}" r="${r * GEO_UNIT}" fill="none" stroke="#2E5D4B" stroke-width="2"/>`;
  });
  const P = g.pts || {};
  (g.polys || []).forEach((poly) => {
    const pts = poly.map((n) => `${X(P[n][0])},${Y(P[n][1])}`).join(" ");
    s += `<polygon points="${pts}" fill="rgba(46,93,75,0.08)" stroke="#2E5D4B" stroke-width="2"/>`;
  });
  (g.segs || []).forEach(([a, b]) => {
    s += `<line x1="${X(P[a][0])}" y1="${Y(P[a][1])}" x2="${X(P[b][0])}" y2="${Y(P[b][1])}" stroke="#2E5D4B" stroke-width="2"/>`;
  });
  Object.keys(P).forEach((n) => {
    if (n.startsWith("_")) return;
    s += `<circle cx="${X(P[n][0])}" cy="${Y(P[n][1])}" r="4" fill="#2E5D4B"/>`;
    s += `<text x="${X(P[n][0]) + 6}" y="${Y(P[n][1]) - 6}" font-size="14" font-weight="bold" fill="#1b3d30">${esc(n)}</text>`;
  });
  s += `<g class="geo-drag" style="display:none">
    <circle r="9" fill="rgba(226,87,76,0.25)"/><circle r="5" fill="#E2574C"/>
    <text x="8" y="-8" font-size="14" font-weight="bold" fill="#E2574C">${esc(g.label || "")}</text></g>`;
  s += `</svg>`;
  return s;
}

/**
 * Подключение перетаскивания (pointer events — мышь, тач, стилус) и стрелок клавиатуры.
 * Точка привязывается к узлам сетки; значение пишется в скрытое поле «(x;y)».
 * @param {SVGSVGElement} svg
 */
function attachGeoDrag(svg) {
  const id = svg.dataset.geo;
  const input = document.getElementById(id);
  const readout = document.getElementById(id + "_readout");
  const marker = svg.querySelector(".geo-drag");
  const x0 = +svg.dataset.x0, x1 = +svg.dataset.x1, y0 = +svg.dataset.y0, y1 = +svg.dataset.y1;
  let cur = null;
  let dragging = false;

  const place = (x, y) => {
    x = Math.min(x1, Math.max(x0, x));
    y = Math.min(y1, Math.max(y0, y));
    cur = [x, y];
    marker.style.display = "";
    marker.setAttribute("transform", `translate(${GEO_PAD + (x - x0) * GEO_UNIT},${GEO_PAD + (y1 - y) * GEO_UNIT})`);
    input.value = `(${x};${y})`;
    readout.textContent = `Точка: (${x}; ${y})`;
    const wrap = document.getElementById(input.dataset.wrap);
    if (wrap) wrap.classList.remove("correct", "incorrect");
  };

  const fromEvent = (e) => {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return [Math.round((p.x - GEO_PAD) / GEO_UNIT + x0), Math.round(y1 - (p.y - GEO_PAD) / GEO_UNIT)];
  };

  svg.addEventListener("pointerdown", (e) => {
    dragging = true;
    svg.setPointerCapture(e.pointerId);
    place(...fromEvent(e));
    e.preventDefault();
  });
  svg.addEventListener("pointermove", (e) => { if (dragging) place(...fromEvent(e)); });
  svg.addEventListener("pointerup", () => { dragging = false; });
  svg.addEventListener("pointercancel", () => { dragging = false; });
  svg.addEventListener("keydown", (e) => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    const base = cur || [Math.round((x0 + x1) / 2), Math.round((y0 + y1) / 2)];
    place(base[0] + d[0], base[1] + d[1]);
  });
}

/**
 * Загрузка варианта: рендер слайдов с заданиями и итогового слайда.
 * @param {string} vKey - ключ варианта (K-1 … D-30)
 */
function loadVariant(vKey) {
  const data = TASKS[vKey];
  if (!data) return;

  appState.variantKey = vKey;
  appState.currentSlide = 0;
  appState.startTime = new Date();
  appState.results = null;
  appState.recorded = false;

  const titleEl = $("#trainerTitle");
  if (titleEl) titleEl.textContent = data.title;
  const topicEl = $("#trainerTopic");
  if (topicEl) topicEl.textContent = data.topic;
  document.title = `${data.title} — ${data.topic}`;

  const slidesContainer = $("#slidesDeck");
  if (!slidesContainer) return;
  slidesContainer.innerHTML = "";
  const slides = [];

  data.questions.forEach((q, qIdx) => {
    const slide = document.createElement("div");
    slide.className = "slide" + (qIdx === 0 ? " active" : "");
    slide.dataset.slideIndex = qIdx;

    let html = `
      <div class="margin-line"></div>
      <div class="crumb">${formatMath(q.crumb || "Задание " + q.num)}</div>
      <h2 class="task-heading">
        <span class="task-num-badge">${q.num}</span>
        ${formatMath(q.title)}
      </h2>
      ${q.sub ? `<div class="task-sub">${formatMath(q.sub)}</div>` : ""}
      <div class="task-content">`;

    q.tasks.forEach((t, tIdx) => {
      html += `<div class="task-row" data-explain="${esc(t.e || "")}">`;
      if (t.label) html += `<div class="task-text">${formatMath(t.label)}</div>`;
      if (t.fig) html += `<div class="geo-board geo-static">${renderGeoSvg(t.fig, "")}</div>`;
      html += `<div class="task-expression">`;
      t.parts.forEach((part) => {
        if (typeof part === "string") {
          html += `<span>${formatMath(part)}</span>`;
        } else if (part._input !== undefined) {
          html += renderInput(t.inputs[part._input], `inp_${qIdx}_${tIdx}_${part._input}`, q);
        }
      });
      html += `</div><div class="explain-box"></div></div>`;
    });

    if (q.hints && q.hints.length) {
      html += `
        <div class="hint-box">
          <span>💡</span>
          <div>${q.hints.map(formatMath).join("<br>")}</div>
        </div>`;
    }
    html += `</div>`;
    slide.innerHTML = html;
    slidesContainer.appendChild(slide);
    slides.push(slide);
  });

  const resultsSlide = document.createElement("div");
  resultsSlide.className = "slide";
  resultsSlide.id = "resultsSlide";
  resultsSlide.dataset.slideIndex = data.questions.length;
  resultsSlide.innerHTML = `
    <div class="margin-line"></div>
    <div class="crumb">Итоги работы · ${esc(data.title)}</div>
    <div class="results-header">
      <h2 class="task-heading" style="justify-content:center;">🏁 Работа завершена!</h2>
      <div class="score-box">
        <div class="score-points" id="scoreDisplay">0 / 0</div>
        <div class="score-percent" id="percentDisplay">0%</div>
        <div class="grade-badge" id="gradeDisplay">Оценка: —</div>
      </div>
    </div>

    <h3 style="margin-bottom:12px; color:var(--chalk);">📋 Разбор выполненных заданий:</h3>
    <div id="reviewContainer" class="table-scroll"></div>

    <div class="send-box">
      <h3>📩 Отправить результат учителю</h3>
      <p style="font-size:14.5px; color:#52441a;">
        Результат будет мгновенно доставлен в Telegram-бот учителю.
      </p>
      <div class="send-inputs">
        <input type="text" class="student-name-input" id="reportStudentName" placeholder="Фамилия и Имя ученика" value="${esc(appState.studentName)}" />
        <button class="btn-send-tg" id="btnSendTelegram">Отправить результат в Telegram ✈️</button>
        <button class="btn-download-report" id="btnDownloadReport">Скачать отчёт (.txt) 💾</button>
      </div>
      <div class="send-status-msg" id="sendStatusMsg"></div>
    </div>

    <div style="display:flex; gap:12px; justify-content:center; margin-top:20px; flex-wrap:wrap;">
      <button class="btn-nav" id="btnRestart">🔄 Пройти заново</button>
      <a href="lesson.html#/lesson/${vKey.split("-")[1]}" class="btn-nav" style="text-decoration:none;">📖 К уроку</a>
      <a href="index.html" class="btn-nav" style="text-decoration:none;">📚 Ко всем урокам</a>
    </div>`;
  slidesContainer.appendChild(resultsSlide);
  slides.push(resultsSlide);

  // Кнопки итогового слайда пересоздаются при каждой загрузке — привязываем здесь
  $("#btnSendTelegram").addEventListener("click", sendTrainerResult);
  $("#btnDownloadReport").addEventListener("click", downloadReport);
  $("#btnRestart").addEventListener("click", () => loadVariant(appState.variantKey));

  // Интерактив: выбор варианта и перетаскивание точек
  $$(".choice-btn", slidesContainer).forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.input);
      const wrap = document.getElementById(input.dataset.wrap);
      $$(".choice-btn", wrap).forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      wrap.classList.remove("correct", "incorrect");
      input.value = btn.dataset.value;
    });
  });
  $$("svg[data-geo]:not([data-geo=\"\"])", slidesContainer).forEach(attachGeoDrag);

  appState.slides = slides;
  updateNav();
}

function updateNav() {
  const total = appState.slides.length;
  const cur = appState.currentSlide;
  const isLast = cur === total - 1;
  const prevBtn = $("#btnPrev");
  const nextBtn = $("#btnNext");
  const checkBtn = $("#btnCheck");
  const counter = $("#slideCounter");

  if (prevBtn) prevBtn.disabled = cur === 0;
  if (nextBtn) {
    if (isLast) {
      nextBtn.style.display = "none";
    } else {
      nextBtn.style.display = "inline-block";
      nextBtn.textContent = cur === total - 2 ? "К итогам 🏁" : "Далее ▶";
    }
  }
  if (checkBtn) checkBtn.style.display = isLast ? "none" : "inline-block";
  if (counter) counter.textContent = `${cur + 1} / ${total}`;
}

function goToSlide(index) {
  if (index < 0 || index >= appState.slides.length) return;
  appState.slides.forEach((s, idx) => s.classList.toggle("active", idx === index));
  appState.currentSlide = index;
  if (index === appState.slides.length - 1) calculateResults();
  updateNav();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/** Человекочитаемый верный ответ (первый из вариантов через «|»). @param {HTMLInputElement} inp */
function displayAnswer(inp) {
  const first = inp.dataset.answer.split("|")[0];
  if (inp.dataset.type === "point" || inp.dataset.type === "coords") return first.replace(";", "; ");
  return first;
}

/**
 * Проверка всех полей текущего слайда: зелёная/красная подсветка,
 * пояснение с верным ответом при ошибке, учёт в статистике (только первая проверка поля).
 * @returns {boolean} все ли ответы верны
 */
function checkCurrentSlide() {
  const slideEl = appState.slides[appState.currentSlide];
  if (!slideEl) return false;
  let allCorrect = true;
  let firstOk = 0;
  let firstBad = 0;

  $$(".task-row", slideEl).forEach((row) => {
    const wrong = [];
    $$(".math-input", row).forEach((inp) => {
      const isOk = checkAnswer(inp.value, inp.dataset.answer, inp.dataset.type);
      const target = inp.dataset.wrap ? document.getElementById(inp.dataset.wrap) : inp;
      target.classList.remove("correct", "incorrect");
      void target.offsetWidth; // перезапуск анимации shake
      target.classList.add(isOk ? "correct" : "incorrect");
      if (!isOk) {
        allCorrect = false;
        wrong.push(inp);
      }
      if (!inp.dataset.counted && inp.value.trim()) {
        inp.dataset.counted = "1";
        isOk ? firstOk++ : firstBad++;
      }
    });
    const box = $(".explain-box", row);
    if (wrong.length) {
      const answers = wrong.map((i) => `<b>${formatMath(esc(displayAnswer(i)))}</b>`).join(", ");
      const why = row.dataset.explain ? `<br>${formatMath(row.dataset.explain)}` : "";
      box.innerHTML = `✗ Верный ответ: ${answers}${why}`;
    } else {
      box.innerHTML = "";
    }
  });

  Stats.recordChecks(appState.variantKey, firstOk, firstBad);
  return allCorrect;
}

/* ============================================================
 * ПОДСЧЁТ РЕЗУЛЬТАТОВ И ОЦЕНИВАНИЕ (логика эталона)
 * ============================================================ */

function calculateResults() {
  const allInputs = $$("#slidesDeck .math-input");
  let totalScore = 0;
  let maxScore = 0;
  const reviewItems = [];
  const groups = {};

  allInputs.forEach((inp) => {
    const w = parseFloat(inp.dataset.weight || 1);
    const grp = inp.dataset.group;
    const { qnum: qNum, qtitle: qTitle, answer: pat, type } = inp.dataset;
    const val = inp.value;
    const isOk = checkAnswer(val, pat, type);

    if (grp) {
      if (!groups[grp]) groups[grp] = { ok: true, w, qNum, qTitle, userVal: [], correctVal: [] };
      if (!isOk) groups[grp].ok = false;
      groups[grp].userVal.push(val || "—");
      groups[grp].correctVal.push(displayAnswer(inp));
    } else {
      maxScore += w;
      if (isOk) totalScore += w;
      reviewItems.push({ qNum, qTitle, userVal: val || "—", correctVal: displayAnswer(inp), isOk, score: isOk ? w : 0, maxScore: w });
    }
  });

  Object.keys(groups).forEach((gKey) => {
    const g = groups[gKey];
    maxScore += g.w;
    if (g.ok) totalScore += g.w;
    reviewItems.push({
      qNum: g.qNum, qTitle: g.qTitle,
      userVal: g.userVal.join(", "), correctVal: g.correctVal.join(", "),
      isOk: g.ok, score: g.ok ? g.w : 0, maxScore: g.w,
    });
  });

  const percent = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  let grade = 2, gradeText = "2 (Требуется повторение)", gradeClass = "grade-2";
  if (percent >= CONFIG.gradeScale[5]) { grade = 5; gradeText = "5 (Отлично!) 🎉"; gradeClass = "grade-5"; }
  else if (percent >= CONFIG.gradeScale[4]) { grade = 4; gradeText = "4 (Хорошо) 👍"; gradeClass = "grade-4"; }
  else if (percent >= CONFIG.gradeScale[3]) { grade = 3; gradeText = "3 (Удовлетворительно) ✍️"; gradeClass = "grade-3"; }

  const timeSec = Math.round((new Date() - appState.startTime) / 1000);
  const vData = TASKS[appState.variantKey];

  appState.results = {
    variantKey: appState.variantKey,
    title: `${vData.title} (${variantLabel(appState.variantKey)})`,
    topic: vData.topic,
    totalScore, maxScore, percent, grade, gradeText, timeSec,
    reviewItems,
    mistakes: reviewItems.filter((i) => !i.isOk).map(({ qNum, qTitle, userVal, correctVal }) => ({ qNum, qTitle, userVal, correctVal })),
    date: new Date().toLocaleString("ru-RU"),
  };

  if (!appState.recorded) {
    appState.recorded = true;
    const { reviewItems: _omit, ...toStore } = appState.results;
    Stats.recordAttempt(appState.variantKey, { ...toStore, studentName: appState.studentName });
  }

  $("#scoreDisplay").textContent = `${totalScore} / ${maxScore} баллов`;
  $("#percentDisplay").textContent = `${percent}% выполнено · ⏱ ${formatMMSS(timeSec)}`;
  const gradeDisp = $("#gradeDisplay");
  gradeDisp.textContent = `Оценка: ${gradeText}`;
  gradeDisp.className = `grade-badge ${gradeClass}`;

  let tHtml = `
    <table class="review-table">
      <thead><tr><th>№</th><th>Тема задания</th><th>Ваш ответ</th><th>Верный ответ</th><th>Итог</th></tr></thead>
      <tbody>`;
  reviewItems.forEach((item) => {
    tHtml += `
      <tr>
        <td><b>${esc(item.qNum)}</b></td>
        <td>${formatMath(esc(item.qTitle))}</td>
        <td>${formatMath(esc(item.userVal))}</td>
        <td>${item.isOk ? "—" : `<b>${formatMath(esc(item.correctVal))}</b>`}</td>
        <td><span class="status-tag ${item.isOk ? "status-ok" : "status-bad"}">${item.isOk ? "✓ Верно" : "✗ Ошибка"}</span></td>
      </tr>`;
  });
  tHtml += `</tbody></table>`;
  $("#reviewContainer").innerHTML = tHtml;
}

/* ============================================================
 * ОТПРАВКА В TELEGRAM И ОТЧЁТ .TXT (тренажёр)
 * ============================================================ */

async function sendTrainerResult() {
  const nameInp = $("#reportStudentName");
  if (nameInp && nameInp.value.trim()) {
    appState.studentName = nameInp.value.trim();
    localStorage.setItem(CONFIG.storagePrefix + "student_name", appState.studentName);
  }
  if (!appState.results) calculateResults();
  const msg = buildTelegramMessage({ ...appState.results, studentName: appState.studentName });
  await sendReportsWithUI([msg], "sendStatusMsg");
}

function downloadReport() {
  if (!appState.results) calculateResults();
  const rawText = buildTelegramMessage({ ...appState.results, studentName: appState.studentName })
    .replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const blob = new Blob([rawText], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Отчёт_${appState.studentName || "Ученик"}_${appState.variantKey}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function setupEvents() {
  const prevBtn = $("#btnPrev");
  const nextBtn = $("#btnNext");
  const checkBtn = $("#btnCheck");
  if (prevBtn) prevBtn.addEventListener("click", () => goToSlide(appState.currentSlide - 1));
  if (nextBtn) nextBtn.addEventListener("click", () => goToSlide(appState.currentSlide + 1));
  if (checkBtn) checkBtn.addEventListener("click", checkCurrentSlide);

  document.addEventListener("keydown", (e) => {
    const inModal = !!$(".modal-overlay.open");
    if (inModal) return;
    if (e.target.classList && e.target.classList.contains("math-input") && e.key === "Enter") {
      checkCurrentSlide();
      return;
    }
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "svg") return;
    if (e.key === "ArrowRight") goToSlide(appState.currentSlide + 1);
    else if (e.key === "ArrowLeft") goToSlide(appState.currentSlide - 1);
  });
}

/* ============================================================
 * СТРАНИЦА СТАТИСТИКИ
 * ============================================================ */

function renderStatsPage() {
  const d = Stats.load();
  const s = d.session;
  const totalChecks = s.correct + s.incorrect;
  const acc = totalChecks ? Math.round((s.correct / totalChecks) * 100) : 0;

  let allC = 0, allI = 0, allW = 0;
  Object.values(d.lessons).forEach((e) => { allC += e.correct; allI += e.incorrect; allW += e.attempts; });

  $("#statsSummary").innerHTML = `
    <div class="score-box"><div class="score-percent">Верно (сессия)</div><div class="score-points" style="color:var(--green)">${s.correct}</div></div>
    <div class="score-box"><div class="score-percent">Ошибок (сессия)</div><div class="score-points" style="color:var(--bad)">${s.incorrect}</div></div>
    <div class="score-box"><div class="score-percent">Точность (сессия)</div><div class="score-points">${acc}%</div></div>
    <div class="score-box"><div class="score-percent">Работ сдано (сессия)</div><div class="score-points">${s.works}</div></div>`;
  $("#statsSession").textContent = `Сессия начата: ${d.sessionStart}. Всего за всё время: верно ${allC}, ошибок ${allI}, работ ${allW}.`;

  const keys = Object.keys(d.lessons).sort((a, b) => {
    const na = +a.split("-")[1], nb = +b.split("-")[1];
    return na - nb || a.localeCompare(b);
  });
  if (!keys.length) {
    $("#statsTable").innerHTML = `<div class="hint-box"><span>💡</span><div>Пока нет данных. Откройте любой урок, решите задания и нажмите «Проверить ответ ✏️».</div></div>`;
    return;
  }
  let html = `<table class="review-table"><thead><tr>
    <th>Работа</th><th>Тема</th><th>Верно</th><th>Ошибок</th><th>Попыток</th><th>Лучший</th><th>Последний</th></tr></thead><tbody>`;
  keys.forEach((k) => {
    const e = d.lessons[k];
    const v = TASKS[k];
    const last = e.last ? `${e.last.totalScore}/${e.last.maxScore} · ${formatMMSS(e.last.timeSec)}` : "—";
    html += `<tr>
      <td><a href="trainer.html?variant=${k}" style="color:var(--chalk); font-weight:bold;">${variantLabel(k)}</a></td>
      <td>${v ? esc(v.topic) : ""}</td>
      <td><span class="status-tag status-ok">${e.correct}</span></td>
      <td><span class="status-tag status-bad">${e.incorrect}</span></td>
      <td>${e.attempts}</td><td>${e.best}%</td><td>${last}</td></tr>`;
  });
  html += `</tbody></table>`;
  $("#statsTable").innerHTML = html;
}

function statsNewSession() {
  Stats.newSession();
  renderStatsPage();
}

function statsResetAll() {
  if (!confirm("Сбросить всю статистику на этом устройстве?")) return;
  Stats.resetAll();
  renderStatsPage();
}

/* ============================================================
 * МОДАЛЬНОЕ ОКНО ТЕОРИИ (как в эталоне)
 * ============================================================ */

function openTheoryModal(lessonNum) {
  const modal = $("#theoryModal");
  const content = $("#theoryContent");
  const lesson = getLesson(lessonNum);
  if (!modal || !content || !lesson) return;
  const data = lesson.theory;
  let html = `
    <h3 class="modal-title">📖 Урок ${lesson.num}. ${esc(lesson.title)}</h3>
    <div style="font-size:13.5px; color:#8c7857; margin-bottom:12px;">
      Источник: <b>${esc(data.source)}</b> · <span class="badge ${BADGE_CLASS[lesson.level]}">${esc(lesson.badge)}</span>
    </div>
    <div style="margin-bottom:14px;">`;
  data.rules.forEach((rule) => { html += `<div class="theory-rule-item">📌 ${formatMath(rule)}</div>`; });
  html += `</div>`;
  if (data.sample) html += `<div class="theory-sample"><b>💡 Пример решения:</b><br>${formatMath(data.sample)}</div>`;
  html += `<div style="margin-top:16px;"><a href="lesson.html#/lesson/${lesson.num}" class="btn-hero" style="padding:8px 18px; font-size:14.5px;">Открыть урок ▶</a></div>`;
  content.innerHTML = html;
  modal.classList.add("open");
}

function closeTheoryModal() {
  const modal = $("#theoryModal");
  if (modal) modal.classList.remove("open");
}

/* ============================================================
 * РОУТИНГ ПО СТРАНИЦАМ
 * ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  if (page === "index") renderIndex();
  if (page === "lesson") {
    renderLessonPage();
    window.addEventListener("hashchange", renderLessonPage);
  }
  if (page === "trainer") initTrainer();
  if (page === "stats") renderStatsPage();

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeTheoryModal(); closeTelegramSettingsModal(); }
  });
});
