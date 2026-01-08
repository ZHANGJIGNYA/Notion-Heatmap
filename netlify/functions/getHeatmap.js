// netlify/functions/getHeatmap.js

function pad(n) {
    return String(n).padStart(2, "0");
}

function toISODate(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
}

function levelByCount(count, t1 = 10, t2 = 20) {
    if (!count || count <= 0) return 0;
    if (count < t1) return 1;
    if (count <= t2) return 2;
    return 3;
}

function getProp(page, propName) {
    if (!page || !page.properties) return null;
    return page.properties[propName] || null;
}

function getDateProp(page, propName) {
    const p = getProp(page, propName);
    if (!p) return null;
    if (p.type === "date" && p.date && p.date.start) {
        return String(p.date.start).slice(0, 10);
    }
    return null;
}

// Notion database query with pagination
async function queryAll(databaseId, notionToken, filter) {
    let results = [];
    let cursor = undefined;

    while (true) {
        const resp = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${notionToken}`,
                "Content-Type": "application/json",
                "Notion-Version": "2022-06-28",
            },
            body: JSON.stringify({
                page_size: 100,
                start_cursor: cursor,
                filter,
            }),
        });

        const data = await resp.json();
        if (!resp.ok) {
            throw new Error(`Notion query failed: ${resp.status} ${JSON.stringify(data)}`);
        }

        results = results.concat(data.results || []);
        if (!data.has_more) break;
        cursor = data.next_cursor;
    }

    return results;
}

exports.handler = async(event) => {
    try {
        const databaseId = process.env.NOTION_DB_ID; // ✅ 统一用你已有的
        const notionToken = process.env.NOTION_TOKEN;

        if (!databaseId) {
            return { statusCode: 500, body: JSON.stringify({ error: "Missing NOTION_DB_ID" }) };
        }
        if (!notionToken) {
            return { statusCode: 500, body: JSON.stringify({ error: "Missing NOTION_TOKEN" }) };
        }

        const days = Math.min(
            400,
            Math.max(
                30,
                parseInt(
                    event.queryStringParameters && event.queryStringParameters.days ?
                    event.queryStringParameters.days :
                    "180",
                    10
                )
            )
        );

        const today = startOfDay(new Date());
        const from = startOfDay(addDays(today, -(days - 1)));
        const fromISO = toISODate(from);
        const toISO = toISODate(addDays(today, 1)); // exclusive

        // 你的字段名
        const PROP_ADDED = "Added Date";
        const PROP_REVIEWED = "Last Reviewed";
        const PROP_QUIZ = "Last Quiz";

        // 先按 Added Date 拉数据（你目前 review / quiz 还没做也够用）
        const pages = await queryAll(databaseId, notionToken, {
            property: PROP_ADDED,
            date: { on_or_after: fromISO, before: toISO },
        });

        const counts = new Map(); // date -> { newCount, reviewCount, quizCount }
        function bump(date, key) {
            if (!date) return;
            if (!counts.has(date)) counts.set(date, { newCount: 0, reviewCount: 0, quizCount: 0 });
            counts.get(date)[key] += 1;
        }

        for (const page of pages) {
            bump(getDateProp(page, PROP_ADDED), "newCount");
            bump(getDateProp(page, PROP_REVIEWED), "reviewCount");
            bump(getDateProp(page, PROP_QUIZ), "quizCount");
        }

        const out = [];
        for (let i = 0; i < days; i++) {
            const d = toISODate(addDays(from, i));
            const c = counts.get(d) || { newCount: 0, reviewCount: 0, quizCount: 0 };
            out.push({
                date: d,
                add: levelByCount(c.newCount, 10, 20),
                review: levelByCount(c.reviewCount, 10, 20),
                quiz: levelByCount(c.quizCount, 10, 20),
            });
        }

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
            body: JSON.stringify(out),
        };
    } catch (err) {
        console.error(err);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: "getHeatmap failed",
                message: err && err.message ? err.message : String(err),
            }),
        };
    }
};