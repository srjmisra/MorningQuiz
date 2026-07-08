// Small minimum delay so the splash never flashes by instantly on a fast
// connection — a brief, intentional beat reads as premium, not slow.
function hideSplashScreen(minDelayMs) {
  const el = document.getElementById("splash-screen");
  if (!el) return;
  setTimeout(() => el.classList.add("hidden"), minDelayMs || 400);
}
