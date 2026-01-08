// netlify/functions/getHeatmap.js

// ==========================================
// 1. 辅助工具函数
// ==========================================

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

function levelByCount(count, t1 = 5, t2 = 10) {
    if (!count || count <= 0) return 0;
    if (count < t1) return 1;
    if (count <= t2) return 2;
    return 3;
}

// 🔥 核心修复：智能日期读取函数 (已验证) 🔥
function getDateProp(page, propName) {
    if (!page || !page.properties) return null;
    const p = page.properties[propName];
    if (!p) return null;

    // 情况 A: 手动选择的 Date (📅)
    if (p.type === "date" && p.date && p.date.start) {
        return String(p.date.start).slice(0, 10);
    }

    // 情况 B: 自动生成的 Created Time (🕒) - ✅ 这里修复了你的问题
    if (p.type === "created_time" && p.created_time) {
        return String(p.created_time).slice(0, 10);
    }

    // 情况 C: 自动生成的 Last Edited Time
    if (p.type === "last_edited_time" && p.last_edited_time) {
        return String(p.last_edited_time).slice(0, 10);
    }

    return null;
}

// Notion API 查询
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

// ==========================================
// 2. 主处理逻辑
// ==========================================

exports.handler = async(event) => {
    try {
        const databaseId = process.env.NOTION_DB_ID;
        // 加上 .trim() 防止 Token 带空格
        const notionToken = process.env.NOTION_TOKEN ? process.env.NOTION_TOKEN.trim() : "";

        if (!databaseId || !notionToken) {
            return { statusCode: 500, body: JSON.stringify({ error: "Missing Env Vars" }) };
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
        const toISO = toISODate(addDays(today, 1));

        // ⚠️ 你的列名是 "Added Date"
        const PROP_ADDED = "Added Date";
        const PROP_REVIEWED = "Last Reviewed";
        const PROP_QUIZ = "Last Quiz";

        const pages = await queryAll(databaseId, notionToken, {
            property: PROP_ADDED,
            date: { on_or_after: fromISO, before: toISO },
        });

        const counts = new Map();

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
                add: levelByCount(c.newCount),
                review: levelByCount(c.reviewCount),
                quiz: levelByCount(c.quizCount),
            });
        }

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-store"
            },
            body: JSON.stringify(out),
        };

    } catch (err) {
        console.error("Function Error:", err);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: "getHeatmap failed",
                message: err && err.message ? err.message : String(err),
            }),
        };
    }
};