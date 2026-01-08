exports.handler = async(event) => {
    try {
        const { word } = JSON.parse(event.body || "{}");
        if (!word) return { statusCode: 400, body: "Missing word" };

        const res = await fetch("https://api.notion.com/v1/pages", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
                "Content-Type": "application/json",
                "Notion-Version": "2022-06-28",
            },
            body: JSON.stringify({
                parent: { database_id: process.env.NOTION_DB_ID },
                properties: {
                    Name: { title: [{ text: { content: word } }] },
                    "Added Date": { date: { start: new Date().toISOString() } },
                },
            }),
        });

        const data = await res.json();
        if (!res.ok) return { statusCode: res.status, body: JSON.stringify(data) };

        return { statusCode: 200, body: JSON.stringify({ ok: true, id: data.id }) };
    } catch (err) {
        return { statusCode: 500, body: String(err && err.message ? err.message : err) };
    }
};