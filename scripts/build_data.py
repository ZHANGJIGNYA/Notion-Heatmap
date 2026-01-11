import os, json
import requests

NOTION_TOKEN = os.environ["NOTION_TOKEN"]
DB_ID = os.environ["NOTION_DB_ID"]

HEADERS = {
    "Authorization": f"Bearer {NOTION_TOKEN}",
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
}

# 你的字段名
ADDED_DATE = "Added Date"
LAST_REVIEWED = "Last Reviewed"
LAST_QUIZ = "Last Quiz"

def get_date_any(props, name):
    prop = props.get(name)
    if not prop:
        return None
    t = prop.get("type")

    if t == "date":
        d = prop.get("date")
        if d and d.get("start"):
            return d["start"][:10]
        return None

    if t in ("created_time", "last_edited_time"):
        v = prop.get(t)
        return v[:10] if v else None

    if t == "formula":
        f = prop.get("formula", {})
        if f.get("type") == "date":
            d = f.get("date")
            if d and d.get("start"):
                return d["start"][:10]
        return None

    if t == "rollup":
        r = prop.get("rollup", {})
        rt = r.get("type")
        if rt == "date":
            d = r.get("date")
            if d and d.get("start"):
                return d["start"][:10]
        if rt == "array":
            for item in r.get("array", []):
                if item.get("type") == "date":
                    d = item.get("date")
                    if d and d.get("start"):
                        return d["start"][:10]
        return None

    return None

def fetch_all_pages():
    url = f"https://api.notion.com/v1/databases/{DB_ID}/query"
    payload = {"page_size": 100}
    pages = []
    n_calls = 0

    while True:
        n_calls += 1
        r = requests.post(url, headers=HEADERS, json=payload, timeout=60)
        print("status:", r.status_code, "call:", n_calls)
        r.raise_for_status()
        data = r.json()

        got = len(data.get("results", []))
        pages.extend(data.get("results", []))
        print("  results this page:", got, "total so far:", len(pages), "has_more:", data.get("has_more"))

        if not data.get("has_more"):
            break
        payload["start_cursor"] = data["next_cursor"]

    return pages

def main():
    pages = fetch_all_pages()
    print("TOTAL pages fetched:", len(pages))
    if not pages:
        print("⚠️ No pages fetched. Check DB_ID / integration permissions.")
        return

    # 打印第一条记录的字段，确认字段名是否匹配
    keys = list(pages[0].get("properties", {}).keys())
    print("First page property keys sample:", keys[:30])
    for k in [ADDED_DATE, LAST_REVIEWED, LAST_QUIZ]:
        p = pages[0]["properties"].get(k)
        print(f"Field '{k}' exists?", p is not None, "type:", (p or {}).get("type"))

    daily = {}
    def ensure(day):
        daily.setdefault(day, {"date": day, "add": 0, "review": 0, "quiz": 0})

    miss_add = miss_rev = miss_quiz = 0

    for p in pages:
        props = p.get("properties", {})

        d_add = get_date_any(props, ADDED_DATE)
        if d_add:
            ensure(d_add)
            daily[d_add]["add"] += 1
        else:
            miss_add += 1

        d_rev = get_date_any(props, LAST_REVIEWED)
        if d_rev:
            ensure(d_rev)
            daily[d_rev]["review"] += 1
        else:
            miss_rev += 1

        d_quiz = get_date_any(props, LAST_QUIZ)
        if d_quiz:
            ensure(d_quiz)
            daily[d_quiz]["quiz"] += 1
        else:
            miss_quiz += 1

    out = sorted(daily.values(), key=lambda x: x["date"])
    print("days aggregated:", len(out))
    print("missing counts (no date found) add/rev/quiz:", miss_add, miss_rev, miss_quiz)

    os.makedirs("docs", exist_ok=True)
    with open("docs/data.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print("✅ wrote docs/data.json")

if __name__ == "__main__":
    main()