function launchConfetti(options) {
  const opts = options || {};
  const container = opts.container || document.body;
  const count = opts.count || 60;
  const duration = opts.duration || 3500;
  const colors = opts.colors || [
    "#2563EB", "#F59E0B", "#10B981", "#EF4444",
    "#8B5CF6", "#06B6D4", "#EC4899", "#84CC16"
  ];

  const layer = document.createElement("div");
  layer.className = "confetti-layer";

  for (let i = 0; i < count; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.left = Math.random() * 100 + "%";
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = (Math.random() * 0.6).toFixed(2) + "s";
    piece.style.animationDuration = (2.2 + Math.random() * 1.4).toFixed(2) + "s";
    piece.style.setProperty("--drift", Math.round((Math.random() * 2 - 1) * 80) + "px");
    layer.appendChild(piece);
  }

  container.appendChild(layer);
  setTimeout(() => layer.remove(), duration);
}

function launchFireworks(options) {
  const opts = options || {};
  const container = opts.container || document.body;
  const bursts = opts.bursts || 5;
  const particlesPerBurst = opts.particlesPerBurst || 24;
  const colors = opts.colors || [
    "#facc15", "#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"
  ];

  for (let b = 0; b < bursts; b++) {
    setTimeout(() => {
      const originX = 15 + Math.random() * 70;
      const originY = 20 + Math.random() * 40;

      const layer = document.createElement("div");
      layer.className = "firework-layer";
      layer.style.left = originX + "vw";
      layer.style.top = originY + "vh";

      for (let i = 0; i < particlesPerBurst; i++) {
        const angle = (i / particlesPerBurst) * Math.PI * 2;
        const distance = 60 + Math.random() * 60;
        const piece = document.createElement("span");
        piece.className = "firework-piece";
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        piece.style.setProperty("--dx", Math.round(Math.cos(angle) * distance) + "px");
        piece.style.setProperty("--dy", Math.round(Math.sin(angle) * distance) + "px");
        piece.style.animationDelay = (Math.random() * 0.1).toFixed(2) + "s";
        layer.appendChild(piece);
      }

      container.appendChild(layer);
      setTimeout(() => layer.remove(), 1600);
    }, b * 400);
  }
}
