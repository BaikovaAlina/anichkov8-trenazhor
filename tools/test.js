/**
 * Автотесты: node tools/test.js
 * 1) юнит-тесты checker.js; 2) банк задач парсится; 3) каждый допустимый ответ
 *    принимается проверкой; 4) явно неверный ответ отклоняется.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");
const { checkAnswer, parseNumber } = require(path.join(root, "js/checker.js"));

let fail = 0, pass = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log("FAIL:", msg); } };

// ---- 1. Юнит-тесты проверки ----
const T = [
  ["0.75", "3/4", "", true], ["0,75", "3/4", "", true], ["3/4", "0,75", "", true],
  ["6/8", "3/4", "", true], ["0.751", "0.75", "", true], ["0.77", "0.75", "", false],
  ["-1 6/7", "-13/7", "", true], ["x = 5", "5", "", true], [" 5 ", "5", "", true],
  ["2 1/2", "2,5", "", true], ["(2; 3)", "(2;3)", "coords", true], ["(2,3)", "(2;3)", "coords", true],
  ["(3; 2)", "(2;3)", "coords", false], ["5; 1", "1; 5", "list", true], ["1, 5", "1; 5", "list", true],
  ["1; 4", "1; 5", "list", false], ["НЕТ", "нет", "choice", true], ["да", "нет", "choice", false],
  ["18:20", "18:20|18.20|18 20", "text", true], ["(4;3)", "(4;3)", "point", true], ["", "5", "", false],
  ["Нет корней", "нет корней", "", true], ["12,5", "25/2", "", true], ["45°", "45", "", true],
];
T.forEach(([u, a, t, exp]) => ok(checkAnswer(u, a, t) === exp, `checkAnswer(${JSON.stringify(u)}, ${JSON.stringify(a)}, ${t}) → ожидалось ${exp}`));
ok(parseNumber("abc") === null, "parseNumber(abc) = null");

// ---- 2. tasks.js парсится, данные согласованы с JSON ----
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "js/tasks.js"), "utf8") + ";this.TASKS=TASKS;this.LESSONS_DATA=LESSONS_DATA;", ctx);
const TASKS = ctx.TASKS, LD = ctx.LESSONS_DATA;
const tj = JSON.parse(fs.readFileSync(path.join(root, "data/tasks.json"), "utf8"));
ok(JSON.stringify(tj) === JSON.stringify(TASKS), "js/tasks.js совпадает с data/tasks.json");

// ---- 3–4. Самопроверка банка ----
let rows = 0, inputs = 0;
for (const [key, v] of Object.entries(TASKS)) {
  for (const q of v.questions) for (const t of q.tasks) {
    rows++;
    for (const inp of t.inputs) {
      inputs++;
      const alts = inp.a.split("|");
      alts.forEach((alt) => ok(checkAnswer(alt, inp.a, inp.type), `${key} №${q.num}: «${alt}» не принят (${inp.type})`));
      ok(!checkAnswer("987654", inp.a, inp.type), `${key} №${q.num}: принят мусор`);
      if (inp.type === "choice") ok((inp.options || []).includes(inp.a), `${key}: ответ не среди вариантов`);
    }
  }
}
ok(rows >= 100, `заданий ${rows} < 100`);
LD.lessons.forEach((l, i) => {
  ok(l.num === i + 1, `уроки пронумерованы подряд (урок ${l.num} на позиции ${i + 1})`);
  ok(TASKS[`K-${l.num}`] && TASKS[`D-${l.num}`], `у урока ${l.num} есть K и D`);
  const n = ["K", "D"].reduce((s, k) => s + TASKS[`${k}-${l.num}`].questions.reduce((a, q) => a + q.tasks.length, 0), 0);
  ok(n >= 15, `урок ${l.num}: задач ${n} < 15`);
});

// ---- 5. Нет подсказок, источников и бейджей уровня — ни в данных, ни в разметке ----
const SRC_RE = /\((?:вступительные\s+)?(?:19|20)\d\d(?:,\s*(?:19|20)\d\d)*\)|Михлин|Макарычев|Атанасян|ФМШ|пособи|учебник|§|в стиле Аничкова/;
for (const [key, v] of Object.entries(TASKS)) {
  ok(!("badge" in v), `${key}: остался badge`);
  ok(!SRC_RE.test(v.title + v.topic), `${key}: источник в названии`);
  for (const q of v.questions) {
    ok(!("hints" in q), `${key} №${q.num}: осталось поле hints`);
    ok(!SRC_RE.test(q.title + q.sub + q.crumb), `${key} №${q.num}: источник в заголовке`);
    // подзаголовок — только формат ответа / способ ввода
    ok(!q.sub || /^— (корни через|ответ|перетащите|выберите|клетка|сторона клетки|90 минут|чётная или нечётная)/.test(q.sub),
      `${key} №${q.num}: подзаголовок-подсказка «${q.sub}»`);
    q.tasks.forEach((t, ri) => {
      const id = `${key} №${q.num}.${ri + 1}`;
      ok(!("src" in t), `${id}: осталось поле src`);
      ok(!SRC_RE.test(t.label + " " + t.e), `${id}: источник в условии/пояснении`);
      // подпись прямо перед полем ввода не раскрывает ход решения (нет готовых действий «6 · 0,3 =»)
      t.parts.forEach((p, i) => {
        if (typeof p === "string" && t.parts[i + 1] && typeof t.parts[i + 1] === "object")
          ok(!/\d\s*[·:+−×]\s*[\d(]|√\d|√\(|\\frac\{\d+\}\{\d+\}\s*[+−·]|—\s*всего|Получится|Проверьте|Поменяйте/.test(p), `${id}: подпись-подсказка «${p}»`);
      });
    });
  }
}
LD.lessons.forEach((l) => {
  ok(!("badge" in l) && !("source" in l.theory), `урок ${l.num}: остался badge/source`);
  ok(!SRC_RE.test([l.title, l.short, ...l.theory.rules, l.theory.sample || ""].join(" ")), `урок ${l.num}: источник в теории`);
});
(LD.mocks || []).forEach((m) => ok(!SRC_RE.test(m.title + m.desc), `пробник ${m.num}: источник в названии`));
const appJs = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
ok(!/hint-box[\s\S]{0,80}q\.hints|task-src|\.source\b|lesson\.badge|l\.badge/.test(appJs), "app.js не рендерит hints/src/source/badge");
for (const page of ["index.html", "lesson.html", "trainer.html", "stats.html"]) {
  const html = fs.readFileSync(path.join(root, page), "utf8");
  ok(!/btn-settings|settingsModal|Настройки Telegram|settingChatId|Михлин/.test(html), `${page}: остались настройки Telegram или источник`);
}
const tgJs = fs.readFileSync(path.join(root, "js/telegram.js"), "utf8") + fs.readFileSync(path.join(root, "js/config.js"), "utf8") + appJs;
ok(!/TelegramSettings|settingsModal|Настройки Telegram/.test(tgJs), "JS не ссылается на удалённое окно настроек");
ok(!/btn-settings|task-src/.test(fs.readFileSync(path.join(root, "css/styles.css"), "utf8")), "CSS без .btn-settings/.task-src");

// ---- 6. Пробники ----
const mocks = LD.mocks || [];
ok(mocks.length >= 3, `пробников ${mocks.length} < 3`);
mocks.forEach((m) => {
  const v = TASKS[`P-${m.num}`];
  ok(v && v.mock === true && v.minutes === 90 && m.minutes === 90, `П-${m.num}: mock/minutes=90`);
  const n = v ? v.questions.reduce((a, q) => a + q.tasks.length, 0) : 0;
  ok(n >= 8 && n <= 16, `П-${m.num}: задач ${n}`);
  ok(v && v.questions.length >= 8 && v.questions.length <= 12, `П-${m.num}: заданий ${v && v.questions.length} (нужно 8–12)`);
  ok(Array.isArray(m.topics) && m.topics.length >= 6, `П-${m.num}: темы`);
});
const pKeys = Object.keys(TASKS).filter((k) => k.startsWith("P-"));
ok(pKeys.length === mocks.length, "каждый P-вариант описан в LESSONS_DATA.mocks");
const sets = pKeys.map((k) => TASKS[k].questions.flatMap((q) => q.tasks.map((t) => t.label)).join("\n"));
ok(new Set(sets).size === sets.length, "наборы задач пробников различны");

// ---- 7. Разметка дробей: баланс скобок и рендер ----
const appSrc = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const pick = (name) => appSrc.slice(appSrc.indexOf(`function ${name}(`), appSrc.indexOf("\n}\n", appSrc.indexOf(`function ${name}(`)) + 3);
const fctx = {};
vm.createContext(fctx);
vm.runInContext(["fracHtml", "readBraceGroup", "renderFracMarkup", "fracPlain", "formatMath"].map(pick).join("\n") + ";this.formatMath=formatMath;this.fracPlain=fracPlain;", fctx);
ok(fctx.formatMath("\\frac{1}{2}") === '<span class="frac"><span class="num">1</span><span class="den">2</span></span>', "formatMath: \\frac{1}{2}");
ok((fctx.formatMath("\\frac{\\frac{1}{2} + 1}{3}").match(/class="frac"/g) || []).length === 2, "formatMath: вложенная дробь");
ok(fctx.formatMath("15 км/ч и 3/4") === '15 км/ч и <span class="frac"><span class="num">3</span><span class="den">4</span></span>', "formatMath: единицы не трогаем, ответ 3/4 — дробь");
ok(fctx.fracPlain("2\\frac{1}{3} и \\frac{x + 1}{x − 1}") === "2 1/3 и (x + 1)/(x − 1)", "fracPlain: " + fctx.fracPlain("2\\frac{1}{3} и \\frac{x + 1}{x − 1}"));
const allStr = JSON.stringify([TASKS, LD]);
let bal = 0, bad = 0;
for (const m of allStr.matchAll(/\\\\frac\{/g)) {
  let d = 0, j = m.index + 6, groups = 0;
  for (; j < allStr.length && groups < 2; j++) {
    if (allStr[j] === "{") d++;
    else if (allStr[j] === "}" && --d === 0) { groups++; if (groups < 2 && allStr[j + 1] !== "{") break; }
  }
  if (groups === 2) bal++; else bad++;
}
ok(bad === 0, `\\frac без двух групп {…}{…}: ${bad}`);
console.log(`Дробей в разметке \\frac: ${bal}; пробников: ${mocks.length}`);
console.log(`Модулей: ${LD.modules.length}, уроков: ${LD.lessons.length}, вариантов: ${Object.keys(TASKS).length}, заданий: ${rows}, полей ответа: ${inputs}`);
console.log(`Тестов пройдено: ${pass}, провалено: ${fail}`);
process.exit(fail ? 1 : 0);
