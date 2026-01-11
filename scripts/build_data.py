import os, json
import requests

NOTION_TOKEN = os.environ["NOTION_TOKEN"]
DB_ID = os.environ["NOTION_DB_ID"]

HEADERS = {
    "Authorization": f"Bearer {NOTION_TOKEN}",
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
}

# === Notion 字段名（按你的数据库）===
ADDED_DATE = "Added Date"
LAST_REVIEWED = "Last Reviewed"
LAST_QUIZ = "Last Quiz"
# ===================================

def fetch_all_pages():
    url = f"https://api.notion.com/v1/databases/{DB_ID}/query"
    payload = {"page_size": 100}
    pages = []

    while True:
        r = requests.post(url, headers=HEADERS, json=payload)
        r.raise_for_status()
        data = r.json()
        pages.extend(data["results"])
        if not data.get("has_more"):
            break
        payload["start_cursor"] = data["next_cursor"]

    return pages

def get_date(props, name):
    d = props.get(name, {}).get("date")
    if d and d.get("start"):
        return d["start"][:10]
    return None

def main():
    pages = fetch_all_pages()
    daily = {}

    def ensure(day):
        if day not in daily:
            daily[day] = {"date": day, "add": 0, "review": 0, "quiz": 0}

    for p in pages:
        props = p["properties"]

        d_add = get_date(props, ADDED_DATE)
        if d_add:
            ensure(d_add)
            daily[d_add]["add"] += 1

        d_rev = get_date(props, LAST_REVIEWED)
        if d_rev:
            ensure(d_rev)
            daily[d_rev]["review"] += 1

        d_quiz = get_date(props, LAST_QUIZ)
        if d_quiz:
            ensure(d_quiz)
            daily[d_quiz]["quiz"] += 1

    out = sorted(daily.values(), key=lambda x: x["date"])

    os.makedirs("docs", exist_ok=True)
    with open("docs/data.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    main()