// Finds your Telegram chat ID.
// 1. Open your new bot in Telegram and send it any message (for example "hi").
// 2. Run:  TELEGRAM_BOT_TOKEN=your-token node scripts/telegram-chat-id.js
// On Windows PowerShell:  $env:TELEGRAM_BOT_TOKEN="your-token"; node scripts/telegram-chat-id.js
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) { console.error("Set TELEGRAM_BOT_TOKEN first (see the comments at the top of this file)."); process.exit(1); }
fetch(`https://api.telegram.org/bot${token}/getUpdates`)
  .then((r) => r.json())
  .then((j) => {
    if (!j.ok) { console.error("Telegram said:", j.description); process.exit(1); }
    const chats = new Map();
    for (const u of j.result) { const c = (u.message || u.my_chat_member || {}).chat; if (c) chats.set(c.id, c.first_name || c.title || c.username || ""); }
    if (!chats.size) { console.log("No messages found. Send your bot a message in Telegram, then run this again."); return; }
    for (const [id, name] of chats) console.log(`TELEGRAM_CHAT_ID=${id}   (${name})`);
  })
  .catch((e) => { console.error("Could not reach Telegram:", e.message); process.exit(1); });
