(function () {
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var hourLabel = function (h) { return h === 12 ? "12pm" : h > 12 ? (h - 12) + "pm" : h + "am"; };
  var winLabel = function (b) { return b.win_label || hourLabel(b.start) + " to " + hourLabel(b.start + b.hours); };
  var pad2 = function (n) { return String(n).padStart(2, "0"); };
  var STATUSES = ["new", "confirmed", "done", "cancelled"];
  var all = [], today = "", showAll = false, closedList = [], calMonth = "", calSel = "";

  function longDate(s) {
    var p = s.split("-");
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  }
  function jobLine(b) { return esc(b.service_name) + (b.price ? " &middot; &pound;" + esc(b.price) : ""); }
  function contact(b) {
    return '<div class="meta">' + esc(b.name) + ' &middot; <a href="tel:' + esc(b.phone.replace(/[^\d+]/g, "")) + '">' + esc(b.phone) + "</a>" + (b.email ? " &middot; " + esc(b.email) : "") + "</div>" +
      '<div class="meta">' + esc(b.address) + ", " + esc(b.postcode) + "</div>";
  }

  function render() {
    var rows = all.filter(function (b) { return showAll || (b.date >= today && b.status !== "cancelled" && b.status !== "done"); });
    $("#count").textContent = rows.length ? rows.length + (rows.length === 1 ? " booking" : " bookings") : "";
    if (!rows.length) {
      $("#list").innerHTML = '<div class="empty-state">' + (showAll ? "No bookings yet." : "No upcoming bookings. New ones appear here as customers book.") + "</div>";
      return;
    }
    $("#list").innerHTML = rows.map(function (b) {
      var btns = STATUSES.map(function (s) {
        return '<button type="button" class="chip" data-ref="' + esc(b.ref) + '" data-s="' + s + '" aria-pressed="' + (b.status === s) + '">' + s + "</button>";
      }).join("");
      return '<div class="job"><div class="job-top"><b>' + esc(b.ref) + '</b><span class="pill" data-s="' + esc(b.status) + '">' + esc(b.status) + "</span></div>" +
        "<div><strong>" + jobLine(b) + "</strong> &middot; " + esc(longDate(b.date)) + ", " + esc(winLabel(b)) + "</div>" +
        contact(b) + (b.notes ? '<div class="meta">Notes: ' + esc(b.notes) + "</div>" : "") +
        '<div class="statusbtns">' + btns + "</div></div>";
    }).join("");
  }

  /* month calendar */
  function jobHtml(b) {
    return '<div class="job"><div class="job-top"><b>' + esc(b.ref) + '</b><span class="pill" data-s="' + esc(b.status) + '">' + esc(b.status) + "</span></div>" +
      "<div><strong>" + jobLine(b) + "</strong> &middot; " + esc(winLabel(b)) + "</div>" + contact(b) + "</div>";
  }
  function renderCal() {
    if (!today) return;
    if (!calMonth) calMonth = today.slice(0, 7);
    var y = +calMonth.slice(0, 4), m = +calMonth.slice(5, 7);
    $("#cal-title").textContent = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
    $("#cal-dows").innerHTML = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(function (d) { return '<div class="cal-dow">' + d + "</div>"; }).join("");
    var live = {};
    all.forEach(function (b) { if (b.status !== "cancelled") (live[b.date] = live[b.date] || []).push(b); });
    var lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
    var dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    var cells = "";
    for (var i = 0; i < lead; i++) cells += '<div class="cal-day blank"></div>';
    for (var d = 1; d <= dim; d++) {
      var k = calMonth + "-" + pad2(d), dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      var off = closedList.indexOf(k) !== -1, n = (live[k] || []).length;
      cells += '<button type="button" class="cal-day' + (dow === 0 || dow === 6 ? " we" : "") + (k === today ? " today" : "") + (off ? " off" : "") + '" data-d="' + k + '" aria-pressed="' + (calSel === k) + '">' +
        '<span class="n">' + d + "</span>" + (off ? '<span class="o">Off</span>' : "") + (n ? '<span class="b">' + n + "</span>" : "") + "</button>";
    }
    $("#cal-grid").innerHTML = cells;
    var sel = calSel && calSel.slice(0, 7) === calMonth ? calSel : "";
    $("#cal-day").innerHTML = sel
      ? "<strong>" + esc(longDate(sel)) + (closedList.indexOf(sel) !== -1 ? " (day off)" : "") + "</strong>" +
        ((live[sel] || []).length ? live[sel].sort(function (a, b) { return a.start - b.start; }).map(jobHtml).join("") : '<div class="note">No bookings.</div>')
      : "";
  }
  function shiftMonth(delta) {
    var y = +calMonth.slice(0, 4), m = +calMonth.slice(5, 7) - 1 + delta;
    calMonth = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7); calSel = ""; renderCal();
  }
  $("#cal-prev").addEventListener("click", function () { shiftMonth(-1); });
  $("#cal-next").addEventListener("click", function () { shiftMonth(1); });
  $("#cal-grid").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-d]"); if (!b) return;
    calSel = calSel === b.dataset.d ? "" : b.dataset.d; renderCal();
  });

  /* days off */
  function renderClosed() {
    var sel = $("#c-date"), keep = sel.value, opts = '<option value="">Choose a day</option>';
    var t = new Date(today + "T12:00:00Z");
    for (var i = 0; i < 180; i++, t.setUTCDate(t.getUTCDate() + 1)) {
      var iso = t.toISOString().slice(0, 10), wd = t.getUTCDay();
      if (wd === 0 || wd === 6 || closedList.indexOf(iso) !== -1) continue;
      opts += '<option value="' + iso + '">' + esc(longDate(iso)) + "</option>";
    }
    sel.innerHTML = opts; sel.value = keep;
    var up = closedList.filter(function (d) { return d >= today; }).sort();
    $("#closed").innerHTML = up.length ? up.map(function (d) {
      return '<div class="job"><div class="job-top"><strong>' + esc(longDate(d)) + '</strong><button type="button" class="chip" data-open="' + esc(d) + '">Unblock</button></div></div>';
    }).join("") : '<div class="note">No days blocked.</div>';
  }

  function load() {
    return fetch("/api/admin/bookings", { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    }).then(function (j) {
      all = j.bookings.slice().sort(function (a, b) { return a.date.localeCompare(b.date) || a.start - b.start; });
      today = j.today; closedList = j.closed || [];
      render(); renderCal(); renderClosed();
    }).catch(function () { $("#count").textContent = "Could not load bookings. Refresh the page and sign in again."; });
  }

  $("#list").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-ref]"); if (!b) return;
    fetch("/api/admin/bookings/" + encodeURIComponent(b.dataset.ref), {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: b.dataset.s })
    }).then(function (r) {
      if (r.status === 409) { $("#count").textContent = "That time slot has since been booked by someone else, so this job cannot be un-cancelled."; return; }
      if (!r.ok) { $("#count").textContent = "Could not change the status. Try again."; return; }
      return load();
    });
  });
  $("#f-upcoming").addEventListener("click", function () { showAll = false; $("#f-upcoming").setAttribute("aria-pressed", "true"); $("#f-all").setAttribute("aria-pressed", "false"); render(); });
  $("#f-all").addEventListener("click", function () { showAll = true; $("#f-all").setAttribute("aria-pressed", "true"); $("#f-upcoming").setAttribute("aria-pressed", "false"); render(); });

  $("#c-add").addEventListener("click", function () {
    var d = $("#c-date").value; if (!d) { $("#c-date").focus(); return; }
    fetch("/api/admin/closed", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date: d }) })
      .then(function () { $("#c-date").value = ""; return load(); });
  });
  $("#closed").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-open]"); if (!b) return;
    fetch("/api/admin/closed/" + encodeURIComponent(b.dataset.open), { method: "DELETE" }).then(load);
  });

  load();
  setInterval(function () { if (!document.hidden) load(); }, 30000);
})();
