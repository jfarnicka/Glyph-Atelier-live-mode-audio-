/*
 * app.js — connects the controls to the drawing.
 *
 * "p" holds every setting. A slider changes p, then render() redraws the
 * whole canvas from p. When animation or sound is running, render() is
 * called about 60 times a second instead.
 */
"use strict";

const $ = (s) => document.querySelector(s);
const canvas = $("#canvas");
const ctx = canvas.getContext("2d");

const GROUNDS = {
  dark: { bg: "#15191e", ink: "#ece6d6" },
  light: { bg: "#f5f2ea", ink: "#1b2128" },
};

const p = {
  mode: "glyphs",
  cols: 110,
  charset: "standard",
  text: "SEA SUN SALT WIND",
  dotSize: 1,
  strokeLength: 3,
  strokes: 8000,
  colour: "image",
  dark: true,
  ink: GROUNDS.dark.ink,
  brightness: 0,
  contrast: 0.2,
  invert: false,
  animate: false,
  intensity: 1,
};

let source = null;          // the painting, as a canvas
let title = "Evening Sea";
let isSample = true;
let showOriginal = false;
let lastInfo = null;
let looping = false;

// ---------------------------------------------------------------- the painting
// Big photos are shrunk to 1200 px first: plenty of detail, much faster.
function toSourceCanvas(img) {
  const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.width * scale));
  c.height = Math.max(1, Math.round(img.height * scale));
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c;
}

function loadFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    toast("That isn't an image. Try a JPG or PNG of a painting.");
    return;
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    source = toSourceCanvas(img);
    title = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ") || "Your painting";
    isSample = false;
    $("#use-sample").hidden = false;
    URL.revokeObjectURL(url);
    stopSound();
    render();
    toast("Painting loaded. Try the three styles.");
  };
  img.onerror = () => toast("This image couldn't be opened. Try saving it as JPG or PNG first.");
  img.src = url;
}

function useSample() {
  source = paintSample();
  title = "Evening Sea";
  isSample = true;
  $("#use-sample").hidden = true;
  stopSound();
  render();
}

// ---------------------------------------------------------------- sizing
// Fit the canvas to the space available while keeping the painting's proportions.
function fitCanvas() {
  const maxW = $(".stage-col").clientWidth;
  const maxH = Math.max(260, window.innerHeight * 0.74);
  const aspect = source.height / source.width;
  let w = maxW, h = w * aspect;
  if (h > maxH) { h = maxH; w = h / aspect; }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.round(w * dpr), H = Math.round(h * dpr);
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = Math.round(w) + "px";
    canvas.style.height = Math.round(h) + "px";
  }
  return { W, H };
}

// ---------------------------------------------------------------- drawing
function render(time = performance.now()) {
  if (!source) return;
  const { W, H } = fitCanvas();
  const t = time / 1000;
  const ground = p.dark ? GROUNDS.dark : GROUNDS.light;
  p.ink = ground.ink;

  ctx.fillStyle = ground.bg;
  ctx.fillRect(0, 0, W, H);

  if (showOriginal) {
    ctx.drawImage(source, 0, 0, W, H);
  } else {
    lastInfo = STYLES[p.mode](ctx, W, H, source, p, t);
    lastInfo.dark = p.dark;
  }
  updateCaption();
  updatePlayhead();
}

function updateCaption() {
  $("#cap-title").textContent = title + (isSample ? " · generated sample" : "");
  if (showOriginal) { $("#cap-meta").textContent = "ORIGINAL"; return; }
  const i = lastInfo;
  const detail = p.mode === "strokes"
    ? `${i.count.toLocaleString("en")} strokes`
    : `${i.cols} × ${i.rows} ${i.unit}`;
  const extra = p.mode === "glyphs" ? ` · ${p.charset === "text" ? "your text" : p.charset}` : "";
  $("#cap-meta").textContent = `${p.mode.toUpperCase()} · ${detail}${extra}`;
  canvas.setAttribute("aria-label", `${title}, transcribed as ${p.mode}`);
}

// Animation and sound need continuous redrawing; everything else draws once.
function loop(time) {
  if (typeof live !== "undefined" && live.on) { looping = false; return; } // live mode draws itself
  const playing = soundProgress() !== null;
  if (!p.animate && !playing) {
    looping = false;
    if (!playing) resetListenButton();
    render(time);
    return;
  }
  if (p.animate) render(time);
  else updatePlayhead();
  requestAnimationFrame(loop);
}

function kick() {
  if (!looping && (p.animate || soundProgress() !== null)) {
    looping = true;
    requestAnimationFrame(loop);
  }
}

function update() {
  render();
  kick();
}

// ---------------------------------------------------------------- sound
function updatePlayhead() {
  const prog = soundProgress();
  const ph = $("#playhead");
  ph.hidden = prog === null;
  if (prog !== null) ph.style.left = prog * 100 + "%";
}

function resetListenButton() {
  const b = $("#listen");
  b.setAttribute("aria-pressed", "false");
  b.querySelector(".ico").textContent = "▶";
  $("#listen-label").textContent = "Listen to the painting";
  $("#playhead").hidden = true;
}

function stopSound() {
  stopPainting();
  resetListenButton();
}

$("#listen").addEventListener("click", () => {
  if (soundProgress() !== null) { stopSound(); return; }
  try {
    playPainting(source, 16);
  } catch (e) {
    toast(e.message);
    return;
  }
  const b = $("#listen");
  b.setAttribute("aria-pressed", "true");
  b.querySelector(".ico").textContent = "■";
  $("#listen-label").textContent = "Stop";
  kick();
});

// ---------------------------------------------------------------- explanations
const HOW = {
  glyphs: [
    ["Sample", "The painting is shrunk to one pixel per letter, so the browser averages each patch of colour for us.", "ctx.drawImage(img, 0, 0, cols, rows)"],
    ["Measure brightness", "Each pixel's red, green and blue become one brightness value from 0 to 1. Green counts most, because our eyes are most sensitive to it.", "0.21·R + 0.72·G + 0.07·B"],
    ["Pick a letter", "More ink needed means a heavier character from the set. The letter is then printed in the painting's own colour.", "set[round(ink × (set.length − 1))]"],
  ],
  halftone: [
    ["Sample", "Like newspaper printing: the picture becomes a grid of cells, every second row shifted half a step into a honeycomb.", "rowStep = step × √3 / 2"],
    ["Size by ink", "A darker cell gets a bigger dot. The square root keeps the dot's area, not its width, in proportion to the ink.", "radius = √ink × step × 0.62"],
    ["Print", "Each dot is drawn as a circle in the colour of its cell. Seen from a distance, your eye blends them back into the painting.", "ctx.arc(x, y, radius, 0, 2π)"],
  ],
  strokes: [
    ["Find the edges", "The Sobel filter compares each pixel with its neighbours to measure how fast brightness changes left→right and top→bottom.", "gx, gy = Sobel(brightness)"],
    ["Turn 90°", "The steepest change points across an edge. Turning by 90° gives the direction along it, the way a painter follows a form.", "angle = atan2(gy, gx) + π/2"],
    ["Paint in layers", "Thousands of short strokes in the painting's colours: broad underpainting first, then a finer layer of detail on top.", "ctx.lineTo(x + cos(a)·len, …)"],
  ],
};

function renderHow() {
  $("#steps").innerHTML = HOW[p.mode].map(([h, text, code]) =>
    `<li><strong>${h}</strong><p>${text}</p><code>${code.replace(/</g, "&lt;")}</code></li>`).join("");
}

// ---------------------------------------------------------------- controls
function setMode(mode) {
  p.mode = mode;
  document.querySelectorAll(".modes button").forEach((b) =>
    b.setAttribute("aria-selected", String(b.dataset.mode === mode)));
  document.querySelectorAll(".only").forEach((el) => (el.hidden = el.dataset.for !== mode));
  $("#copy-text").disabled = mode !== "glyphs";
  $("#copy-text").title = mode === "glyphs" ? "" : "Only for the Glyphs style";
  renderHow();
  update();
}

document.querySelectorAll(".modes button").forEach((b) =>
  b.addEventListener("click", () => setMode(b.dataset.mode)));

// Sliders: show the value next to the label and redraw.
const SLIDERS = {
  cols: (v) => `${v} columns`,
  dotSize: (v) => `${Math.round(v * 100)}%`,
  strokeLength: (v) => `${v}×`,
  strokes: (v) => Number(v).toLocaleString("en"),
  brightness: (v) => (v > 0 ? "+" : "") + Math.round(v * 100),
  contrast: (v) => (v > 0 ? "+" : "") + Math.round(v * 100),
  intensity: (v) => `${Math.round(v * 100)}%`,
};
Object.keys(SLIDERS).forEach((id) => {
  const input = $("#" + id);
  const show = () => ($("#o-" + id).textContent = SLIDERS[id](Number(input.value)));
  input.value = p[id];
  show();
  input.addEventListener("input", () => {
    p[id] = Number(input.value);
    show();
    update();
  });
});

$("#charset").addEventListener("change", (e) => {
  p.charset = e.target.value;
  $("#text-wrap").hidden = p.charset !== "text";
  update();
});
$("#text").addEventListener("input", (e) => { p.text = e.target.value; update(); });
$("#invert").addEventListener("change", (e) => { p.invert = e.target.checked; update(); });
$("#animate").addEventListener("change", (e) => { p.animate = e.target.checked; update(); });

document.querySelectorAll("[data-colour]").forEach((b) => b.addEventListener("click", () => {
  p.colour = b.dataset.colour;
  document.querySelectorAll("[data-colour]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
  update();
}));
document.querySelectorAll("[data-bg]").forEach((b) => b.addEventListener("click", () => {
  p.dark = b.dataset.bg === "dark";
  document.querySelectorAll("[data-bg]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
  update();
}));

// Hold to compare with the original.
const compare = $("#compare");
const showOrig = (on) => { if (showOriginal !== on) { showOriginal = on; render(); } };
compare.addEventListener("pointerdown", (e) => { e.preventDefault(); showOrig(true); });
["pointerup", "pointerleave", "pointercancel", "blur"].forEach((ev) => compare.addEventListener(ev, () => showOrig(false)));
compare.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); showOrig(true); } });
compare.addEventListener("keyup", () => showOrig(false));

// Upload: click, drag-and-drop or paste.
$("#file").addEventListener("change", (e) => loadFile(e.target.files[0]));
const drop = $("#drop");
["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("over")));
drop.addEventListener("drop", (e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); });
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });
document.addEventListener("paste", (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
  if (item) loadFile(item.getAsFile());
});
$("#use-sample").addEventListener("click", useSample);

// Copy the glyph picture as plain text.
$("#copy-text").addEventListener("click", () => {
  const text = glyphsAsText(lastInfo);
  if (!navigator.clipboard?.writeText) { toast("Copying isn't available in this browser."); return; }
  navigator.clipboard.writeText(text).then(
    () => toast(`Copied ${lastInfo.rows} lines of text. Paste it into a code editor to see it.`),
    () => toast("The browser blocked copying. Try the Export button instead."));
});

// Export: show the picture large so it can be saved.
$("#export").addEventListener("click", () => {
  const url = canvas.toDataURL("image/png");
  $("#ov-img").src = url;
  $("#ov-download").href = url;
  $("#ov-download").download = `${title.replace(/\s+/g, "-").toLowerCase()}-${p.mode}.png`;
  // Inside an embedded preview, downloads are blocked, so only offer right-click saving there.
  $("#ov-download").hidden = window.self !== window.top;
  $("#overlay").hidden = false;
  $("#ov-close").focus();
});
const closeOverlay = () => { $("#overlay").hidden = true; $("#export").focus(); };
$("#ov-close").addEventListener("click", closeOverlay);
$("#overlay").addEventListener("click", (e) => { if (e.target.id === "overlay") closeOverlay(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#overlay").hidden) closeOverlay(); });

let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3500);
}

let resizeTimer;
window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 120); });

// ---------------------------------------------------------------- start
source = paintSample();
setMode("glyphs");
// Redraw once the monospace font has arrived, so glyphs use it.
if (document.fonts && document.fonts.load) {
  document.fonts.load('20px "IBM Plex Mono"').then(() => render(), () => {});
}
