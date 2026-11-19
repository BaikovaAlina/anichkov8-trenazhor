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
ok(LD.lessons.length === Object.keys(TASKS).length / 2, "у каждого урока есть K и D");
console.log(`Модулей: ${LD.modules.length}, уроков: ${LD.lessons.length}, вариантов: ${Object.keys(TASKS).length}, заданий: ${rows}, полей ответа: ${inputs}`);
console.log(`Тестов пройдено: ${pass}, провалено: ${fail}`);
process.exit(fail ? 1 : 0);
