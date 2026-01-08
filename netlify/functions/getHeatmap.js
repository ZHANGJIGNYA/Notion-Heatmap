// netlify/functions/getHeatmap.js

// ==========================================
// 1. 辅助工具函数 (Helper Functions)
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

// Notion API 查询函数（带分页处理）
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
// 2. 主处理逻辑 (Main Handler)
// ==========================================

exports.handler = async(event) => {
    try {
        const databaseId = process.env.NOTION_DB_ID;
        const notionToken = process.env.NOTION_TOKEN;

        // --- 🔍 调试代码开始 (部署后去 Log 查看) ---
        console.log("=== Environment Debug ===");
        console.log("DB ID exists?", !!databaseId);
        console.log("Token exists?", !!notionToken);

        if (notionToken) {
            // 打印前10位，检查是否包含多余的引号或空格
            // 正常应该是: [secret_ABC...]
            // 错误示范: ["secret_...] (带了引号)
            const cleanToken = notionToken.trim();
            console.log("Token check:", `[${cleanToken.substring(0, 10)}...]`, "Length:", cleanToken.length);

            // 额外检查：如果长度包含不正常的引号
            if (notionToken.includes('"') || notionToken.includes("'")) {
                console.warn("⚠️ 警告: Token 中似乎包含了引号，请去 Netlify 环境变量去掉引号！");
            }
        }
        // --- 🔍 调试代码结束 ---

        // 1. 基础检查
        if (!databaseId) {
            return { statusCode: 500, body: JSON.stringify({ error: "Missing NOTION_DB_ID" }) };
        }
        if (!notionToken) {
            return { statusCode: 500, body: JSON.stringify({ error: "Missing NOTION_TOKEN" }) };
        }

        // 2. 计算日期范围
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

        // 3. 定义 Notion 中的字段名 (请确保和 Notion 数据库一致)
        const PROP_ADDED = "Added Date";
        const PROP_REVIEWED = "Last Reviewed";
        const PROP_QUIZ = "Last Quiz";

        // 4. 从 Notion 获取数据
        // 目前只筛选 Added Date 范围内的数据，如果 Review/Quiz 日期和 Added 日期跨度很大，可能需要放宽筛选条件
        // 但为了性能，暂时先这样写
        const pages = await queryAll(databaseId, notionToken, {
            property: PROP_ADDED,
            date: { on_or_after: fromISO, before: toISO },
        });

        // 5. 统计数据
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

        // 6. 生成最终数组
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

        // 7. 成功返回 (Status 200)
        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-store",
                // 如果涉及跨域，可能需要加 Access-Control-Allow-Origin
                // "Access-Control-Allow-Origin": "*" 
            },
            body: JSON.stringify(out),
        };

    } catch (err) {
        // 8. 错误捕获 (Status 500)
        console.error("❌ Function Crashed:", err);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: "getHeatmap failed",
                message: err && err.message ? err.message : String(err),
            }),
        };
    }
};