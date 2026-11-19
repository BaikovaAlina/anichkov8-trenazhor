"""Мини-DSL для описания банка задач. Генерирует структуру, совместимую с эталоном
(questions → tasks → parts/inputs), плюс новые типы choice/point и поле пояснения e."""
from fractions import Fraction as F
import re

LESSONS, MODULES, TASKS = [], [], {}
CHECKS = []  # (key, label, answer, value) для самопроверки


def fr(num, den):
    """Вертикальная дробь (готовый HTML, formatMath его не трогает)."""
    return f'<span class="frac"><span class="num">{num}</span><span class="den">{den}</span></span>'


def _num(s):
    s = s.strip().replace("−", "-").replace(",", ".")
    m = re.match(r"^(-?)(\d+) (\d+)/(\d+)$", s)
    if m:
        v = int(m[2]) + F(int(m[3]), int(m[4]))
        return -v if m[1] else v
    if "/" in s:
        a, b = s.split("/")
        return F(a) / F(b)
    return F(s)


def R(label, ans, e="", pre="Ответ:", type="", chk=None, fig=None, post=None):
    """Строка с одним полем ввода."""
    parts = [pre, {"_input": 0}] if pre else [{"_input": 0}]
    if post:
        parts.append(post)
    row = {"label": label, "parts": parts, "inputs": [{"a": ans, "type": type}], "e": e}
    if fig:
        row["fig"] = fig
    if chk is not None:
        CHECKS.append((label, ans, chk))
    return row


def M(label, parts, answers, e="", types=None, fig=None, chks=None):
    """Строка с несколькими полями: parts — список строк и None (места полей)."""
    out, k = [], 0
    for p in parts:
        if p is None:
            out.append({"_input": k})
            k += 1
        else:
            out.append(p)
    assert k == len(answers), label
    types = types or [""] * k
    row = {"label": label, "parts": out,
           "inputs": [{"a": a, "type": t} for a, t in zip(answers, types)], "e": e}
    if fig:
        row["fig"] = fig
    if chks:
        for a, c in zip(answers, chks):
            if c is not None:
                CHECKS.append((label, a, c))
    return row


def C(label, options, ans, e="", pre=None):
    """Выбор одного варианта."""
    assert ans in options, (label, ans)
    parts = ([pre] if pre else []) + [{"_input": 0}]
    return {"label": label, "parts": parts,
            "inputs": [{"a": ans, "type": "choice", "options": options}], "e": e}


def P(label, grid, ans, e=""):
    """Перетаскивание точки по клетчатому чертежу (ответ — узел сетки)."""
    return {"label": label, "parts": [{"_input": 0}],
            "inputs": [{"a": ans, "type": "point", "grid": grid}], "e": e}


def Q(title, sub, hints, rows, crumb=None):
    return {"title": title, "sub": sub, "hints": hints if isinstance(hints, list) else [hints],
            "rows": rows, "crumb": crumb}


def lesson(num, module, level, badge, title, short, theory, K, D):
    LESSONS.append({"num": num, "module": module, "level": level, "badge": badge,
                    "title": title, "short": short, "theory": theory})
    for kind, (topic, qs) in (("K", K), ("D", D)):
        key = f"{kind}-{num}"
        work = "Классная работа" if kind == "K" else "Домашнее задание"
        questions = []
        for qi, q in enumerate(qs, 1):
            tasks = []
            for ri, r in enumerate(q["rows"]):
                for inp in r["inputs"]:
                    inp["g"] = f"q{qi}r{ri}"
                    inp["w"] = 1
                tasks.append(r)
            questions.append({
                "num": str(qi), "title": q["title"], "sub": q["sub"],
                "crumb": q["crumb"] or f"Урок {num} · {'Классная' if kind == 'K' else 'ДЗ'}",
                "hints": q["hints"], "tasks": tasks})
        TASKS[key] = {"title": f"Урок {num} · {work}", "topic": topic, "badge": badge,
                      "questions": questions}


def module(num, title, section):
    MODULES.append({"num": num, "title": title, "section": section})


def verify():
    bad = 0
    for label, ans, val in CHECKS:
        first = ans.split("|")[0]
        try:
            if ";" in first:
                got = sorted(_num(x) for x in first.split(";"))
                exp = sorted(F(v) for v in val)
                ok = got == exp
            else:
                ok = abs(float(_num(first)) - float(val)) < 1e-9
        except Exception as ex:  # noqa
            ok = False
        if not ok:
            bad += 1
            print("MISMATCH:", label[:70], "| ans:", ans, "| calc:", val)
    print(f"checked {len(CHECKS)} answers, mismatches: {bad}")
    return bad
