// Generic fallback "logo" shown wherever the teacher hasn't uploaded one —
// a plain gradient mark with a sparkle icon, built as a data URI so it can
// drop into the exact same <img> markup/sizing as an uploaded logo with no
// extra CSS or conditional markup anywhere it's used.
const DEFAULT_LOGO_DATA_URI =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#2563eb"/><stop offset="1" stop-color="#8b5cf6"/>' +
      "</linearGradient></defs>" +
      '<circle cx="50" cy="50" r="50" fill="url(#g)"/>' +
      '<g transform="translate(26,26) scale(2)" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/>' +
      '<path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>' +
      "</g></svg>"
  );

function brandLogoSrc(logoDataUri) {
  return logoDataUri || DEFAULT_LOGO_DATA_URI;
}

// Applied identically on both apps — same ids in both index.html files —
// so this one function drives the persistent corner chip everywhere.
// Safe to call with roomEvent === null (falls back to generic branding).
function applyBrandChip(roomEvent) {
  const titleEl = document.getElementById("brand-chip-title");
  const subEl = document.getElementById("brand-chip-subtitle");
  const logoEl = document.getElementById("brand-chip-logo");
  if (!titleEl) return;

  titleEl.textContent = (roomEvent && roomEvent.title) || "UniversalQuiz";
  subEl.textContent = (roomEvent && (roomEvent.organizer || roomEvent.subtitle)) || "Live Quiz";
  logoEl.src = brandLogoSrc(roomEvent && roomEvent.logoDataUri);
}

function updatePageTitle(roomEvent, appLabel) {
  document.title = roomEvent && roomEvent.title ? `${roomEvent.title} — UniversalQuiz` : `UniversalQuiz — ${appLabel}`;
}
