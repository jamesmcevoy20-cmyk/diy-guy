(function () {
  var form = document.getElementById("booking-form");
  if (!form) return;
  var $ = function (id) { return document.getElementById(id); };
  var data = null, chosenStart = null;

  var hourLabel = function (h) { return h === 12 ? "12pm" : h > 12 ? (h - 12) + "pm" : h + "am"; };
  var addDays = function (iso, n) { var p = iso.split("-").map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10); };
  var dow = function (iso) { var p = iso.split("-").map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay(); };
  var longDate = function (iso) { var p = iso.split("-").map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }); };
  var shortDate = function (iso) { var p = iso.split("-").map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }); };

  function hours() { var r = form.querySelector('input[name="hours"]:checked'); return r ? Number(r.value) : 1; }
  function service() { return $("service").value; }

  function buildDates() {
    var sel = $("date"), keep = sel.value;
    sel.innerHTML = "";
    for (var i = 0; i < data.rules.daysAhead; i++) {
      var d = addDays(data.today, i);
      if (data.rules.openDays.indexOf(dow(d)) < 0 || data.closed.indexOf(d) >= 0) continue;
      var o = document.createElement("option");
      o.value = d; o.textContent = shortDate(d);
      sel.appendChild(o);
    }
    if (keep) sel.value = keep;
  }

  function buildTimes() {
    var box = $("times"), date = $("date").value, h = hours();
    box.innerHTML = "";
    chosenStart = null;
    if (!date) return;
    var any = false;
    for (var s = data.rules.openHour; s + h <= data.rules.closeHour; s++) {
      var blocked = data.taken.some(function (t) { return t.date === date && t.start < s + h && s < t.start + t.hours; });
      if (date === data.today && s * 60 - data.nowMinutes < data.rules.minNoticeMinutes) blocked = true;
      var b = document.createElement("button");
      b.type = "button"; b.className = "time"; b.dataset.start = s;
      b.textContent = hourLabel(s) + " to " + hourLabel(s + h);
      b.disabled = blocked;
      if (!blocked) any = true;
      box.appendChild(b);
    }
    if (!any) box.innerHTML = '<p class="note">No free times that day. Try another date or call ' + $("phone-display").textContent + '.</p>';
    updatePrice();
  }

  function updatePrice() {
    var svc = data.services.filter(function (s) { return s.id === service(); })[0];
    $("price").textContent = svc ? "Estimated cost: £" + (svc.rate * hours()) + " (£" + svc.rate + " per hour)" : "";
  }

  function load() {
    return fetch("/api/slots", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
      data = d;
      if (!$("service").options.length) {
        d.services.forEach(function (s) {
          var o = document.createElement("option"); o.value = s.id; o.textContent = s.name + " (£" + s.rate + " per hour)";
          $("service").appendChild(o);
        });
      }
      buildDates(); buildTimes();
    }).catch(function () {
      $("times").innerHTML = '<p class="note">Could not load times. Please call ' + $("phone-display").textContent + '.</p>';
    });
  }

  // "Book Now" buttons in the price list pick the service and jump to the form.
  document.querySelectorAll("[data-service]").forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      if ($("service").options.length) $("service").value = a.getAttribute("data-service");
      if (data) updatePrice();
      $("booking").scrollIntoView({ behavior: "smooth" });
    });
  });

  $("service").addEventListener("change", updatePrice);
  $("date").addEventListener("change", buildTimes);
  form.querySelectorAll('input[name="hours"]').forEach(function (r) { r.addEventListener("change", buildTimes); });
  $("times").addEventListener("click", function (e) {
    var b = e.target.closest("button.time");
    if (!b || b.disabled) return;
    chosenStart = Number(b.dataset.start);
    $("times").querySelectorAll("button.time").forEach(function (x) { x.classList.toggle("on", x === b); });
  });

  function showErrors(fields) {
    form.querySelectorAll(".err").forEach(function (e) { e.textContent = ""; });
    Object.keys(fields || {}).forEach(function (k) { var e = $("err-" + k); if (e) e.textContent = fields[k]; });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var msg = $("form-msg"); msg.textContent = "";
    showErrors({});
    if (chosenStart == null) { showErrors({ start: "Choose a start time." }); return; }
    var btn = form.querySelector('button[type="submit"]'); btn.disabled = true;
    var body = {
      service: service(), hours: hours(), date: $("date").value, start: chosenStart,
      name: $("name").value, phone: $("phone").value, email: $("email").value,
      address: $("addr").value, postcode: $("pc").value, notes: $("notes").value, website: $("website").value
    };
    fetch("/api/bookings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); })
      .then(function (r) {
        btn.disabled = false;
        if (r.ok) {
          var b = r.j.booking;
          form.hidden = true;
          var done = $("done");
          done.hidden = false;
          done.innerHTML = "<h3>Thank you, you are booked in</h3><p>Reference <strong>" + b.ref + "</strong></p><p>" +
            longDate(b.date) + ", " + hourLabel(b.start) + " to " + hourLabel(b.start + b.hours) + "</p><p>I will be in touch to confirm. Need to change anything? Call " + $("phone-display").textContent + ".</p>";
          done.scrollIntoView({ behavior: "smooth" });
          return;
        }
        if (r.j.fields) showErrors(r.j.fields);
        msg.textContent = r.j.error || "Something went wrong. Please call " + $("phone-display").textContent + ".";
        if (r.status === 409) load();
      })
      .catch(function () { btn.disabled = false; msg.textContent = "Could not send. Please call " + $("phone-display").textContent + "."; });
  });

  load();
})();
