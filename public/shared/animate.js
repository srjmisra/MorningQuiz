// Animates a number counting up from 0 to target — purely cosmetic, no external deps.
function animateCounter(el, target, options) {
  const opts = options || {};
  const duration = opts.duration || 700;
  const suffix = opts.suffix || "";
  const startTime = performance.now();

  function tick(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(target * eased);
    el.textContent = value + suffix;
    if (progress < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}
