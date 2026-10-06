const categories = require("../categories.json");

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const LIST_KEY = "shopping:list";
const REMOVED_DEFAULTS_KEY = "shopping:removed_defaults";
const DEFAULT_ITEMS = ["חלב", "ביצים", "מלפפונים", "עגבניות"];

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

async function loadRemovedDefaults() {
  const raw = await redisCommand("get", REMOVED_DEFAULTS_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function saveRemovedDefaults(arr) {
  await redisCommand("set", REMOVED_DEFAULTS_KEY, JSON.stringify(arr));
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

function matchesDefault(text) {
  const norm = normalizeHebrew(text.toLowerCase());
  return DEFAULT_ITEMS.find((d) => {
    const nd = normalizeHebrew(d.toLowerCase());
    return norm === nd || norm.includes(nd) || nd.includes(norm);
  });
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
        const removedDefaults = await loadRemovedDefaults();
        const activeDefaults = DEFAULT_ITEMS.filter((d) => !removedDefaults.includes(d));
        const fullList = [...activeDefaults, ...items];
        if (fullList.length === 0) {
          replyText = "הרשימה ריקה כרגע. שלח לי מוצרים ואז בקש *תצוגה* או *סיכום*.";
        } else {
          replyText = "👀 *תצוגת הרשימה הנוכחית:*\n\n" + buildSummary(fullList);
        }
      } else if (bodyRaw === "סיכום") {
        const items = await loadList();
        const removedDefaults = await loadRemovedDefaults();
        const activeDefaults = DEFAULT_ITEMS.filter((d) => !removedDefaults.includes(d));
        const fullList = [...activeDefaults, ...items];
        if (fullList.length === 0) {
          replyText = "הרשימה ריקה כרגע. שלח לי מוצרים ואז בקש שוב *סיכום*.";
        } else {
          replyText = "📝 *רשימת קניות מסודרת:*\n\n" + buildSummary(fullList);
          await saveList([]);
          await saveRemovedDefaults([]);
          replyText += "\n\n✅ הרשימה אופסה (מוצרי הקבע חזרו). אפשר להתחיל רשימה חדשה.";
        }
      } else if (bodyRaw === "איפוס" || bodyRaw === "נקה") {
        await saveList([]);
        await saveRemovedDefaults([]);
        replyText = "🗑️ הרשימה אופסה ידנית (מוצרי הקבע חזרו).";
      } else if (bodyRaw.startsWith("תוריד ") || bodyRaw.startsWith("להוריד ")) {
        const prefixLen = bodyRaw.startsWith("להוריד ") ? 7 : 6;
        const toRemoveRaw = bodyRaw.slice(prefixLen).trim();
        const toRemoveLines = toRemoveRaw.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

        const removedDefaults = await loadRemovedDefaults();
        const items = await loadList();
        const removed = [];
        const remaining = [];
        const remainingToMatch = [];

        for (const line of toRemoveLines) {
          const def = matchesDefault(line);
          if (def) {
            if (!removedDefaults.includes(def)) removedDefaults.push(def);
            removed.push(def);
          } else {
            remainingToMatch.push(normalizeHebrew(line.toLowerCase()));
          }
        }

        for (const item of items) {
          const normItem = normalizeHebrew(item.toLowerCase());
          const match = remainingToMatch.some((t) => normItem === t || normItem.includes(t) || t.includes(normItem));
          if (match) {
            removed.push(item);
          } else {
            remaining.push(item);
          }
        }

        await saveRemovedDefaults(removedDefaults);
        await saveList(remaining);

        if (removed.length === 0) {
          replyText = "לא מצאתי ברשימה מוצר שתואם למה שציינת.";
        } else {
          const activeDefaults = DEFAULT_ITEMS.filter((d) => !removedDefaults.includes(d));
          const total = remaining.length + activeDefaults.length;
          replyText = `🗑️ הוסר/ו: ${removed.join(", ")} (נשארו ${total} מוצרים ברשימה)`;
        }
      } else {
        const lines = bodyRaw.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
        const removedDefaults = await loadRemovedDefaults();
        const addedRegular = [];
        const reactivated = [];
        const alreadyThere = [];

        for (const line of lines) {
          const def = matchesDefault(line);
          if (def) {
            const idx = removedDefaults.indexOf(def);
            if (idx !== -1) {
              removedDefaults.splice(idx, 1);
              reactivated.push(def);
            } else {
              alreadyThere.push(def);
            }
          } else {
            await addItem(line);
            addedRegular.push(line);
          }
        }
        await saveRemovedDefaults(removedDefaults);

        const items = await loadList();
        const activeDefaults = DEFAULT_ITEMS.filter((d) => !removedDefaults.includes(d));
        const total = items.length + activeDefaults.length;

        const parts = [];
        if (addedRegular.length > 0) parts.push(`נוסף: ${addedRegular.join(", ")}`);
        if (reactivated.length > 0) parts.push(`הוחזר לרשימה: ${reactivated.join(", ")}`);
        if (alreadyThere.length > 0) parts.push(`כבר ברשימה: ${alreadyThere.join(", ")}`);

        replyText = `✅ ${parts.join(" | ")} (סה"כ ${total} מוצרים ברשימה)`;
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
