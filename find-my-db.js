// find-my-db.js
// ⚠️ 填入你的 Token
const MY_TOKEN = "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";

async function findDatabases() {
    console.log("🔍 正在搜索 Bot 能看到的所有数据库...");

    try {
        const response = await fetch("https://api.notion.com/v1/search", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${MY_TOKEN}`,
                "Notion-Version": "2022-06-28",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                filter: {
                    value: "database",
                    property: "object"
                }
            })
        });

        const data = await response.json();

        if (data.results && data.results.length > 0) {
            console.log(`\n✅ 找到了 ${data.results.length} 个数据库！`);
            console.log("请仔细核对下面的 ID 和标题：\n");

            data.results.forEach((db, index) => {
                const title = db.title && db.title.length > 0 ? db.title[0].plain_text : "[无标题]";
                const id = db.id.replace(/-/g, ""); // 去掉横杠，方便比较

                console.log(`${index + 1}. 数据库名: "${title}"`);
                console.log(`   ID: ${id}`);
                console.log(`   URL: ${db.url}`);
                console.log("------------------------------------------------");
            });

            console.log("\n👉 请看上面列出的 ID，和你 Netlify/代码里填的 ID 一样吗？");
        } else {
            console.log("❌ 搜索成功，但是结果为空！");
            console.log("这意味着：Token 是对的，但是这个 Bot 还没有被邀请进任何一个数据库页面。");
            console.log("请去 Notion 页面 -> 右上角 ... -> Connections -> Add connection -> 选你的 Bot。");
        }
    } catch (error) {
        console.error("❌ 搜索出错:", error);
    }
}

findDatabases();