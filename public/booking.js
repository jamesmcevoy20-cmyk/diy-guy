(function () {
  var root = document.getElementById("bookcard");
  if (!root) return;
  var $ = function (s) { return document.querySelector(s); };
  var pad = function (n) { return String(n).padStart(2, "0"); };
  var fromIso = function (s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); };
  var isoOf = function (d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  var longDate = function (s) { return fromIso(s).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }); };
  var hourLabel = function (h) { return h === 12 ? "12pm" : h > 12 ? (h - 12) + "pm" : h + "am"; };
  var span = function (s, h, svcId) {
    var sv = data && svcById(svcId || state.svc);
    return sv && sv.arrive ? sv.arrive : hourLabel(s) + " to " + hourLabel(s + h);
  };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var PHONE = "info@diy-guy.co.uk";

  var data = null, fetchedAt = 0;
  var state = { step: 1, svc: null, hours: 1, date: null, start: null, busy: false };
  var svcById = function (id) { return data && data.services.filter(function (s) { return s.id === id; })[0]; };

  function load() {
    return fetch("/api/slots", { headers: { accept: "application/json" }, cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("slots"); return r.json(); })
      .then(function (j) {
        data = j; fetchedAt = Date.now();
        if (state.date && state.start != null && slotState(state.date, state.start, state.hours) !== "ok") state.start = null;
        $("#slotnote").textContent = "";
        renderSvcs(); renderTimes(); renderSummary();
      })
      .catch(function () { $("#slotnote").textContent = "Could not check availability. Please email " + PHONE + "."; });
  }

  function slotState(date, start, hours) {
    var r = data.rules;
    if (date === data.today) {
      var now = data.nowMinutes + Math.floor((Date.now() - fetchedAt) / 60000);
      if (start * 60 - now < r.minNoticeMinutes) return "past";
    }
    var clash = data.taken.some(function (t) { return t.date === date && t.start < start + hours && start < t.start + t.hours; });
    return clash ? "taken" : "ok";
  }

  function renderSteps() {
    var names = ["Service", "Time", "Details"];
    $("#steps").innerHTML = names.map(function (n, i) {
      var s = i + 1 < state.step ? "done" : i + 1 === state.step ? "now" : "";
      return '<li data-s="' + s + '"' + (s === "now" ? ' aria-current="step"' : "") + ">" + (i + 1) + ". " + n + "</li>";
    }).join("");
  }
  function show(step, scroll) {
    state.step = step;
    for (var i = 1; i <= 4; i++) $("#p" + i).hidden = i !== step;
    $("#steps").hidden = step === 4;
    renderSteps();
    if (scroll !== false) $("#bookcard").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderSvcs() {
    if (!data) return;
    $("#svcs").innerHTML = data.services.map(function (s) {
      return '<button type="button" class="svc' + (s.featured ? " feat" : "") + '" role="radio" data-id="' + esc(s.id) + '" aria-checked="' + (state.svc === s.id) + '">' +
        '<span class="n">' + esc(s.name) + '</span>' +
        (s.slots ? '<span class="p"><small>' + (s.arrive ? "One a day" : "Three a day, 2 hour slots") + '</small></span></button>' : '<span class="p">&pound;' + s.rate + "<small>per hour</small></span></button>");
    }).join("");
    $("#n1").disabled = !state.svc;
  }
  $("#svcs").addEventListener("click", function (e) {
    var b = e.target.closest(".svc"); if (!b) return;
    state.svc = b.dataset.id; state.start = null; renderSvcs(); renderSummary();
  });

  function range(a, b) { var o = []; for (var i = a; i <= b; i++) o.push(i); return o; }

  function renderTimes() {
    if (!data) return;
    var r = data.rules;
    var cur = state.svc && svcById(state.svc), fixed = cur && cur.slots;
    if (fixed) state.hours = fixed[0][1];
    else if (r.durations.indexOf(state.hours) < 0) state.hours = 1;
    $("#lens").style.display = fixed ? "none" : ""; $("#ll").style.display = fixed ? "none" : "";
    var starts = fixed ? fixed.map(function (x) { return x[0]; }) : null;
    $("#lens").innerHTML = r.durations.map(function (h) {
      return '<button type="button" class="len" role="radio" data-h="' + h + '" aria-checked="' + (state.hours === h) + '">' + h + (h > 1 ? " hours" : " hour") + "</button>";
    }).join("");
    var days = [], base = fromIso(data.today);
    for (var i = 0; i < r.daysAhead; i++) {
      var d = new Date(base); d.setDate(base.getDate() + i);
      if (r.openDays.indexOf(d.getDay()) >= 0 && data.closed.indexOf(isoOf(d)) < 0) days.push({ d: d, i: i });
    }
    $("#dates").innerHTML = days.map(function (x) {
      var k = isoOf(x.d), full = true;
      var cand = starts || range(r.openHour, r.closeHour - state.hours);
      for (var c = 0; c < cand.length; c++) if (slotState(k, cand[c], state.hours) === "ok") { full = false; break; }
      var dow = x.i === 0 ? "Today" : x.i === 1 ? "Tmrw" : x.d.toLocaleDateString("en-GB", { weekday: "short" });
      return '<button type="button" class="day" role="radio" data-d="' + k + '" aria-checked="' + (state.date === k) + '"' + (full ? " disabled" : "") + ">" +
        '<span class="dow">' + dow + '</span><span class="dn">' + x.d.getDate() + '</span><span class="mo">' +
        (full ? "Full" : x.d.toLocaleDateString("en-GB", { month: "short" })) + "</span></button>";
    }).join("");
    var box = $("#times");
    if (!state.date) box.innerHTML = '<p class="note" style="grid-column:1/-1;margin:0">Pick a day to see the free times.</p>';
    else {
      var out = "";
      var cand2 = starts || range(r.openHour, r.closeHour - state.hours);
      for (var ci = 0; ci < cand2.length; ci++) {
        var s2 = cand2[ci];
        var st = slotState(state.date, s2, state.hours);
        out += '<button type="button" class="win" role="radio" data-s="' + s2 + '" aria-checked="' + (state.start === s2) + '"' + (st !== "ok" ? " disabled" : "") + ">" +
          span(s2, state.hours) + "<small>" + (st === "taken" ? "Booked" : st === "past" ? "Too soon" : "Free") + "</small></button>";
      }
      box.innerHTML = out;
    }
    $("#n2").disabled = !(state.date && state.start != null);
  }
  $("#lens").addEventListener("click", function (e) {
    var b = e.target.closest(".len"); if (!b) return;
    state.hours = Number(b.dataset.h);
    if (state.date && state.start != null && slotState(state.date, state.start, state.hours) !== "ok") state.start = null;
    renderTimes(); renderSummary();
  });
  $("#dates").addEventListener("click", function (e) {
    var b = e.target.closest(".day"); if (!b || b.disabled) return;
    state.date = b.dataset.d;
    if (state.start != null && slotState(state.date, state.start, state.hours) !== "ok") state.start = null;
    renderTimes(); renderSummary();
  });
  $("#times").addEventListener("click", function (e) {
    var b = e.target.closest(".win"); if (!b || b.disabled) return;
    state.start = Number(b.dataset.s); renderTimes(); renderSummary();
  });

  function setDd(sel, text) { var el = $(sel); el.textContent = text || "Not chosen yet"; el.className = text ? "" : "empty"; }
  function renderSummary() {
    var s = state.svc && data ? svcById(state.svc) : null;
    setDd("#s-job", s && (s.arrive ? s.name : s.name + ", " + state.hours + (state.hours > 1 ? " hours" : " hour")));
    setDd("#s-date", state.date && longDate(state.date));
    setDd("#s-win", state.start != null && span(state.start, state.hours));
    $("#s-price").innerHTML = s && s.slots ? "No charge to book<small>Price agreed on the day</small>" :
      (s ? "&pound;" + s.rate * state.hours : "&pound;&ndash;") + "<small>Estimated cost</small>";
  }

  function validate() {
    var v = function (id) { return $(id).value.trim(); }, e = {};
    if (v("#f-name").length < 2) e.name = "Enter your full name.";
    var digits = v("#f-phone").replace(/[^\d]/g, "");
    if (digits.length < 10 || digits.length > 13) e.phone = "Enter a phone number I can reach you on, such as 07700 900123.";
    if (v("#f-email") && !/^\S+@\S+\.\S+$/.test(v("#f-email"))) e.email = "That email address looks incomplete.";
    if (v("#f-addr").length < 5) e.addr = "Enter the house number and street.";
    if (!/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(v("#f-pc"))) e.pc = "Enter a full UK postcode, such as HP10 9AH.";
    return e;
  }
  function showErrors(e) {
    ["name", "phone", "email", "addr", "pc"].forEach(function (k) {
      $("#e-" + k).textContent = e[k] || "";
      var inp = $("#f-" + k); if (e[k]) inp.setAttribute("aria-invalid", "true"); else inp.removeAttribute("aria-invalid");
    });
  }
  function note(msg) { var m = $("#submsg"); m.textContent = msg || ""; m.hidden = !msg; }

  $("#form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (state.busy) return;
    var errs = validate(); showErrors(errs); note("");
    var first = Object.keys(errs)[0];
    if (first) { $("#f-" + first).focus(); return; }
    state.busy = true; $("#n3").disabled = true; $("#n3").textContent = "Booking";
    var payload = {
      service: state.svc, hours: state.hours, date: state.date, start: state.start,
      name: $("#f-name").value.trim(), phone: $("#f-phone").value.trim(), email: $("#f-email").value.trim(),
      address: $("#f-addr").value.trim(), postcode: $("#f-pc").value.trim(), notes: $("#f-notes").value.trim(), website: $("#f-web").value
    };
    var reset = function () { state.busy = false; $("#n3").disabled = false; $("#n3").textContent = "Confirm booking"; };
    fetch("/api/bookings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j }; }); })
      .then(function (res) {
        reset();
        if (res.status === 201) return finish(res.body.booking);
        if (res.status === 409) { state.start = null; load().then(function () { show(2); $("#slotnote").textContent = "That time was just taken. Pick another."; }); return; }
        if (res.status === 400 && res.body.fields) {
          showErrors(res.body.fields); note(res.body.error || "Check the highlighted fields.");
          if (res.body.fields.date || res.body.fields.start || res.body.fields.hours || res.body.fields.service) load().then(function () { show(2); });
          return;
        }
        if (res.status === 429) { note("Too many attempts. Please wait a few minutes or email " + PHONE + "."); return; }
        note("I could not save your booking. Try again, or email " + PHONE + ".");
      })
      .catch(function () { reset(); note("Could not reach the server. Check your connection, or email " + PHONE + "."); });
  });

  function finish(b) {
    $("#p4").innerHTML =
      '<span class="okbadge">Booked</span><div class="ref">' + esc(b.ref) + "</div><h3>You are booked in</h3>" +
      '<p class="lead">Keep your reference. I will phone ' + esc(b.phone) + " if anything about the visit changes.</p>" +
      '<ul class="recap"><li><b>Service</b><span>' + esc(b.service_name) + (b.win_label && b.service === "install" ? "" : ", " + b.hours + (b.hours > 1 ? " hours" : " hour")) + "</span></li>" +
      "<li><b>When</b><span>" + esc(longDate(b.date)) + ", " + esc(span(b.start, b.hours, b.service)) + "</span></li>" +
      "<li><b>Where</b><span>" + esc(b.address) + ", " + esc(b.postcode) + "</span></li>" +
      (b.price ? "<li><b>Cost</b><span>&pound;" + esc(b.price) + "</span></li>" : "") + "</ul>" +
      '<div class="actions"><span></span><button class="btn ghost" id="again" type="button">Book another job</button></div>';
    show(4);
    $("#again").addEventListener("click", function () {
      state.svc = null; state.date = null; state.start = null; state.hours = 1;
      $("#form").reset(); showErrors({}); note("");
      load().then(function () { show(1); });
    });
  }

  $("#n1").addEventListener("click", function () { load().then(function () { show(2); }); });
  $("#b2").addEventListener("click", function () { show(1); });
  $("#n2").addEventListener("click", function () { show(3); });
  $("#b3").addEventListener("click", function () { show(2); });
  setInterval(function () { if (!document.hidden && state.step === 2) load(); }, 30000);

  // "Book Now" buttons in the price list pick the service and jump to the time step.
  document.querySelectorAll("[data-service]").forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      state.svc = a.getAttribute("data-service"); state.start = null;
      load().then(function () { renderSummary(); show(2); });
    });
  });

  renderSteps(); show(1, false); load();
})();
