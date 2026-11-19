#!/usr/bin/env python3
"""Собирает js/tasks.js из data/lessons.json и data/tasks.json.

Зачем: сайт работает без сборщика и без fetch (открывается даже как file://),
поэтому банк задач подключается обычным <script src="js/tasks.js">.
Источник истины — JSON в папке data/. После правки JSON запустите:
    python3 tools/build_tasks.py
(GitHub Actions делает это автоматически при каждом деплое.)
"""
import json
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parent.parent
lessons = json.loads((root / "data/lessons.json").read_text(encoding="utf-8"))
tasks = json.loads((root / "data/tasks.json").read_text(encoding="utf-8"))

# Минимальная валидация, чтобы опечатка в JSON не сломала сайт
errors = []
for l in lessons["lessons"]:
    for k in ("K", "D"):
        key = f"{k}-{l['num']}"
        if key not in tasks:
            errors.append(f"нет варианта {key}")
for key, v in tasks.items():
    for q in v["questions"]:
        for t in q["tasks"]:
            n = sum(1 for p in t["parts"] if isinstance(p, dict))
            if n != len(t["inputs"]):
                errors.append(f"{key} зад.{q['num']}: полей в parts {n}, inputs {len(t['inputs'])}")
            for i in t["inputs"]:
                if i.get("type") == "choice" and i["a"] not in i.get("options", []):
                    errors.append(f"{key} зад.{q['num']}: ответ «{i['a']}» не входит в options")
for m in lessons.get("mocks", []):
    v = tasks.get(f"P-{m['num']}")
    if not v or not v.get("mock") or not v.get("minutes"):
        errors.append(f"пробник П-{m['num']}: нет варианта P-{m['num']} с mock/minutes")
for key, v in tasks.items():
    for q in v["questions"]:
        for t in q["tasks"]:
            if not t.get("src"):
                errors.append(f"{key} зад.{q['num']}: нет обоснования src")
if errors:
    print("ОШИБКИ В БАНКЕ ЗАДАЧ:\n  " + "\n  ".join(errors))
    sys.exit(1)

rows = sum(len(q["tasks"]) for v in tasks.values() for q in v["questions"])
header = (
    "/* ============================================================\n"
    " * TASKS.JS — БАНК ЗАДАЧ (СГЕНЕРИРОВАН АВТОМАТИЧЕСКИ, НЕ РЕДАКТИРУЙТЕ)\n"
    " * Источник: data/lessons.json + data/tasks.json → python3 tools/build_tasks.py\n"
    f" * Модулей: {len(lessons['modules'])}, уроков: {len(lessons['lessons'])}, "
    f"вариантов: {len(tasks)}, пробников: {len(lessons.get('mocks', []))}, заданий: {rows}\n"
    " * ============================================================ */\n"
)
body = (
    "const LESSONS_DATA = " + json.dumps(lessons, ensure_ascii=False) + ";\n"
    "const TASKS = " + json.dumps(tasks, ensure_ascii=False) + ";\n"
)
(root / "js/tasks.js").write_text(header + body, encoding="utf-8")
print(f"js/tasks.js: {len(tasks)} вариантов, {rows} заданий")
