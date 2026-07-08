// Purely cosmetic client-side countdown ring — the server is authoritative on
// when a question actually ends (game:answersLocked). This just gives visual feedback.
function startCountdownRing(circleEl, textEl, seconds) {
  const radius = circleEl.r.baseVal.value;
  const circumference = 2 * Math.PI * radius;
  const ring = circleEl.closest(".timer-ring");

  circleEl.style.strokeDasharray = `${circumference}`;
  circleEl.style.transition = "none";
  circleEl.style.strokeDashoffset = "0";
  circleEl.classList.remove("is-urgent");
  if (ring) ring.classList.remove("is-urgent");
  if (textEl) textEl.textContent = seconds;

  // Force reflow so the transition below actually animates from 0.
  void circleEl.getBoundingClientRect();

  requestAnimationFrame(() => {
    circleEl.style.transition = `stroke-dashoffset ${seconds}s linear`;
    circleEl.style.strokeDashoffset = `${circumference}`;
  });

  const urgentThreshold = Math.min(5, Math.floor(seconds / 3));
  let remaining = seconds;
  const intervalId = setInterval(() => {
    remaining -= 1;
    if (textEl) textEl.textContent = Math.max(remaining, 0);
    if (remaining <= urgentThreshold && remaining >= 0) {
      circleEl.classList.add("is-urgent");
      if (ring) ring.classList.add("is-urgent");
    }
    if (remaining <= 0) clearInterval(intervalId);
  }, 1000);

  return intervalId;
}

function stopCountdownRing(circleEl, intervalId) {
  if (intervalId) clearInterval(intervalId);
  if (circleEl) circleEl.style.transition = "none";
}
