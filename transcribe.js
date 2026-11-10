/*
 * transcribe.js — the heart of the project: turning a picture into code-drawn art.
 *
 * Every style follows the same three steps:
 *   1. SAMPLE  — shrink the image to a small grid and read each cell's colour.
 *   2. MAP     — turn each cell's brightness into something: a letter, a dot size,
 *                a brush stroke direction.
 *   3. DRAW    — paint those things onto a canvas.
 */

// ---------------------------------------------------------------- helpers

// A random-number generator that always gives the same sequence for the same seed.
// That way the brush strokes don't jump around every time you move a slider.
function makeRandom(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Character sets ordered from "empty" to "full".
const CHARSETS = {
  standard: " .:-=+*#%@",
  blocks: " ░▒▓█",
  dots: " ·∙•●",
  slashes: " .,/\\|X",
  binary: " 01",
};

// ---------------------------------------------------------------- 1. SAMPLE

/*
 * Shrinks the image to cols × rows pixels. The browser averages the colours
 * for us, so each tiny pixel = the average colour of one cell of the painting.
 * Returns a list of cells: { r, g, b, lum } where lum (brightness) is 0..1.
 */
// Remember recent samples, so live mode doesn't re-measure the painting 60×/s.
const sampleCache = new Map();
const sourceIds = new WeakMap();
let nextSourceId = 1;

function sampleImage(source, cols, rows, adjust) {
  if (!sourceIds.has(source)) sourceIds.set(source, nextSourceId++);
  const key = [sourceIds.get(source), cols, rows, adjust.brightness, adjust.contrast, adjust.invert].join("|");
  if (sampleCache.has(key)) return sampleCache.get(key);
  const result = measure(source, cols, rows, adjust);
  sampleCache.set(key, result);
  if (sampleCache.size > 16) sampleCache.delete(sampleCache.keys().next().value);
  return result;
}

function measure(source, cols, rows, adjust) {
  const c = document.createElement("canvas");
  c.width = cols;
  c.height = rows;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, cols, rows);
  const data = ctx.getImageData(0, 0, cols, rows).data;

  const contrast = 1 + adjust.contrast;  // 0 → no change
  const cells = new Array(cols * rows);
  for (let i = 0; i < cols * rows; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    // Human eyes see green as brighter than blue, hence the weights.
    let lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    lum = (lum - 0.5) * contrast + 0.5 + adjust.brightness;
    lum = clamp(lum, 0, 1);
    if (adjust.invert) lum = 1 - lum;
    cells[i] = { r, g, b, lum };
  }
  return { cols, rows, cells };
}

// "Ink" = how much drawing a cell needs. On light paper, dark areas need more ink;
// on a dark background it's the other way round.
// (On dark ground we lift the mid-tones a little, or dark paintings vanish.)
function inkAmount(cell, darkBackground) {
  return darkBackground ? Math.pow(cell.lum, 0.6) : 1 - cell.lum;
}

// On a dark ground, dark painting colours would disappear, so we brighten
// them while keeping their hue.
function cellColour(cell, p) {
  if (p.colour !== "image") return p.ink;
  if (!p.dark) return `rgb(${cell.r},${cell.g},${cell.b})`;
  const boost = Math.min(2.4, 190 / Math.max(1, cell.r, cell.g, cell.b));
  const f = Math.max(1, boost);
  return `rgb(${Math.min(255, cell.r * f) | 0},${Math.min(255, cell.g * f) | 0},${Math.min(255, cell.b * f) | 0})`;
}

// ---------------------------------------------------------------- 2+3. STYLES

/*
 * GLYPHS — every cell becomes one character.
 * Darker cell (more ink) → a "heavier" character from the set.
 */
function drawGlyphs(ctx, W, H, source, p, t) {
  const cellW = W / p.cols;
  const cellH = cellW * 1.65;              // monospace letters are taller than wide
  const rows = Math.max(1, Math.round(H / cellH));
  const grid = sampleImage(source, p.cols, rows, p);
  const ownText = p.charset === "text" ? (p.text.replace(/\s+/g, "") || "ART") : null;
  const set = CHARSETS[p.charset] || CHARSETS.standard;

  // Live mode: the bass makes letters swell, the highs scramble some of them.
  const pulse = p.pulse || 0, glitch = p.glitch || 0;
  const GLITCH_CHARS = "▓▒░#@%&$!?/\\<>{}[]01";
  ctx.font = `${cellH * 0.82 * (1 + pulse * 0.45)}px "IBM Plex Mono", ui-monospace, Menlo, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let k = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < p.cols; x++) {
      const cell = grid.cells[y * p.cols + x];
      let ink = inkAmount(cell, p.dark);
      let ch;

      if (ownText) {
        // Your own text runs through the picture like a ribbon;
        // ink decides how strongly each letter shows.
        ch = ownText[k++ % ownText.length];
        if (ink < 0.08) continue;
        ctx.globalAlpha = clamp(ink * 1.25, 0, 1);
      } else {
        if (p.animate) {
          // Shimmer: nudge the brightness up and down over time.
          ink += Math.sin(t * 3 + x * 0.7 + y * 1.3) * 0.06 * p.intensity;
        }
        const index = Math.round(clamp(ink, 0, 1) * (set.length - 1));
        ch = set[index];
        if (ch === " ") continue;
        ctx.globalAlpha = 1;
      }
      if (glitch && Math.random() < glitch * glitch * 0.18) {
        ch = GLITCH_CHARS[(Math.random() * GLITCH_CHARS.length) | 0];
      }

      const wave = p.animate ? Math.sin(x * 0.18 + t * 2) * cellH * 0.25 * p.intensity : 0;
      ctx.fillStyle = cellColour(cell, p);
      ctx.fillText(ch, (x + 0.5) * cellW, (y + 0.5) * cellH + wave);
    }
  }
  ctx.globalAlpha = 1;
  return { cols: p.cols, rows, unit: "glyphs", grid, set, ownText };
}

/*
 * HALFTONE — every cell becomes a dot, like newspaper printing.
 * More ink → bigger dot. Every second row is shifted half a step.
 */
function drawHalftone(ctx, W, H, source, p, t) {
  const step = W / p.cols;
  const rowStep = step * 0.866;            // hexagonal packing: √3 / 2
  const rows = Math.max(1, Math.round(H / rowStep));
  const grid = sampleImage(source, p.cols, rows, p);

  for (let y = 0; y < rows; y++) {
    const shift = y % 2 ? step / 2 : 0;
    for (let x = 0; x < p.cols; x++) {
      const cell = grid.cells[y * p.cols + x];
      let ink = inkAmount(cell, p.dark);
      if (p.animate) ink *= 1 + Math.sin(t * 2.2 - (x + y) * 0.25) * 0.25 * p.intensity;
      const r = Math.sqrt(clamp(ink, 0, 1)) * step * 0.62 * p.dotSize * (1 + (p.pulse || 0) * 0.55); // √ so area ∝ ink
      if (r < 0.4) continue;
      ctx.fillStyle = cellColour(cell, p);
      ctx.beginPath();
      ctx.arc(x * step + step / 2 + shift, y * rowStep + rowStep / 2, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return { cols: p.cols, rows, unit: "dots" };
}

/*
 * BRUSH STROKES — redraws the painting with thousands of short strokes
 * that follow the edges and shapes in the picture.
 *
 * How we find the direction: the "Sobel filter" measures how quickly brightness
 * changes left→right (gx) and top→bottom (gy). The steepest change points ACROSS
 * an edge, so we turn 90° to paint ALONG it, the way a painter follows a form.
 */
function drawStrokes(ctx, W, H, source, p, t) {
  const fw = 160;                                      // size of the direction map
  const fh = Math.max(2, Math.round(fw * (H / W)));
  const grid = sampleImage(source, fw, fh, p);
  const L = (x, y) => grid.cells[clamp(y, 0, fh - 1) * fw + clamp(x, 0, fw - 1)].lum;

  const angles = new Float32Array(fw * fh);
  const strength = new Float32Array(fw * fh);
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      const gx = (L(x + 1, y - 1) + 2 * L(x + 1, y) + L(x + 1, y + 1))
               - (L(x - 1, y - 1) + 2 * L(x - 1, y) + L(x - 1, y + 1));
      const gy = (L(x - 1, y + 1) + 2 * L(x, y + 1) + L(x + 1, y + 1))
               - (L(x - 1, y - 1) + 2 * L(x, y - 1) + L(x + 1, y - 1));
      angles[y * fw + x] = Math.atan2(gy, gx) + Math.PI / 2;
      strength[y * fw + x] = Math.hypot(gx, gy);
    }
  }

  const rand = makeRandom(1234);
  const unit = W / p.cols;
  const count = Math.round(p.strokes * (H / W) * 1.5);
  ctx.lineCap = "round";

  // Underpainting: a very blurry version of the painting (20 pixels wide,
  // stretched back up), so no bare canvas shows between the strokes.
  if (p.colour === "image") {
    const blur = document.createElement("canvas");
    blur.width = 20;
    blur.height = Math.max(2, Math.round(20 * H / W));
    blur.getContext("2d").drawImage(source, 0, 0, blur.width, blur.height);
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.85;
    ctx.drawImage(blur, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  // Then two layers like a real painting: broad strokes first, then detail.
  [{ share: 0.4, width: 2.6 }, { share: 0.6, width: 1.1 }].forEach((layer) => {
    const n = Math.round(count * layer.share);
    for (let i = 0; i < n; i++) {
      const fx = rand() * fw, fy = rand() * fh;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      const cell = grid.cells[iy * fw + ix];
      // Where there's no clear edge, fall back to a gentle sweeping direction.
      let a = strength[iy * fw + ix] > 0.08
        ? angles[iy * fw + ix]
        : Math.sin(fx * 0.05) * 0.6 + Math.cos(fy * 0.07) * 0.6;
      if (p.animate) a += Math.sin(t * 1.5 + fx * 0.08 + fy * 0.05) * 0.5 * p.intensity;
      if (p.glitch) a += (Math.random() - 0.5) * p.glitch * p.glitch * 2.5;

      const len = unit * p.strokeLength * (0.6 + rand() * 0.8) * (1 + (p.pulse || 0) * 0.9);
      const x = (fx / fw) * W, y = (fy / fh) * H;
      const dx = Math.cos(a) * len / 2, dy = Math.sin(a) * len / 2;

      ctx.lineWidth = unit * 0.55 * layer.width;
      ctx.strokeStyle = p.colour === "image" ? `rgb(${cell.r},${cell.g},${cell.b})` : p.ink;
      ctx.globalAlpha = p.colour === "image" ? 0.9 : clamp(inkAmount(cell, p.dark), 0.05, 1);
      ctx.beginPath();
      ctx.moveTo(x - dx, y - dy);
      ctx.lineTo(x + dx, y + dy);
      ctx.stroke();
    }
  });
  ctx.globalAlpha = 1;
  return { cols: p.cols, rows: Math.round(p.cols * H / W), unit: "strokes", count };
}

const STYLES = {
  glyphs: drawGlyphs,
  halftone: drawHalftone,
  strokes: drawStrokes,
};

// The glyph picture as plain text, for copying.
function glyphsAsText(info) {
  if (!info || !info.grid) return "";
  const { grid, set, ownText } = info;
  let out = "", k = 0;
  for (let y = 0; y < grid.rows; y++) {
    let line = "";
    for (let x = 0; x < grid.cols; x++) {
      const ink = inkAmount(grid.cells[y * grid.cols + x], info.dark);
      if (ownText) line += ink < 0.08 ? (k++, " ") : ownText[k++ % ownText.length];
      else line += set[Math.round(ink * (set.length - 1))];
    }
    out += line.replace(/\s+$/, "") + "\n";
  }
  return out;
}
