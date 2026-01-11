import os, json
import requests

NOTION_TOKEN = os.environ["NOTION_TOKEN"]
DB_ID = os.environ["NOTION_DB_ID"]

HEADERS = {
    "Authorization": f"Bearer {NOTION_TOKEN}",
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
}

# === 你的 Notion 字段名（来自截图）===
ADDED_DATE_PROP = "Added Date"
LAST_REVIEWED_PROP = "Last Reviewed"
LAST_QUIZ_PROP = "Last Quiz"
REVIEW_STAGE_PROP = "Review Stage"  # 可选
# =====================================

def query_all():
    url = f"https://api.notion.com/v1/databases/{DB_ID}/query"
    payload = {"page_size": 100}
    out = []
    while True:
        r = requests.post(url, headers=HEADERS, json=payload, timeout=60)
        r.raise_for_status()
        data = r.json()
        out.extend(data["results"])
        if not data.get("has_more"):
            break
        payload["start_cursor"] = data["next_cursor"]
    return out

def get_date(props, name):
    d = props.get(name, {}).get("date")
    if not d or not d.get("start"):
        return None
    return d["start"][:10]

def get_number(props, name):
    return int((props.get(name, {}) or {}).get("number") or 0)

def main():
    pages = query_all()
    agg = {}

    def ensure(day):
        if day not in agg:
            agg[day] = {"date": day, "add": 0, "review": 0, "quiz": 0}

    for p in pages:
        props = p.get("properties", {})

        # New
        d_add = get_date(props, ADDED_DATE_PROP)
        if d_add:
            ensure(d_add)
            agg[d_add]["add"] += 1

        # Review
        d_rev = get_date(props, LAST_REVIEWED_PROP)
        stage = get_number(props, REVIEW_STAGE_PROP)
        if d_rev and stage >= 1:
            ensure(d_rev)
            agg[d_rev]["review"] += 1

        # Quiz
        d_quiz = get_date(props, LAST_QUIZ_PROP)
        if d_quiz:
            ensure(d_quiz)
            agg[d_quiz]["quiz"] += 1

    arr = sorted(agg.values(), key=lambda x: x["date"])

    os.makedirs("public", exist_ok=True)
    with open("public/data.json", "w", encoding="utf-8") as f:
        json.dump(arr, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    main()