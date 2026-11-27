// Sends a new booking to the Job Log app as a "Booked" job.
// Needs JOB_LOG_URL (e.g. https://your-job-log.onrender.com) and INTAKE_KEY (same key as set on Job Log).
// Without them it just logs to the console and the booking carries on as normal.
const { hourLabel } = require("./telegram");

function jobFromBooking(b) {
  const when = b.win_label || `${hourLabel(b.start)} to ${hourLabel(b.start + b.hours)}`;
  const notes = [
    `DIY Guy booking ${b.ref}`,
    `Time: ${when}`,
    b.price ? `Price: £${b.price}` : null,
    b.notes ? `Customer notes: ${b.notes}` : null
  ].filter(Boolean).join("\n");
  return {
    customer: b.name,
    phone: b.phone,
    email: b.email || "",
    address: [b.address, b.postcode].filter(Boolean).join(", "),
    title: b.service_name,
    notes,
    status: "Booked",
    date: b.date,
    source: "DIY Guy",
    ref: b.ref
  };
}

async function send(booking) {
  const base = (process.env.JOB_LOG_URL || "").replace(/\/+$/, "");
  const key = process.env.INTAKE_KEY;
  if (!base || !key) {
    console.log("[job log not set up] would send booking " + booking.ref);
    return false;
  }
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(base + "/api/intake", {
        method: "POST",
        headers: { "content-type": "application/json", "x-intake-key": key },
        body: JSON.stringify(jobFromBooking(booking)),
        signal: AbortSignal.timeout(10000)
      });
      if (res.ok) return true;
      console.error("Job Log error", res.status, (await res.text()).slice(0, 200));
      if (res.status < 500) return false; // bad key / bad data: retrying won't help
    } catch (e) {
      console.error("Job Log failed:", e.message);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}

module.exports = { send, jobFromBooking };
