import json, sys, subprocess
import pathlib; HERE = pathlib.Path(__file__).resolve().parent; sys.path.insert(0, str(HERE))
from dsl import LESSONS, MODULES, TASKS, verify
import content_a, content_b, content_c  # noqa
REPO = str(HERE.parent.parent)
bad = verify()
# структурные проверки
for l in LESSONS:
    assert f"K-{l['num']}" in TASKS and f"D-{l['num']}" in TASKS
rows = sum(len(q["tasks"]) for v in TASKS.values() for q in v["questions"])
inputs = sum(len(t["inputs"]) for v in TASKS.values() for q in v["questions"] for t in q["tasks"])
types = {}
for v in TASKS.values():
    for q in v["questions"]:
        for t in q["tasks"]:
            for i in t["inputs"]:
                types[i["type"] or "input"] = types.get(i["type"] or "input", 0) + 1
print(f"modules={len(MODULES)} lessons={len(LESSONS)} variants={len(TASKS)} tasks(rows)={rows} inputs={inputs} types={types}")
json.dump({"modules": MODULES, "lessons": LESSONS}, open(f"{REPO}/data/lessons.json", "w"), ensure_ascii=False, indent=2)
json.dump(TASKS, open(f"{REPO}/data/tasks.json", "w"), ensure_ascii=False, indent=2)
subprocess.run(["python3", f"{REPO}/tools/build_tasks.py"], check=True)
sys.exit(1 if bad else 0)
