(function () {
  var active = null; // { frame, btn } for the video currently playing

  function stop() {
    if (!active) return;
    active.frame.replaceWith(active.btn); // back to the thumbnail, which stops the video
    active = null;
  }

  document.querySelectorAll(".vid-btn").forEach(function (b) {
    b.addEventListener("click", function () {
      stop(); // only one video plays at a time
      var f = document.createElement("iframe");
      f.src = "https://www.youtube-nocookie.com/embed/" + b.dataset.id + "?autoplay=1&rel=0";
      f.title = b.getAttribute("aria-label").replace("Play video: ", "");
      f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      f.allowFullscreen = true;
      f.className = "vid-frame";
      b.replaceWith(f);
      active = { frame: f, btn: b };
    });
  });
})();
