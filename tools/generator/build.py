"""Генератор банка: content_*.py → data/lessons.json + data/tasks.json → js/tasks.js.
Шаги: самопроверка ответов → перенумерация уроков (1..N подряд, т. к. роутинг и «◀ ▶» работают
с целыми номерами) → единая разметка дробей \\frac{}{} → контроль: в данных нет подсказок/источников → экспорт."""
import json, sys, subprocess, re, collections
import pathlib; HERE = pathlib.Path(__file__).resolve().parent; sys.path.insert(0, str(HERE))
from dsl import LESSONS, MODULES, TASKS, MOCKS, verify
import content_a, content_b, content_c, content_d, content_e, content_f  # noqa
import content_g  # noqa  (банк сайта anichkov-liceum-trenazhor)
from texify import tex, leftovers
REPO = str(HERE.parent.parent)
bad = verify()

# ---- 2. Перенумерация уроков ----
LESSONS.sort(key=lambda l: l["num"])
fmt = lambda n: str(int(n)) if float(n).is_integer() else str(n)
remap = {fmt(l["num"]): str(i) for i, l in enumerate(LESSONS, 1)}
ren = lambda s: re.sub(r"Урок (\d+(?:\.\d+)?)(?= ·)", lambda m: "Урок " + remap.get(m[1], m[1]), s) if isinstance(s, str) else s
new_tasks = {}
for l in LESSONS:
    old = fmt(l["num"])
    l["num"] = int(remap[old])
    for kind in "KD":
        v = TASKS[f"{kind}-{old}"]
        v["title"] = ren(v["title"])
        for q in v["questions"]:
            q["crumb"] = ren(q["crumb"])
        new_tasks[f"{kind}-{l['num']}"] = v
for key, v in TASKS.items():
    if key.startswith("P-"):
        new_tasks[key] = v
TASKS.clear(); TASKS.update(new_tasks)
moved = {k: v for k, v in remap.items() if k != v}
g = content_g.STATS
print(f"банк-2: перенесено {g['rows']}, исключено {len(g['dropped'])}, в выбор {g['choice']}, списков {g['lists']}, "
      f"подписей-подсказок → «Ответ:» {g['neutral']}")
print("банк-2 по урокам:", dict(sorted(g["per_lesson"].items())))
print("перенумерация уроков:", ", ".join(f"{k}→{v}" for k, v in moved.items()) or "нет")

# ---- 3. Единая разметка дробей ----
for v in TASKS.values():
    for q in v["questions"]:
        for f in ("title", "sub", "crumb"):
            q[f] = tex(q[f])
        for t in q["tasks"]:
            t["label"] = tex(t["label"])
            t["e"] = tex(t.get("e", ""))
            t["parts"] = [tex(p) if isinstance(p, str) else p for p in t["parts"]]
            for i in t["inputs"]:
                if i.get("type") == "choice":  # варианты и ответ конвертируются одинаково — сравнение сохраняется
                    i["options"] = [tex(o) for o in i["options"]]
                    i["a"] = tex(i["a"])
for l in LESSONS:
    th = l["theory"]
    th["rules"] = [tex(r) for r in th["rules"]]
    if th.get("sample"):
        th["sample"] = tex(th["sample"])

# ---- 4. Отчёт: остатки «/» (допустимы только единицы измерения) ----
ALLOWED = re.compile(r"^(?:км|м|см|куб)/(?:ч|мин|с)\b|^\+/−")
def strings():
    for key, v in TASKS.items():
        for q in v["questions"]:
            yield key, q["title"]; yield key, q["sub"]; yield key, q["crumb"] or ""
            for t in q["tasks"]:
                yield key, t["label"]; yield key, t["e"]
                yield from ((key, p) for p in t["parts"] if isinstance(p, str))
                for i in t["inputs"]:
                    yield from ((key, o) for o in i.get("options", []))
    for l in LESSONS:
        yield from ((f"L{l['num']}", r) for r in l["theory"]["rules"]); yield f"L{l['num']}", l["theory"].get("sample", "")
left = []
for key, s in strings():
    for lo in leftovers(s):
        frag = re.sub(r"^.*?(\S*/)", r"\1", lo)
        core = re.search(r"[A-Za-zА-Яа-я+]+/[A-Za-zА-Яа-я−]+", lo)
        if not (core and ALLOWED.match(core[0])):
            left.append((key, lo))
print(f"остатки «/» вне единиц измерения: {len(left)}")
for k, lo in left[:40]:
    print("   ", k, "|", lo)

# ---- 5. Аудит по темам ----
rows = [(k, t) for k, v in TASKS.items() for q in v["questions"] for t in q["tasks"]]
# Подсказки, источники и бейджи уровня удалены из самих данных (а не скрыты CSS).
FORBIDDEN_Q, FORBIDDEN_T = {"hints"}, {"src"}
assert not any(FORBIDDEN_Q & q.keys() for v in TASKS.values() for q in v["questions"]), "в вопросах остались hints"
assert not any(FORBIDDEN_T & t.keys() for _, t in rows), "в задачах остался src"
assert not any("badge" in v for v in TASKS.values()) and not any("badge" in l for l in LESSONS), "остался badge"
assert not any("source" in l["theory"] for l in LESSONS), "в теории остался source"
SRC_RE = re.compile(r"\((?:вступительные\s+)?(?:19|20)\d\d(?:,\s*(?:19|20)\d\d)*\)|Михлин|Макарычев|Атанасян|ФМШ|пособи|учебник|§")
src_left = [(k, s) for k, s in strings() if s and SRC_RE.search(s)]
src_left += [(k, s) for k, v in TASKS.items() for s in (v["title"], v["topic"]) if SRC_RE.search(s)]
src_left += [(f"L{l['num']}", s) for l in LESSONS for s in (l["title"], l["short"]) if SRC_RE.search(s)]
assert not src_left, f"остались упоминания источников: {src_left[:5]}"
per_lesson = collections.Counter()
for k, t in rows:
    if not k.startswith("P-"):
        per_lesson[int(k.split("-")[1])] += 1
low = {n: c for n, c in per_lesson.items() if c < 15}
print("задач по урокам:", dict(sorted(per_lesson.items())))
print("уроков с < 15 задачами:", low or "нет")

inputs = sum(len(t["inputs"]) for _, t in rows)
print(f"modules={len(MODULES)} lessons={len(LESSONS)} variants={len(TASKS)} mocks={len(MOCKS)} "
      f"tasks(rows)={len(rows)} inputs={inputs}")
json.dump({"modules": MODULES, "lessons": LESSONS, "mocks": MOCKS}, open(f"{REPO}/data/lessons.json", "w"), ensure_ascii=False, indent=2)
json.dump(TASKS, open(f"{REPO}/data/tasks.json", "w"), ensure_ascii=False, indent=2)
subprocess.run(["python3", f"{REPO}/tools/build_tasks.py"], check=True)
sys.exit(1 if (bad or left) else 0)
