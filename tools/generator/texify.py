"""Единый формат дробей: все «a/b», «(…)/(…)», «2 1/3», «½» в текстах заданий
превращаются в разметку \\frac{числитель}{знаменатель}, которую рендерит formatMath().

Правила:
  * смешанное число «2 1/3» → 2\\frac{1}{3};
  * операнд — скобка без вложенных скобок (внешние скобки снимаются) или «слово»
    (цифры, буквы, индексы, степени, десятичная запятая): (x + 1)/3, 2a²/(3a − b), s/6;
  * преобразование идёт изнутри наружу, пока есть что заменять;
  * единицы измерения (км/ч, м/мин, руб/кг…) не трогаются;
  * HTML-теги не трогаются.
"""
import re

SUP = "²³⁴⁵⁶⁷⁸⁹⁰¹ⁿ⁺⁻₀₁₂₃₄₅₆₇₈₉"
TOKEN = rf"(?:\d+(?:[.,]\d+)?[\w{SUP}']*|[A-Za-zА-Яа-яЁё√][\wА-Яа-яЁё{SUP}']*)"
PAREN = rf"\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)[{SUP}]*"
OPER = rf"(?:(?:{TOKEN})?(?:{PAREN})+|{TOKEN})"   # числитель: 2(a+b), (a)(b), x²
DEN = rf"(?:{PAREN}|{TOKEN})"                        # знаменатель: одна скобка или слово
FRAC_RE = re.compile(rf"(?<![\w\\}}<{SUP})])({OPER})\s*/\s*({DEN})(?![\w{SUP}])")
MIXED_RE = re.compile(r"(?<![\w.,/])(\d+) (\d+)/(\d+)(?![\w/(])")
UNITS_NUM = {"куб", "км", "м", "см", "мм", "дм", "кг", "г", "т", "л", "мл", "руб", "р", "коп", "шт", "литров", "деталей"}
UNITS_DEN = {"ч", "час", "мин", "с", "сек", "кг", "л", "м", "м²", "шт", "день", "дн"}
VULGAR = {"½": r"\frac{1}{2}", "⅓": r"\frac{1}{3}", "¼": r"\frac{1}{4}", "¾": r"\frac{3}{4}", "⅔": r"\frac{2}{3}"}


def _strip(op):
    """Снять внешние скобки, только если весь операнд — одна скобочная группа."""
    if not (op.startswith("(") and op.endswith(")")):
        return op
    depth = 0
    for i, ch in enumerate(op):
        depth += ch == "("
        depth -= ch == ")"
        if depth == 0 and i < len(op) - 1:
            return op
    return op[1:-1].strip()


def _frac(m):
    a, b = m.group(1), m.group(2)
    if a in UNITS_NUM and b in UNITS_DEN:
        return m.group(0)
    return r"\frac{" + _strip(a) + "}{" + _strip(b) + "}"


def _plain(s):
    for k, v in VULGAR.items():
        s = s.replace(k, v)
    s = MIXED_RE.sub(lambda m: m[1] + r"\frac{" + m[2] + "}{" + m[3] + "}", s)
    for _ in range(8):
        n = FRAC_RE.sub(_frac, s)
        if n == s:
            break
        s = n
    return s


def tex(s):
    """Конвертирует одну строку (HTML-теги сохраняются как есть)."""
    if not isinstance(s, str) or ("/" not in s and not any(k in s for k in VULGAR)):
        return s
    parts = re.split(r"(<[^>]+>)", s)
    return "".join(p if p.startswith("<") else _plain(p) for p in parts)


def leftovers(s):
    """Слэши, оставшиеся после конвертации (для отчёта сборки)."""
    if not isinstance(s, str):
        return []
    t = re.sub(r"<[^>]+>", "", s)
    return re.findall(r"\S{0,12}/\S{0,12}", t)


if __name__ == "__main__":
    tests = [
        ("(2 1/4 − 1,5)/(0,25 · 6)", r"\frac{2\frac{1}{4} − 1,5}{0,25 · 6}"),
        ("1,2x − 1 2/7 = 2/3 x + 0,6", r"1,2x − 1\frac{2}{7} = \frac{2}{3} x + 0,6"),
        ("(x + 1)/3 + x/2 − 2x = 5x/4", r"\frac{x + 1}{3} + \frac{x}{2} − 2x = \frac{5x}{4}"),
        ("15 м/мин и 4 км/ч", "15 м/мин и 4 км/ч"),
        ("(1/(x − 3) − 1)(x² − 9) = 0", r"(\frac{1}{x − 3} − 1)(x² − 9) = 0"),
        ("((27/4)² − (15/8)²) : 5", r"((\frac{27}{4})² − (\frac{15}{8})²) : 5"),
        ("1/4(4 − 1,5x)", r"\frac{1}{4}(4 − 1,5x)"),
        ("y = k/x, S = ½·a·h", r"y = \frac{k}{x}, S = \frac{1}{2}·a·h"),
        ("2a²/(3a² − ab)", r"\frac{2a²}{3a² − ab}"),
        ("<b>1/2</b>", r"<b>\frac{1}{2}</b>"),
        ("36 2/3% числа", r"36\frac{2}{3}% числа"),
        ("AB/AC = 2/9", r"\frac{AB}{AC} = \frac{2}{9}"),
        ("(x + 2)(x² + 2)/x", r"\frac{(x + 2)(x² + 2)}{x}"),
        ("2(a² + 25)/(a² − 25)", r"\frac{2(a² + 25)}{a² − 25}"),
        ("2⁶3³5⁶ / (3⁴5⁴ · 2⁴5⁴) = 4/75", r"\frac{2⁶3³5⁶}{3⁴5⁴ · 2⁴5⁴} = \frac{4}{75}"),
        ("\\frac{(2/3)⁵ · 3⁶}{2⁴}", r"\frac{(\frac{2}{3})⁵ · 3⁶}{2⁴}"),
    ]
    bad = 0
    for src, exp in tests:
        got = tex(src)
        if got != exp:
            bad += 1
            print("FAIL", src, "→", got, "| ожидалось", exp)
    print("texify tests:", len(tests) - bad, "/", len(tests))
