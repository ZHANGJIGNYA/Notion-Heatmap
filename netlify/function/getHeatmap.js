// netlify/functions/getHeatmap.js
const { Client } = require("@notionhq/client");

const notion = new Client({ auth: process.env.NOTION_TOKEN });

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
    // 0 => 0; 1..9 => 1; 10..20 => 2; >20 => 3
    if (!count || count <= 0) return 0;
    if (count < t1) return 1;
    if (count <= t2) return 2;
    return 3;
}

function getDateProp(page, propName) {
    const p = getProp(page, propName);
    if (!p) return null;

    if (p.type === "date" && p.date && p.date.start) {
        return String(p.date.start).slice(0, 10);
    }
    return null;
}

async function queryAll(database_id, filter) {
    let results = [];
    let cursor = undefined;

    while (true) {
        const resp = await notion.databases.query({
            database_id,
            page_size: 100,
            start_cursor: cursor,
            filter,
        });

        results = results.concat(resp.results);
        if (!resp.has_more) break;
        cursor = resp.next_cursor;
    }

    return results;
}

exports.handler = async(event) => {
    try {
        const database_id = process.env.NOTION_DATABASE_ID;
        if (!database_id) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: "Missing NOTION_DATABASE_ID" }),
            };
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
        const toISO = toISODate(addDays(today, 1)); // exclusive-ish

        // 你数据库里的字段名（和你截图一致）
        const PROP_ADDED = "Added Date";
        const PROP_REVIEWED = "Last Reviewed";
        const PROP_QUIZ = "Last Quiz";

        // 为了减少 API 调用：先按 Added Date 拉范围内的（因为新增一定有 Added Date）
        // Review/Quiz 未来可能不在这个集合里，但你目前还没做 review/quiz 逻辑，够用了。
        // 如果你后面要完整覆盖“只复习但不是新增”的天，我们再做 2 次 query 合并。
        const pages = await queryAll(database_id, {
            property: PROP_ADDED,
            date: {
                on_or_after: fromISO,
                before: toISO,
            },
        });

        // 按天聚合 count
        const counts = new Map(); // date -> {newCount, reviewCount, quizCount}

        function bump(date, key) {
            if (!date) return;
            if (!counts.has(date)) counts.set(date, { newCount: 0, reviewCount: 0, quizCount: 0 });
            counts.get(date)[key] += 1;
        }

        for (const page of pages) {
            const dNew = getDateProp(page, PROP_ADDED);
            const dRev = getDateProp(page, PROP_REVIEWED);
            const dQuiz = getDateProp(page, PROP_QUIZ);

            bump(dNew, "newCount");
            bump(dRev, "reviewCount");
            bump(dQuiz, "quizCount");
        }

        // 输出 days 天，每天都给一条（没有就 0）
        const out = [];
        for (let i = 0; i < days; i++) {
            const d = toISODate(addDays(from, i));
            const c = counts.get(d) || { newCount: 0, reviewCount: 0, quizCount: 0 };

            out.push({
                date: d,
                add: levelByCount(c.newCount, 10, 20),
                review: levelByCount(c.reviewCount, 10, 20),
                quiz: levelByCount(c.quizCount, 10, 20),
                // 你调试时想看真实数量，可以先打开下面 3 行
                // newCount: c.newCount,
                // reviewCount: c.reviewCount,
                // quizCount: c.quizCount,
            });
        }

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-store",
            },
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