// Apply saved interface preferences before first paint (J1). Loaded synchronously in <head>.
(function () {
  try {
    var p = JSON.parse(localStorage.getItem("bid.interface") || "null");
    if (!p) return;
    var r = document.documentElement;
    r.dataset.font = p.font || "system";
    r.dataset.contrast = p.contrast || "standard";
    r.dataset.reduceMotion = String(!!p.reduceMotion);
    r.style.setProperty("--text-scale", String(p.textScale || 1));
    r.style.setProperty("--line-height", String(p.lineHeight || 1.5));
    r.style.setProperty("--letter-spacing", (p.letterSpacing || 0) + "em");
    r.style.setProperty("--word-spacing", (p.wordSpacing || 0) + "em");
  } catch {
    /* storage blocked: defaults apply */
  }
})();
