/*
 * live.js — v2 "Live mode": the painting fills the screen and plays along
 * with music, like visuals behind a DJ set.
 *
 * Every frame:
 *   1. listen      → bass / mid / high levels and beats (live-audio.js)
 *   2. draw scene  → the chosen style, pushed by the music (transcribe.js)
 *   3. post-FX     → trails, colour look, RGB-split glitch, scanlines, grain
 */

const live = {
  on: false,
  style: "glyphs",
  look: "neon",
  trails: true,
  glitch: true,
  flashes: false,            // off by default: strobing can trigger seizures
  auto: true,
  beats: 0,
  sliceFrames: 0,
  split: 0,
  flash: 0,
  idleTimer: null,
};

const L$ = (s) => document.querySelector(s);
const liveEl = L$("#live");
const view = L$("#live-canvas");
const vctx = view.getContext("2d");

// Off-screen canvases: the scene, the previous frame (for trails), and a scratch pad.
const makeLayer = () => { const c = document.createElement("canvas"); return [c, c.getContext("2d")]; };
const [scene, sctx] = makeLayer();
const [trail, tctx] = makeLayer();
const [scratch, xctx] = makeLayer();
const [chan, cctx] = makeLayer();

const LIVE_STYLES = ["glyphs", "halftone", "strokes"];
const LOOKS = ["original", "neon", "infrared", "ice"];
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------- sizing
let coverCache = { key: "", canvas: null };

function sizeLive() {
  const dpr = 1;   // full screen at 1× keeps 60 frames per second
  const W = Math.round(window.innerWidth * dpr), H = Math.round(window.innerHeight * dpr);
  if (view.width !== W || view.height !== H) {
    [view, scene, trail, scratch, chan].forEach((c) => { c.width = W; c.height = H; });
  }
  return { W, H };
}

// Crop the painting to fill the screen completely ("cover"), keeping its centre.
function coverSource(W, H) {
  const key = `${sourceIds.get(source) || 0}|${(W / H).toFixed(3)}`;
  if (coverCache.key === key && coverCache.canvas) return coverCache.canvas;
  const target = W / H, own = source.width / source.height;
  let sw = source.width, sh = source.height, sx = 0, sy = 0;
  if (own > target) { sw = sh * target; sx = (source.width - sw) / 2; }
  else { sh = sw / target; sy = (source.height - sh) / 2; }
  const c = document.createElement("canvas");
  const scale = Math.min(1, 1200 / Math.max(sw, sh));
  c.width = Math.round(sw * scale);
  c.height = Math.round(sh * scale);
  c.getContext("2d").drawImage(source, sx, sy, sw, sh, 0, 0, c.width, c.height);
  coverCache = { key, canvas: c };
  return c;
}

// ---------------------------------------------------------------- texture overlays
// Made once: a scanline pattern and a patch of film grain.
const scan = document.createElement("canvas");
scan.width = 4; scan.height = 4;
(() => { const g = scan.getContext("2d"); g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(0, 0, 4, 1); })();
const grain = document.createElement("canvas");
grain.width = grain.height = 192;
(() => {
  const g = grain.getContext("2d"), img = g.createImageData(192, 192);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 40;
  }
  g.putImageData(img, 0, 0);
})();

// ---------------------------------------------------------------- the frame
function liveFrame(time) {
  if (!live.on) return;
  const t = time / 1000;
  const lv = analyseAudio(t);
  const { W, H } = sizeLive();
  const art = coverSource(W, H);

  // Beats drive the show.
  if (lv.beat) {
    live.beats++;
    if (live.glitch) live.split = 1;
    if (live.glitch && Math.random() < 0.45) live.sliceFrames = 5;
    if (live.flashes && !reduceMotion) live.flash = 1;
    if (live.auto && live.beats % 32 === 0) setLiveStyle(LIVE_STYLES[(LIVE_STYLES.indexOf(live.style) + 1) % 3], true);
  }

  // 1) Draw the scene with the music pushing the style's settings.
  const q = {
    ...p,
    mode: live.style,
    colour: "image",
    dark: true,
    ink: GROUNDS.dark.ink,
    animate: true,
    intensity: 0.35 + lv.mid * 1.6,
    pulse: reduceMotion ? lv.bass * 0.3 : lv.bass,
    glitch: live.glitch ? lv.high * 0.7 : 0,
    cols: live.style === "glyphs" ? Math.min(p.cols, 140) : p.cols,
    strokes: Math.min(p.strokes, 5000),
  };
  sctx.clearRect(0, 0, W, H);
  STYLES[live.style](sctx, W, H, art, q, t);

  // 2) Composite: black ground, the old frame zooming away (trails), the new scene.
  vctx.globalCompositeOperation = "source-over";
  vctx.globalAlpha = 1;
  vctx.filter = "none";
  vctx.fillStyle = "#000";
  vctx.fillRect(0, 0, W, H);

  if (live.trails) {
    const z = 1.012 + lv.bass * 0.03;
    vctx.globalAlpha = 0.6;
    vctx.drawImage(trail, (W - W * z) / 2, (H - H * z) / 2, W * z, H * z);
    vctx.globalAlpha = 1;
  }

  const zoom = 1 + lv.bass * (reduceMotion ? 0.01 : 0.045);
  vctx.filter = lookFilter(t, lv);
  vctx.drawImage(scene, (W - W * zoom) / 2, (H - H * zoom) / 2, W * zoom, H * zoom);
  vctx.globalCompositeOperation = "source-over";
  vctx.filter = "none";
  tintLook(W, H, t);

  // Keep this frame for the next frame's trails (before the glitch effects).
  tctx.clearRect(0, 0, W, H);
  tctx.drawImage(view, 0, 0);

  // 3) Glitch: on each beat, split red/green/blue apart, then let it settle.
  if (live.split > 0.05) rgbSplit(W, H, live.split * (0.4 + lv.high) * W * 0.01);
  live.split *= 0.72;
  if (live.sliceFrames > 0) { slices(W, H); live.sliceFrames--; }

  // Opt-in flash on the beat.
  if (live.flash > 0.02) {
    vctx.globalCompositeOperation = "difference";
    vctx.fillStyle = `rgba(255,255,255,${live.flash * 0.9})`;
    vctx.fillRect(0, 0, W, H);
    vctx.globalCompositeOperation = "source-over";
    live.flash *= 0.55;
  }

  // Screen texture: scanlines, grain and a vignette.
  vctx.fillStyle = vctx.createPattern(scan, "repeat");
  vctx.fillRect(0, 0, W, H);
  vctx.globalAlpha = 0.5;
  vctx.fillStyle = vctx.createPattern(grain, "repeat");
  vctx.save();
  vctx.translate(Math.random() * 192, Math.random() * 192);
  vctx.fillRect(-192, -192, W + 192, H + 192);
  vctx.restore();
  vctx.globalAlpha = 1;
  const vig = vctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.7)");
  vctx.fillStyle = vig;
  vctx.fillRect(0, 0, W, H);

  updateMeters(lv);
  requestAnimationFrame(liveFrame);
}

// Colour looks. "neon" spins the hue with the music; the others turn the
// picture black-and-white first and then dye it with a gradient.
function lookFilter(t, lv) {
  if (live.look === "neon") return `saturate(2.1) contrast(1.2) hue-rotate(${(t * 18 + lv.bass * 50) % 360}deg)`;
  if (live.look === "infrared" || live.look === "ice") return "grayscale(1) contrast(1.45) brightness(1.1)";
  return "none";
}

function tintLook(W, H, t) {
  if (live.look !== "infrared" && live.look !== "ice") return;
  const g = vctx.createLinearGradient(0, 0, W, H);
  const shift = (Math.sin(t * 0.3) + 1) / 2;
  if (live.look === "infrared") {
    g.addColorStop(0, "#ff1f6b"); g.addColorStop(0.5 + shift * 0.3, "#ff7a1a"); g.addColorStop(1, "#ffe14d");
  } else {
    g.addColorStop(0, "#2ef2ff"); g.addColorStop(0.5 + shift * 0.3, "#5b6cff"); g.addColorStop(1, "#c86bff");
  }
  vctx.globalCompositeOperation = "color";   // keep the brightness, take the colour
  vctx.fillStyle = g;
  vctx.fillRect(0, 0, W, H);
  vctx.globalCompositeOperation = "source-over";
}

// Separate the three colour channels and shift them sideways.
function rgbSplit(W, H, px) {
  xctx.clearRect(0, 0, W, H);
  xctx.drawImage(view, 0, 0);
  vctx.fillStyle = "#000";
  vctx.fillRect(0, 0, W, H);
  [["#f00", -px], ["#0f0", 0], ["#00f", px]].forEach(([colour, dx]) => {
    cctx.globalCompositeOperation = "source-over";
    cctx.drawImage(scratch, 0, 0);
    cctx.globalCompositeOperation = "multiply";
    cctx.fillStyle = colour;
    cctx.fillRect(0, 0, W, H);
    vctx.globalCompositeOperation = "lighter";
    vctx.drawImage(chan, dx, 0);
  });
  vctx.globalCompositeOperation = "source-over";
}

// Cut the picture into horizontal strips and shove some of them sideways.
function slices(W, H) {
  xctx.clearRect(0, 0, W, H);
  xctx.drawImage(view, 0, 0);
  for (let i = 0; i < 7; i++) {
    const y = Math.random() * H, h = H * (0.01 + Math.random() * 0.07);
    const dx = (Math.random() - 0.5) * W * 0.12;
    vctx.drawImage(scratch, 0, y, W, h, dx, y, W, h);
  }
}

// ---------------------------------------------------------------- HUD
function updateMeters(lv) {
  L$("#mb").style.transform = `scaleX(${lv.bass.toFixed(3)})`;
  L$("#mm").style.transform = `scaleX(${lv.mid.toFixed(3)})`;
  L$("#mh").style.transform = `scaleX(${lv.high.toFixed(3)})`;
  L$("#beat-dot").classList.toggle("hit", lv.beat);
}

function hudMessage(text, isError) {
  const m = L$("#hud-msg");
  m.textContent = text;
  m.classList.toggle("err", !!isError);
  showHud();
}

function refreshSourceUI() {
  const kind = liveSource ? liveSource.kind : null;
  document.querySelectorAll("[data-src]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.src === kind)));
  L$("#track-label").setAttribute("aria-pressed", String(kind === "track"));
  L$("#hud-track").textContent = liveSource ? liveSource.label : "No sound · pick a source";
  const play = L$("#live-play");
  play.hidden = !liveSource || !(liveSource.kind === "track" || liveSource.kind === "demo");
}
onSourceEnded = () => { refreshSourceUI(); hudMessage("The shared sound ended."); };

function setPressed(selector, attr, value) {
  document.querySelectorAll(selector).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset[attr] === value)));
}

function setLiveStyle(style, fromAuto) {
  live.style = style;
  setPressed("[data-lstyle]", "lstyle", style);
  if (!fromAuto) { live.auto = false; L$("#live-auto").setAttribute("aria-pressed", "false"); }
}
function setLook(look) { live.look = look; setPressed("[data-look]", "look", look); }

function toggleFx(key, btn) {
  live[key] = !live[key];
  btn.setAttribute("aria-pressed", String(live[key]));
}

// Hide the controls when the mouse rests, like a video player.
function showHud() {
  liveEl.classList.remove("idle");
  clearTimeout(live.idleTimer);
  live.idleTimer = setTimeout(() => {
    if (!liveEl.contains(document.activeElement) || document.activeElement === document.body || document.activeElement === liveEl) liveEl.classList.add("idle");
  }, 2800);
}

// ---------------------------------------------------------------- open / close
function openLive() {
  stopSound();                       // stop the studio's "listen" if it plays
  live.on = true;
  liveEl.hidden = false;
  liveEl.focus();                    // so Space plays/pauses instead of pressing a button
  document.documentElement.style.overflow = "hidden";
  try { startDemoBeat(); } catch (e) { hudMessage(e.message, true); }
  refreshSourceUI();
  hudMessage("Demo beat playing. Bring your own: a track, a YouTube tab or the mic.");
  requestAnimationFrame(liveFrame);
}

function closeLive() {
  live.on = false;
  stopLiveSource();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  liveEl.hidden = true;
  document.documentElement.style.overflow = "";
  L$("#go-live").focus();
  render();
}

function toggleFullscreen() {
  if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
  if (liveEl.requestFullscreen) liveEl.requestFullscreen().catch(() => hudMessage("Fullscreen isn't allowed here. It works on your GitHub page.", true));
  else hudMessage("This browser has no fullscreen mode.", true);
}

function togglePlay() {
  if (!liveSource) return;
  if (liveSource.kind === "demo") { stopLiveSource(); refreshSourceUI(); L$("#live-play").hidden = false; L$("#live-play-label").textContent = "Play"; return; }
  if (liveSource.toggle) L$("#live-play-label").textContent = liveSource.toggle() ? "Pause" : "Play";
}

// ---------------------------------------------------------------- wiring
L$("#go-live").addEventListener("click", openLive);
L$("#live-exit").addEventListener("click", closeLive);
L$("#live-fs").addEventListener("click", toggleFullscreen);
L$("#live-play").addEventListener("click", () => {
  if (!liveSource) { startDemoBeat(); refreshSourceUI(); L$("#live-play-label").textContent = "Pause"; return; }
  togglePlay();
});

document.querySelectorAll("[data-src]").forEach((b) => b.addEventListener("click", async () => {
  const kind = b.dataset.src;
  try {
    if (kind === "demo") startDemoBeat();
    if (kind === "tab") {
      hudMessage("Pick your YouTube tab and switch on “Also share tab audio”.");
      await startTabCapture();
    }
    if (kind === "mic") await startMic();
    L$("#live-play-label").textContent = "Pause";
    refreshSourceUI();
    hudMessage(kind === "tab" ? "Listening to your tab. Play the video there." : kind === "mic" ? "Listening through the microphone." : "Demo beat playing.");
  } catch (e) {
    hudMessage(e.message, true);
  }
}));

L$("#live-file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith("audio/") && !/\.(mp3|m4a|wav|ogg|aac|flac)$/i.test(file.name)) {
    hudMessage("That isn't an audio file. Try an MP3, M4A or WAV.", true);
    return;
  }
  try { ensureAudio(); } catch (err) { hudMessage(err.message, true); return; }
  startTrack(file).then(() => {
    L$("#live-play-label").textContent = "Pause";
    refreshSourceUI();
    hudMessage("Playing your track.");
  }, (err) => hudMessage(err.message, true));
  e.target.value = "";
});

document.querySelectorAll("[data-lstyle]").forEach((b) => b.addEventListener("click", () => setLiveStyle(b.dataset.lstyle)));
document.querySelectorAll("[data-look]").forEach((b) => b.addEventListener("click", () => setLook(b.dataset.look)));
L$("#live-auto").addEventListener("click", (e) => toggleFx("auto", e.currentTarget));
L$("#fx-trails").addEventListener("click", (e) => toggleFx("trails", e.currentTarget));
L$("#fx-glitch").addEventListener("click", (e) => toggleFx("glitch", e.currentTarget));
L$("#fx-flash").addEventListener("click", (e) => {
  toggleFx("flashes", e.currentTarget);
  if (live.flashes) hudMessage("Flashes on. Turn them off if anyone watching is sensitive to flashing light.");
});

liveEl.addEventListener("pointermove", showHud);
liveEl.addEventListener("pointerdown", showHud);

document.addEventListener("keydown", (e) => {
  if (!live.on || e.target.tagName === "INPUT") return;
  const k = e.key.toLowerCase();
  if (k === "escape" && !document.fullscreenElement) closeLive();
  else if (k === "f") toggleFullscreen();
  else if (k === " " && e.target.tagName !== "BUTTON") { e.preventDefault(); L$("#live-play").click(); }
  else if (k >= "1" && k <= "3") setLiveStyle(LIVE_STYLES[Number(k) - 1]);
  else if (k === "l") setLook(LOOKS[(LOOKS.indexOf(live.look) + 1) % LOOKS.length]);
  else if (k === "a") L$("#live-auto").click();
  else if (k === "t") L$("#fx-trails").click();
  else if (k === "g") L$("#fx-glitch").click();
  else if (k === "h") liveEl.classList.toggle("idle");
  else return;
  if (k !== "h") showHud();
});
