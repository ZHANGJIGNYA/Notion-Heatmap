// verify-fix-local.js

// 1. 👇 这里填你的 Token 和 ID
const MY_TOKEN = "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";
const MY_DB_ID = "2e0c457ec2fc8025b780c32745c14a10";

// 2. 修复后的日期读取函数 (老式写法，不使用 ?.)
function getDateProp(page, propName) {
    if (!page || !page.properties) return null;
    const p = page.properties[propName];
    if (!p) return null;

    // 情况 A: Date 类型
    if (p.type === "date" && p.date && p.date.start) {
        return String(p.date.start).slice(0, 10);
    }

    // 情况 B: Created Time 类型
    if (p.type === "created_time" && p.created_time) {
        return String(p.created_time).slice(0, 10);
    }

    // 情况 C: Last Edited Time 类型
    if (p.type === "last_edited_time" && p.last_edited_time) {
        return String(p.last_edited_time).slice(0, 10);
    }

    return null;
}

// 3. 模拟查询
async function runLocalTest() {
    console.log("🚀 开始本地验证...");

    try {
        const response = await fetch(`https://api.notion.com/v1/databases/${MY_DB_ID}/query`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${MY_TOKEN}`,
                "Notion-Version": "2022-06-28",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ page_size: 100 })
        });

        const data = await response.json();

        if (!response.ok) {
            console.log("❌ 请求失败:", data);
            return;
        }

        const results = data.results || [];
        console.log(`✅ 成功获取 ${results.length} 条数据！`);
        console.log("---------------------------------------------------");

        let successCount = 0;
        let failCount = 0;

        results.forEach((page, index) => {
            // --- 这里改用了最原始的安全写法，绝对不会报错 ---
            let title = "无标题";
            if (page.properties["Name"] &&
                page.properties["Name"].title &&
                page.properties["Name"].title.length > 0) {
                title = page.properties["Name"].title[0].plain_text;
            }
            // ---------------------------------------------

            const extractedDate = getDateProp(page, "Added Date");

            if (extractedDate) {
                console.log(`[${index + 1}] 单词: "${title}" \t📅 日期: ${extractedDate}`);
                successCount++;
            } else {
                console.log(`[${index + 1}] 单词: "${title}" \t❌ 提取日期失败`);
                failCount++;
            }
        });

        console.log("---------------------------------------------------");
        console.log(`🎉 成功提取: ${successCount} 条`);

        if (successCount > 0) {
            console.log("\n🟢 验证通过！你的 'Added Date' (Created Time) 可以被读取了。");
        } else {
            console.log("\n🔴 依然没有读到日期，请检查 Notion 列名是否真的是 'Added Date'");
        }

    } catch (error) {
        console.error("❌ 运行出错:", error);
    }
}

runLocalTest();