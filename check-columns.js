// check-columns.js
// ⚠️ 请填入你刚才验证成功的 Token 和 ID
const MY_TOKEN = "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";
const MY_DB_ID = "2e0c457ec2fc8025b780c32745c14a10";

async function check() {
    console.log("🔍 正在读取数据库的第一条数据...");

    try {
        const response = await fetch(`https://api.notion.com/v1/databases/${MY_DB_ID}/query`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${MY_TOKEN}`,
                "Notion-Version": "2022-06-28",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ page_size: 1 }) // 我们只看第1条，看表头结构
        });

        const data = await response.json();

        if (data.results && data.results.length > 0) {
            const props = data.results[0].properties;
            console.log("\n✅ 连接成功！这是你 Notion 表格里所有的列名：");
            console.log("------------------------------------------------");

            // 打印所有列名和类型
            Object.keys(props).forEach(key => {
                const type = props[key].type;
                console.log(`名字: [${key}]  --->  类型: ${type}`);
            });
            console.log("------------------------------------------------");

            console.log("请检查：你的 heatmap 代码里写的是 'Added Date'，上面列表里有这个名字吗？一模一样吗？");

        } else {
            console.log("⚠️ 成功连上了，但是数据库是空的（没有数据行）。请先在 Notion 里随便加一条数据。");
        }
    } catch (error) {
        console.error("❌ 出错了:", error);
    }
}

check();