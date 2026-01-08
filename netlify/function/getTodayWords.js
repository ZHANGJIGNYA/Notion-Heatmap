export async function handler() {
    const today = new Date().toISOString().split("T")[0];

    const res = await fetch(`https://api.notion.com/v1/databases/${process.env.NOTION_DB_ID}/query`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${process.env.NOTION_TOKEN}`,
            "Content-Type": "application/json",
            "Notion-Version": "2022-06-28"
        },
        body: JSON.stringify({
            filter: {
                property: "Added Date",
                date: { equals: today }
            }
        })
    });

    const data = await res.json();

    const words = data.results.map(p => {
        const title = p.properties &&
            p.properties.Name &&
            p.properties.Name.title &&
            p.properties.Name.title[0];

        return title && title.plain_text ? title.plain_text : "";
    });
    return {
        statusCode: 200,
        body: JSON.stringify(words)
    };
}