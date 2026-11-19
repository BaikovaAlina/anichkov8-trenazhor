/* ============================================================
 * CHECKER.JS — ПРОВЕРКА ОТВЕТОВ (нормализация, допуски, дроби)
 * ============================================================
 * Механика эталона сохранена: в data-answer допустимые ответы через «|»,
 * типы "", "list", "coords". Добавлены: числовой допуск ±0.01, смешанные числа,
 * отрицательные дроби, «x = 5» → 5, а также типы "choice", "point", "text".
 * ============================================================ */

"use strict";

/** Допуск при сравнении чисел (по ТЗ: ±0.01). */
const NUM_TOLERANCE = 0.01;

/**
 * Канонизация строки ответа: trim, lower, ё→е, единый минус и знак умножения,
 * удаление градусов и лишних пробелов.
 * @param {*} val
 * @returns {string}
 */
function canon(val) {
  if (val == null) return "";
  let s = String(val).trim().toLowerCase();
  s = s.replace(/ё/g, "е");
  s = s.replace(/[−–—]/g, "-");
  s = s.replace(/[×*∙⋅]/g, "·");
  s = s.replace(/°/g, "");
  s = s.replace(/\s+/g, " ");
  return s.trim();
}

/**
 * Убирает «обёртку» ответа: «x = 5», «ответ: 5», «AB = 7 см» → «5»/«7 см».
 * @param {string} s
 * @returns {string}
 */
function stripLhs(s) {
  return s.replace(/^\s*(ответ\s*:?)?\s*/i, "").replace(/^[a-zа-я∠]{1,4}\d?\s*=\s*/i, "");
}

/**
 * Парсит число из строки. Поддерживает: целые, десятичные с точкой или запятой,
 * обыкновенные дроби «3/4», «-3/4», смешанные числа «2 1/3», «-2 1/3».
 * @param {string} raw
 * @returns {number|null} число или null, если строка не является числом
 */
function parseNumber(raw) {
  if (raw == null) return null;
  let s = canon(raw);
  s = stripLhs(s).replace(/\s*(см|м|км|кг|г|л|ч|мин|сек|руб|%|шт)\.?$/i, "").trim();
  if (!s) return null;

  // Смешанное число: [-]a b/c
  let m = s.match(/^(-?)(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (m) {
    const den = Number(m[4]);
    if (den === 0) return null;
    const v = Number(m[2]) + Number(m[3]) / den;
    return m[1] === "-" ? -v : v;
  }
  // Обыкновенная дробь: [-]a/b (числитель/знаменатель могут быть десятичными)
  m = s.match(/^(-?\d+(?:[.,]\d+)?)\s*\/\s*(-?\d+(?:[.,]\d+)?)$/);
  if (m) {
    const num = Number(m[1].replace(",", "."));
    const den = Number(m[2].replace(",", "."));
    if (den === 0) return null;
    return num / den;
  }
  // Десятичное / целое число
  m = s.match(/^[+-]?\d+(?:[.,]\d+)?$|^[+-]?[.,]\d+$/);
  if (m) return Number(s.replace(",", "."));
  return null;
}

/**
 * Сравнивает два числа с допуском NUM_TOLERANCE.
 * @param {number} a
 * @param {number} b
 * @returns {boolean}
 */
function numEqual(a, b) {
  return Math.abs(a - b) <= NUM_TOLERANCE + 1e-12;
}

/**
 * Разбивает список ответов. Если есть «;» — делим только по «;» (тогда запятая
 * может быть десятичной), иначе по запятым и пробелам.
 * @param {string} val
 * @returns {string[]}
 */
function splitList(val) {
  const s = canon(val).replace(/^[\[{(]|[\]})]$/g, "");
  const parts = s.includes(";") ? s.split(";") : s.split(/[,\s]+/);
  return parts.map((p) => stripLhs(p.trim())).filter(Boolean);
}

/**
 * Сравнение двух списков без учёта порядка (числа — с допуском, строки — канонически).
 * @param {string[]} a
 * @param {string[]} b
 * @returns {boolean}
 */
function listsEqual(a, b) {
  if (a.length !== b.length) return false;
  const rest = b.slice();
  for (const item of a) {
    const n = parseNumber(item);
    const idx = rest.findIndex((r) => {
      const rn = parseNumber(r);
      if (n !== null && rn !== null) return numEqual(n, rn);
      return canon(r).replace(/\s/g, "") === canon(item).replace(/\s/g, "");
    });
    if (idx === -1) return false;
    rest.splice(idx, 1);
  }
  return true;
}

/**
 * Парсит координаты «(3; -2)», «3;-2», «(1,5; 2)», «3, -2» → [x, y].
 * @param {string} val
 * @returns {number[]|null}
 */
function parseCoords(val) {
  const s = canon(val).replace(/^[a-zа-я]\s*/i, "").replace(/[()\[\]]/g, "").trim();
  let parts;
  if (s.includes(";")) parts = s.split(";");
  else if ((s.match(/,/g) || []).length === 1) parts = s.split(",");
  else parts = s.split(/\s+/);
  if (parts.length !== 2) return null;
  const x = parseNumber(parts[0]);
  const y = parseNumber(parts[1]);
  return x === null || y === null ? null : [x, y];
}

/**
 * Проверка одного ответа ученика.
 * @param {string} userVal - ввод ученика
 * @param {string} correctPattern - эталон(ы) через «|», например "3/4|0,75"
 * @param {string} [type] - "" | "list" | "coords" | "point" | "choice" | "text"
 * @returns {boolean}
 */
function checkAnswer(userVal, correctPattern, type) {
  if (userVal == null || !String(userVal).trim()) return false;
  const acceptable = String(correctPattern).split("|").map((p) => p.trim());
  const user = String(userVal).trim();

  if (type === "list") {
    const uList = splitList(user);
    return acceptable.some((pat) => listsEqual(uList, splitList(pat)));
  }

  if (type === "coords" || type === "point") {
    const u = parseCoords(user);
    if (!u) return false;
    return acceptable.some((pat) => {
      const p = parseCoords(pat);
      return p && numEqual(u[0], p[0]) && numEqual(u[1], p[1]);
    });
  }

  if (type === "choice" || type === "text") {
    const u = canon(user).replace(/\s/g, "");
    return acceptable.some((pat) => canon(pat).replace(/\s/g, "") === u);
  }

  // Тип по умолчанию: сначала число (с допуском и эквивалентными дробями), затем строка
  const uCanon = stripLhs(canon(user)).replace(/\s/g, "");
  const uNum = parseNumber(user);
  for (const pat of acceptable) {
    if (stripLhs(canon(pat)).replace(/\s/g, "") === uCanon) return true;
    const pNum = parseNumber(pat);
    if (uNum !== null && pNum !== null && numEqual(uNum, pNum)) return true;
  }
  return false;
}

// Экспорт для Node-тестов (в браузере игнорируется)
if (typeof module !== "undefined") {
  module.exports = { canon, parseNumber, parseCoords, splitList, checkAnswer };
}
