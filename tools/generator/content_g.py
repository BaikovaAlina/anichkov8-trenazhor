"""Объединение банков: задачи сайта anichkov-liceum-trenazhor (bank2/tasks.json, 32 урока, 326 задач)
вливаются в уроки этого тренажёра по темам (K → классная, D → домашняя).
• дубли наших задач и внутренние повторы исключаются (список DROP с причинами);
• вопросы «да/нет», «чётна/нечётна», «рыцарь/лжец», «№ признака» переводятся в выбор варианта;
• ответы-списки приводятся к виду «a; b»;
• каждой задаче проставляется обоснование src (тип Аничкова / раздел Михлина / «Углублённый»).
Импортируется после content_f (номера уроков здесь — итоговые, после перенумерации)."""
import json, pathlib, re
from dsl import LESSONS, TASKS, _mkq
from srcs import *

BANK = json.loads((pathlib.Path(__file__).parent / "bank2/tasks.json").read_text(encoding="utf-8"))
SFX = " · задача из банка anichkov-liceum-trenazhor"
OM = "Пособие Михлина Л. С. и учебник Макарычева 8 кл.: опережающая тема; на вступительных в 8 кл. не встречается — уровень «Углублённый»"

# Урок банка-2 → (итоговый урок этого тренажёра, обоснование); переопределения по номеру вопроса.
MAP = {
    1: (1, A2), 2: (5, A3), 3: (12, A1), 4: (13, A5), 5: (2, A2), 6: (19, OP), 7: (7, A4), 8: (11, OP),
    9: (17, MI), 10: (18, MI), 11: (14, A5), 12: (12, A5), 13: (16, AL), 14: (16, OP), 15: (20, OP),
    16: (20, OP), 17: (21, A7), 18: (23, A7), 19: (24, A6), 20: (26, MG), 21: (28, MG), 22: (28, MG),
    23: (27, A6), 24: (27, MG), 25: (29, MG), 26: (29, MG), 27: (31, MK), 28: (31, MK), 29: (32, MN),
    30: (32, MN), 31: (33, A2), 32: (33, A6),
}
OVR = {  # (урок банка-2, вопрос) → (урок, src)
    (2, 1): (3, A1), (2, 3): (6, A3),
    (5, 2): (2, OM), (5, 3): (2, OM),
    (7, 2): (10, A1), (7, 3): (7, A5),
    (8, 3): (9, A4),
    (10, 2): (17, MI),
    (11, 3): (15, A5),
    (12, 3): (13, A5),
    (13, 2): (16, OP),
    (14, 2): (18, MI),
    (17, 3): (23, A7),
    (18, 2): (22, A7),
    (19, 1): (24, A6), (19, 2): (25, A6), (19, 3): (25, A6),
    (20, 3): (30, OP),
    (21, 2): (28, OP),
    (24, 3): (30, MG),
    (27, 3): (31, OP),
    (31, 2): (33, A3), (31, 3): (33, A5),
    (32, 3): (33, MG),
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
STATS = {"rows": 0, "dropped": [], "choice": 0, "lists": 0, "per_lesson": {}}


def _row(t):
    parts = [_fix(p) for p in t["parts"]]
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
            target, src = OVR.get((n, qn), MAP[n])
            rows = []
            for ri, t in enumerate(q["tasks"], 1):
                if (key, qn, ri) in DROP:
                    STATS["dropped"].append((key, qn, ri, t["label"], DROP[(key, qn, ri)]))
                    continue
                r = _row(t)
                r["src"] = src + SFX
                rows.append(r)
            if not rows:
                continue
            v = TASKS[f"{kind}-{NEW2OLD[target]}"]["questions"]
            v.append(_mkq(NEW2OLD[target], kind, len(v) + 1,
                          {"title": _fix(q["title"]), "sub": _fix(q["sub"]), "hints": [_fix(h) for h in q["hints"]], "rows": rows, "crumb": None}))
            STATS["rows"] += len(rows)
            STATS["per_lesson"][target] = STATS["per_lesson"].get(target, 0) + len(rows)

assert len(STATS["dropped"]) == len(DROP), "не все строки DROP найдены"
