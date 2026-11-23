(function () {
  var hourLabel = function (h) { return h === 12 ? "12pm" : h > 12 ? (h - 12) + "pm" : h + "am"; };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var longDate = function (iso) { var p = iso.split("-").map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }); };
  var state = { today: "", bookings: [], closed: [] };

  function api(method, url, body) {
    return fetch(url, { method: method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Failed"); return j; }); });
  }
  function render() {
    var all = document.getElementById("showAll").checked;
    var list = state.bookings.filter(function (b) { return all || (b.status !== "cancelled" && b.date >= state.today); });
    document.getElementById("rows").innerHTML = list.map(function (b) {
      var btns = ["confirmed", "done", "cancelled"].filter(function (s) { return s !== b.status; })
        .map(function (s) { return '<button data-ref="' + esc(b.ref) + '" data-status="' + s + '">' + s + "</button>"; }).join("");
      return '<tr class="' + esc(b.status) + '"><td>' + esc(longDate(b.date)) + "<br>" + hourLabel(b.start) + " to " + hourLabel(b.start + b.hours) +
        "</td><td>" + esc(b.service_name) + "<br>" + b.hours + "h, £" + b.price + "<br><small>" + esc(b.ref) + "</small></td><td>" +
        esc(b.name) + '<br><a href="tel:' + esc(b.phone) + '">' + esc(b.phone) + "</a>" + (b.email ? "<br>" + esc(b.email) : "") +
        "</td><td>" + esc(b.address) + ", " + esc(b.postcode) + (b.notes ? "<br><em>" + esc(b.notes) + "</em>" : "") +
        "</td><td>" + esc(b.status) + "</td><td>" + btns + "</td></tr>";
    }).join("") || '<tr><td colspan="6">No bookings yet.</td></tr>';
    document.getElementById("closedList").innerHTML = state.closed.filter(function (d) { return d >= state.today; })
      .map(function (d) { return esc(longDate(d)) + ' <button data-open="' + d + '">Open again</button>'; }).join("<br>") || "No days blocked.";
  }
  function load() { return api("GET", "/api/admin/bookings").then(function (j) { state = j; render(); }); }
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t.dataset && t.dataset.status) api("PATCH", "/api/admin/bookings/" + t.dataset.ref, { status: t.dataset.status }).then(load).catch(function (x) { alert(x.message); });
    if (t.dataset && t.dataset.open) api("DELETE", "/api/admin/closed/" + t.dataset.open).then(load);
    if (t.id === "closeBtn") { var d = document.getElementById("closeDate").value; if (d) api("POST", "/api/admin/closed", { date: d }).then(load); }
  });
  document.getElementById("showAll").addEventListener("change", render);
  load();
})();
