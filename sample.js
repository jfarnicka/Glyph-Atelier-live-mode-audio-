/*
 * sample.js — paints a sample picture with code, so the atelier has
 * something to transcribe before you upload your own painting.
 * "Evening Sea": sky, sun, hills and water, finished with thousands of
 * small brush marks for a painted texture.
 */

function paintSample() {
  const W = 1200, H = 800;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  const rand = makeRandom(7);
  const horizon = H * 0.58;

  // Sky: deep blue at the top, glowing orange near the horizon.
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "#14205a");
  sky.addColorStop(0.45, "#4a3f8f");
  sky.addColorStop(0.75, "#d9785a");
  sky.addColorStop(1, "#f5c26b");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, horizon);

  // Sun with a soft halo.
  const sx = W * 0.66, sy = H * 0.43;
  const halo = ctx.createRadialGradient(sx, sy, 10, sx, sy, 260);
  halo.addColorStop(0, "rgba(255,240,190,0.95)");
  halo.addColorStop(0.25, "rgba(255,200,120,0.55)");
  halo.addColorStop(1, "rgba(255,160,90,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, horizon);
  ctx.fillStyle = "#fff4d2";
  ctx.beginPath();
  ctx.arc(sx, sy, 58, 0, Math.PI * 2);
  ctx.fill();

  // Two layers of hills, built from overlapping sine waves.
  [["#3b2d5c", 0.5, 70], ["#24193d", 0.555, 45]].forEach(([colour, base, height], i) => {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    for (let x = 0; x <= W; x += 8) {
      const y = H * base - height * (Math.sin(x * 0.004 + i * 2) * 0.6 + Math.sin(x * 0.011 + i) * 0.3 + 0.5);
      ctx.lineTo(x, Math.min(y, horizon));
    }
    ctx.lineTo(W, horizon);
    ctx.fill();
  });

  // Sea: dark below, catching the sky colour near the horizon.
  const sea = ctx.createLinearGradient(0, horizon, 0, H);
  sea.addColorStop(0, "#c46d5c");
  sea.addColorStop(0.18, "#3e4b8a");
  sea.addColorStop(1, "#0d1838");
  ctx.fillStyle = sea;
  ctx.fillRect(0, horizon, W, H - horizon);

  // Reflection of the sun: a column of short bright dashes.
  for (let i = 0; i < 260; i++) {
    const y = horizon + rand() * (H - horizon);
    const spread = 18 + (y - horizon) * 0.35;
    const x = sx + (rand() - 0.5) * spread * 2;
    ctx.fillStyle = `rgba(255,${200 + rand() * 50},${130 + rand() * 60},${0.85 - (y - horizon) / (H - horizon) * 0.6})`;
    ctx.fillRect(x, y, 10 + rand() * 30, 3 + rand() * 3);
  }

  // Brush texture: read the colours painted so far and dab short strokes on top,
  // swirling in the sky and lying flat on the water.
  const base = ctx.getImageData(0, 0, W, H).data;
  ctx.lineCap = "round";
  for (let i = 0; i < 9000; i++) {
    const x = rand() * W, y = rand() * H;
    const k = (Math.floor(y) * W + Math.floor(x)) * 4;
    const shade = (rand() - 0.5) * 34;
    const r = clamp(base[k] + shade, 0, 255), g = clamp(base[k + 1] + shade, 0, 255), b = clamp(base[k + 2] + shade, 0, 255);
    const a = y < horizon
      ? Math.sin(x * 0.006) * 0.9 + Math.cos(y * 0.012) * 0.7
      : (rand() - 0.5) * 0.15;
    const len = y < horizon ? 14 + rand() * 18 : 18 + rand() * 30;
    ctx.strokeStyle = `rgba(${r | 0},${g | 0},${b | 0},0.55)`;
    ctx.lineWidth = 3 + rand() * 4;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(a) * len / 2, y - Math.sin(a) * len / 2);
    ctx.lineTo(x + Math.cos(a) * len / 2, y + Math.sin(a) * len / 2);
    ctx.stroke();
  }
  return c;
}
