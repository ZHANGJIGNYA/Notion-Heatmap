// test-notion.js
// 这里直接填你的字符串，不要有空格
const MY_TOKEN = "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";
const MY_DB_ID = "2e0c457ec2fc8025b780c32745c14a10";

async function test() {
    console.log("正在尝试连接 Notion...");

    try {
        const response = await fetch(`https://api.notion.com/v1/databases/${MY_DB_ID}`, {
            method: "GET", // 我们只查数据库信息，不查内容，这样最快
            headers: {
                "Authorization": `Bearer ${MY_TOKEN}`,
                "Notion-Version": "2022-06-28"
            }
        });

        const data = await response.json();

        if (response.ok) {
            console.log("✅ 成功！Token 和 ID 都是对的！");
            let dbName = "未命名";
            if (data.title && data.title.length > 0) {
                dbName = data.title[0].plain_text;
            }
            console.log("数据库名字:", dbName);
        } else {
            console.log("❌ 失败！Notion 返回了错误：");
            console.log("Status:", response.status);
            console.log("Code:", data.code);
            console.log("Message:", data.message);
        }
    } catch (error) {
        console.error("❌ 代码运行出错:", error);
    }
}

test();