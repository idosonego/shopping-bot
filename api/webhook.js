const categories = require("../categories.json");

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const LIST_KEY = "shopping:list";

async function redisCommand(...args) {
  const res = await fetch(`${REDIS_URL}/${args.map(encodeURIComponent).join("/")}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  const data = await res.json();
  return data.result;
}

async function loadList() {
  const raw = await redisCommand("get", LIST_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function saveList(items) {
  await redisCommand("set", LIST_KEY, JSON.stringify(items));
}

async function addItem(text) {
  const items = await loadList();
  items.push(text.trim());
  await saveList(items);
  return items.length;
}

function normalizeHebrew(str) {
  return str
    .replace(/ן/g, "נ")
    .replace(/ם/g, "מ")
    .replace(/ץ/g, "צ")
    .replace(/ף/g, "פ")
    .replace(/ך/g, "כ");
}

function categoryIndexForItem(itemText) {
  const lower = normalizeHebrew(itemText.toLowerCase());
  for (let i = 0; i < categories.length; i++) {
    for (const kw of categories[i].keywords) {
      if (lower.includes(normalizeHebrew(kw.toLowerCase()))) return i;
    }
  }
  return categories.length - 1;
}

function buildSummary(items) {
  const buckets = categories.map(() => []);
  for (const item of items) buckets[categoryIndexForItem(item)].push(item);
  const lines = [];
  for (let i = 0; i < categories.length; i++) {
    if (buckets[i].length === 0) continue;
    lines.push(`*${categories[i].name}*`);
    for (const item of buckets[i]) lines.push(`▫️ ${item}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}

async function sendWhatsAppMessage(toPhone, text) {
  const url = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toPhone,
      text: { body: text },
    }),
  });
  console.log("Graph API:", resp.status, await resp.text());
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
      res.status(200).send(challenge);
    } else {
      res.status(403).send("Forbidden");
    }
    return;
  }

  if (req.method === "POST") {
    try {
      const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      console.log("Incoming POST, has message:", !!message);

      if (!message || message.type !== "text") {
        res.status(200).send("ok");
        return;
      }

      const fromPhone = message.from;
      const bodyRaw = message.text.body.trim();
      let replyText;

      if (bodyRaw === "תצוגה") {
        const items = await loadList();
        if (items.length === 0) {
          replyText = "הרשימה ריקה כרגע. שלח לי מוצרים ואז בקש *תצוגה* או *סיכום*.";
        } else {
          replyText = "👀 *תצוגת הרשימה הנוכחית:*\n\n" + buildSummary(items);
        }
      } else if (bodyRaw === "סיכום") {
        const items = await loadList();
        if (items.length === 0) {
          replyText = "הרשימה ריקה כרגע. שלח לי מוצרים ואז בקש שוב *סיכום*.";
        } else {
          replyText = "📝 *רשימת קניות מסודרת:*\n\n" + buildSummary(items);
          await saveList([]);
          replyText += "\n\n✅ הרשימה אופסה. אפשר להתחיל רשימה חדשה.";
        }
      } else if (bodyRaw === "איפוס" || bodyRaw === "נקה") {
        await saveList([]);
        replyText = "🗑️ הרשימה אופסה ידנית.";
      } else {
        const lines = bodyRaw.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
        let total = 0;
        for (const line of lines) {
          total = await addItem(line);
        }
        if (lines.length === 1) {
          replyText = `✅ נוסף: ${lines[0]} (סה"כ ${total} מוצרים ברשימה)`;
        } else {
          replyText = `✅ נוספו ${lines.length} מוצרים: ${lines.join(", ")} (סה"כ ${total} מוצרים ברשימה)`;
        }
      }

      await sendWhatsAppMessage(fromPhone, replyText);
      res.status(200).send("ok");
    } catch (err) {
      console.error("Handler error:", err);
      res.status(200).send("ok");
    }
    return;
  }

  res.status(405).send("Method Not Allowed");
};
