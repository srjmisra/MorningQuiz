// Animated shield emblems for each group — replaces emoji group icons with a
// consistent vector badge (same shield silhouette used in the Lucide icon
// set, filled with the group's color) so every group has one coherent visual
// identity instead of an arbitrary emoji.

function darkenHex(hex, amount) {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, (num >> 16) - amount);
  const g = Math.max(0, ((num >> 8) & 0x00ff) - amount);
  const b = Math.max(0, (num & 0x0000ff) - amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

const SHIELD_PATH =
  "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z";

function groupEmblem(group, opts) {
  const o = opts || {};
  const size = o.size || 40;
  const delay = o.delay || 0;
  const dark = darkenHex(group.color, 60);
  const gradId = `emblem-grad-${group.id}-${Math.random().toString(36).slice(2, 8)}`;

  return `
    <svg class="group-emblem" width="${size}" height="${size}" viewBox="0 0 24 24" style="animation-delay:${delay}s" role="img" aria-label="${group.name}">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${group.color}" />
          <stop offset="100%" stop-color="${dark}" />
        </linearGradient>
      </defs>
      <path d="${SHIELD_PATH}" fill="url(#${gradId})" stroke="rgba(255,255,255,0.32)" stroke-width="0.75" />
      <text x="12" y="14.7" text-anchor="middle" font-size="9.5" font-weight="800" fill="#ffffff">${group.id}</text>
    </svg>
  `;
}
