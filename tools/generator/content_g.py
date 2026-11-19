"""Объединение банков: задачи сайта anichkov-liceum-trenazhor (bank2/tasks.json, 32 урока, 326 задач)
вливаются в уроки этого тренажёра по темам (K → классная, D → домашняя).
• дубли наших задач и внутренние повторы исключаются (список DROP с причинами);
• вопросы «да/нет», «чётна/нечётна», «рыцарь/лжец», «№ признака» переводятся в выбор варианта;
• ответы-списки приводятся к виду «a; b»;
• подсказки (hints), источники и подзаголовки-подсказки банка-2 не переносятся; подписи перед полем
  ввода, раскрывающие ход решения («1 : 5 · 100% =», «√(9 + 16) =»), заменяются нейтральным «Ответ:».
Импортируется после content_f (номера уроков здесь — итоговые, после перенумерации)."""
import json, pathlib, re
from dsl import LESSONS, TASKS, _mkq

BANK = json.loads((pathlib.Path(__file__).parent / "bank2/tasks.json").read_text(encoding="utf-8"))

# Урок банка-2 → итоговый урок этого тренажёра; переопределения по номеру вопроса.
MAP = {
    1: 1, 2: 5, 3: 12, 4: 13, 5: 2, 6: 19, 7: 7, 8: 11,
    9: 17, 10: 18, 11: 14, 12: 12, 13: 16, 14: 16, 15: 20,
    16: 20, 17: 21, 18: 23, 19: 24, 20: 26, 21: 28, 22: 28,
    23: 27, 24: 27, 25: 29, 26: 29, 27: 31, 28: 31, 29: 32,
    30: 32, 31: 33, 32: 33,
}
OVR = {  # (урок банка-2, вопрос) → урок
    (2, 1): 3, (2, 3): 6,
    (5, 2): 2, (5, 3): 2,
    (7, 2): 10, (7, 3): 7,
    (8, 3): 9,
    (10, 2): 17,
    (11, 3): 15,
    (12, 3): 13,
    (13, 2): 16,
    (14, 2): 18,
    (17, 3): 23,
    (18, 2): 22,
    (19, 1): 24, (19, 2): 25, (19, 3): 25,
    (20, 3): 30,
    (21, 2): 28,
    (24, 3): 30,
    (27, 3): 31,
    (31, 2): 33, (31, 3): 33,
    (32, 3): 33,
}
# Исключённые строки: (вариант банка-2, вопрос, строка с 1) → причина
DROP = {
    ("K-6", 3, 1): "дубль: (√7 − √3)(√7 + √3) уже есть в уроке 19 (ДЗ)",
    ("K-8", 1, 2): "дубль: x² − 9 = 0 уже есть в уроке 19 (ДЗ)",
    ("K-17", 1, 1): "дубль: «трёхзначные из 1, 2, 3, 4 без повторений» уже есть в уроке 21",
    ("K-19", 2, 1): "дубль: «угол при вершине 40°» уже есть в уроке 25 (ДЗ)",
    ("K-31", 2, 2): "дубль: x² − 6x + 9 = 0 уже есть в уроке 11",
    ("D-28", 1, 1): "дубль: длина вектора (6; 8) уже есть в уроке 31 (ДЗ)",
    ("K-25", 2, 1): "дубль: «вписанный угол, опирающийся на диаметр» уже есть в уроке 29",
    ("D-25", 2, 2): "дубль: тот же факт про вписанный угол на диаметр",
    ("K-26", 1, 2): "дубль: касательные из одной точки, отрезок 7 — уже есть в уроке 29",
    ("K-23", 2, 1): "внутренний повтор банка: диагональ прямоугольника 6 × 8 (есть в его уроке 20)",
    ("D-26", 1, 1): "внутренний повтор банка: угол между касательной и радиусом (есть в его K-26)",
}
CHOICES = [
    (r"\s*\(да/нет\)", ["да", "нет"]),
    (r"\s*\(чётна/нечётна\)", ["чётна", "нечётна"]),
    (r"\s*\(чётно/нечётно\)", ["чётно", "нечётно"]),
    (r"\s*\(чётным/нечётным\)", ["чётным", "нечётным"]),
    (r"\s*\(рыцарь/лжец\)", ["рыцарь", "лжец"]),
    (r"\s*\(1, 2 или 3\)", ["1", "2", "3"]),
]

# Явная группировка многословных числителей/знаменателей перед texify (иначе «масса металла / масса сплава»
# разобралась бы как «масса (металла/масса) сплава»).
TEXT_FIX = [("масса металла / масса сплава", "(масса металла) / (масса сплава)"),
            ("(разность / исходное)", "(разность) / (исходное)"),
            ("d₁·d₂/2", "(d₁·d₂)/2"), ("a·h/2", "(a·h)/2"), ("a·b/2", "(a·b)/2")]


def _fix(x):
    if not isinstance(x, str):
        return x
    for a, b in TEXT_FIX:
        x = x.replace(a, b)
    return x


# итоговый номер урока → ключ варианта в момент импорта (до перенумерации)
_fmt = lambda n: str(int(n)) if float(n).is_integer() else str(n)
NEW2OLD = {i: _fmt(l["num"]) for i, l in enumerate(sorted(LESSONS, key=lambda l: l["num"]), 1)}
STATS = {"rows": 0, "dropped": [], "choice": 0, "lists": 0, "neutral": 0, "per_lesson": {}}

# Подпись перед полем допустима, если это только имя величины («x =», «S₄ =», «Корни:», «Ответ (%):»).
_LABEL_OK = re.compile(r"^[,\s]*[A-Za-zА-Яа-яЁё₀-₉ⁿ∠|°'()\-\s/.%,]*[=:]?\s*$")
_VEC_OK = re.compile(r"^\s*\d*[a-z](\s*[+−]\s*[a-z])?\s*=\s*$")  # «2a =», «a + b =» — имя искомого вектора


def _neutral(p):
    """Подпись, раскрывающая ход решения (числа, действия, «Получится …», «Проверьте …»), → «Ответ:»."""
    if not isinstance(p, str) or not p.strip():
        return p
    if _LABEL_OK.match(p) and not re.search(r"[0-9]", p):
        return p
    if _VEC_OK.match(p) or re.fullmatch(r"\s*(Ответ|Признак №|B —).*", p) or re.fullmatch(r"\s*\d+%-го:\s*", p):
        return p
    STATS["neutral"] += 1
    return "Ответ:"


def _sub(s):
    """Подзаголовок банка-2: оставляем только формат ответа / способ ввода; формулы-подсказки и
    советы по ходу решения («— a² + b² = c²», «— сначала разложите числитель») не переносятся."""
    s = _fix(s or "")
    if re.search(r"корни через запятую\)", s):
        return "— корни через запятую"
    if re.search(r"дробью или десятичным", s):
        return "— ответ можно дать дробью или десятичным числом"
    if re.search(r"\(дробь или десятичное", s):
        return "— ответ: дробь или десятичное число"
    if re.search(r"сторона клетки = 1", s):
        return "— сторона клетки = 1"
    if re.search(r"^— (корни через|ответ в виде|перетащите|выберите|чётная или нечётная\?)", s):
        return s
    return ""


def _row(t):
    parts = [_fix(p) for p in t["parts"]]
    # подпись непосредственно перед полем ввода не должна подсказывать ход решения
    parts = [_neutral(p) if i + 1 < len(parts) and isinstance(parts[i + 1], dict) else p
             for i, p in enumerate(parts)]
    inputs = [{"a": i["a"], "type": i.get("type", "")} for i in t["inputs"]]
    label = _fix(t["label"])
    if len(inputs) == 1:
        for pat, opts in CHOICES:
            hay = label + " " + " ".join(p for p in parts if isinstance(p, str))
            if re.search(pat, hay):
                label = re.sub(pat, "", label)
                parts = [re.sub(pat, "", p) if isinstance(p, str) else p for p in parts]
                ans = inputs[0]["a"].split("|")[0].strip()
                assert ans in opts, (label, ans)
                inputs[0] = {"a": ans, "type": "choice", "options": opts}
                STATS["choice"] += 1
                break
    for i in inputs:
        if i["type"] == "list":
            i["a"] = "; ".join(x.strip() for x in i["a"].split(","))
            STATS["lists"] += 1
    return {"label": label, "parts": parts, "inputs": inputs, "e": ""}


for n in range(1, 33):
    for kind in "KD":
        key = f"{kind}-{n}"
        for q in BANK[key]["questions"]:
            qn = int(q["num"])
            target = OVR.get((n, qn), MAP[n])
            rows = []
            for ri, t in enumerate(q["tasks"], 1):
                if (key, qn, ri) in DROP:
                    STATS["dropped"].append((key, qn, ri, t["label"], DROP[(key, qn, ri)]))
                    continue
                rows.append(_row(t))
            if not rows:
                continue
            v = TASKS[f"{kind}-{NEW2OLD[target]}"]["questions"]
            v.append(_mkq(NEW2OLD[target], kind, len(v) + 1,
                          {"title": re.sub(r"\s*\(задача в стиле Аничкова\)", "", _fix(q["title"])), "sub": _sub(q["sub"]), "rows": rows, "crumb": None}))
            STATS["rows"] += len(rows)
            STATS["per_lesson"][target] = STATS["per_lesson"].get(target, 0) + len(rows)

assert len(STATS["dropped"]) == len(DROP), "не все строки DROP найдены"
