// Sends a new booking to your Telegram chat.
// Needs TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID. Without them it only logs to the console.
const esc = (s) => String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

const hourLabel = (h) => (h === 12 ? "12pm" : h > 12 ? (h - 12) + "pm" : h + "am");

function longDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", timeZone: "UTC"
  });
}

function bookingText(b) {
  const lines = [
    `<b>DIY Guy booking ${esc(b.ref)}</b>`,
    `${esc(b.service_name)}, ${b.hours} hour${b.hours > 1 ? "s" : ""} (£${b.price})`,
    `${esc(longDate(b.date))}, ${hourLabel(b.start)} to ${hourLabel(b.start + b.hours)}`,
    "",
    esc(b.name),
    esc(b.phone),
    b.email ? esc(b.email) : null,
    `${esc(b.address)}, ${esc(b.postcode)}`,
    b.notes ? `\nNotes: ${esc(b.notes)}` : null
  ];
  return lines.filter((l) => l !== null).join("\n");
}

async function notify(booking) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  const text = bookingText(booking);
  if (!token || !chat) {
    console.log("[telegram not set up] would send:\n" + text);
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) {
      console.error("Telegram error", res.status, (await res.text()).slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.error("Telegram failed:", e.message);
    return false;
  }
}

module.exports = { notify, bookingText, hourLabel };
