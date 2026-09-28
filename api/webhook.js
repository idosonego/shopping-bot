// api/webhook.js
// בוט "קניות" לוואטסאפ - גרסת Meta WhatsApp Cloud API + Vercel
//
// רץ *רק* כשמגיעה הודעה (סרברלס) - אין תהליך שצריך להישאר דלוק כל הזמן.
// אחסון הרשימה: Upstash Redis (שירות חינמי, נגיש דרך REST פשוט - מתאים
// לסביבה סרברלס כי אין דיסק קבוע בין קריאות).
//
// משתני סביבה נדרשים (מוגדרים ב-Vercel -> Settings -> Environment Variables):
// - VERIFY_TOKEN            : מחרוזת שרירותית שאתה בוחר, לאימות הוובהוק מול מטא
// - WHATSAPP_TOKEN          : טוקן הגישה מ-Meta for Developers
// - WHATSAPP_PHONE_NUMBER_ID: מזהה מספר הטלפון של ה-WhatsApp Business שלך
// - UPSTASH_REDIS_REST_URL  : מ-Upstash
// - UPSTASH_REDIS_REST_TOKEN: מ-Upstash

const categories = require("../categories.json");

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const LIST_KEY = "shopping:list"; // מפתח יחיד - רשימה אחת (משתמש יחיד)

// ---------- עזרי Redis (Upstash REST API) ----------
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

async function resetList() {
  await saveList([]);
}

// ---------- שיוך מוצר לקטגוריה ----------
function categoryIndexForItem(itemText) {
  const lower = itemText.toLowerCase();
  for (let i = 0; i < categories.length; i++) {
    for (const kw of categories[i].keywords) {
      if (lower.includes(kw.toLowerCase())) return i;
    }
  }
  return categories.length - 1; // "שונות"
}

function buildSummary(items) {
  const buckets = categories.map(() => []);
  for (const item of items) buckets[categoryIndexForItem(item)].push(item);
  let lines = [];
  for (let i = 0; i < categories.length; i++) {
    if (buckets[i].length === 0) continue;
    lines.push(`*${categories[i].name}*`);
    for (const item of buckets[i]) lines.push(`▫️ ${item}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}

// ---------- שליחת הודעת וואטסאפ דרך Meta Graph API ----------
async function sendWhatsAppMessage(toPhone, text) {
  const url = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
     const resp = await fetch(url, {
          console.log("Graph API:", resp.status, await resp.text());
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
}

// ---------- ה-handler הראשי (Vercel) ----------
module.exports = async (req, res) => {
  // --- שלב אימות הוובהוק (Meta שולח GET פעם אחת בהגדרה) ---
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

  // --- הודעות נכנסות ---
  if (req.method === "POST") {
    try {
      const entry = req.body?.entry?.[0];
      const change = entry?.changes?.[0];
      const message = change?.value?.messages?.[0];

      if (!message || message.type !== "text") {
        res.status(200).send("ok"); // אין מה לעבד (סטטוס-דלוור וכו')
        return;
      }

      const fromPhone = message.from; // מספר השולח, בפורמט בינלאומי בלי +
      const bodyRaw = message.text.body.trim();

      let replyText;

      if (bodyRaw === "סיכום") {
        const items = await loadList();
        if (items.length === 0) {
          replyText = "הרשימה ריקה כרגע. שלח לי מוצרים ואז בקש שוב *סיכום*.";
        } else {
          replyText = "📝 *רשימת קניות מסודרת:*\n\n" + buildSummary(items);
          await resetList();
          replyText += "\n\n✅ הרשימה אופסה. אפשר להתחיל רשימה חדשה.";
        }
      } else if (bodyRaw === "איפוס" || bodyRaw === "נקה") {
        await resetList();
        replyText = "🗑️ הרשימה אופסה ידנית.";
      } else {
        const count = await addItem(bodyRaw);
        replyText = `✅ נוסף: ${bodyRaw} (סה"כ ${count} מוצרים ברשימה)`;
      }

      await sendWhatsAppMessage(fromPhone, replyText);
      res.status(200).send("ok");
    } catch (err) {
      console.error(err);
      res.status(200).send("ok"); // תמיד 200 כדי
    }
    return;
  }

  res.status(405).send("Method Not Allowed");
};
