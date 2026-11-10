/*
 * live-audio.js — the ears of live mode.
 *
 * Any sound source is plugged into one "analyser". Sixty times a second it
 * tells us how loud each frequency is (a Fast Fourier Transform, FFT).
 * We group the frequencies into three bands, like a DJ mixer's EQ:
 *   bass  30–150 Hz    → kick drum, bassline → makes the picture pulse
 *   mid   150–2000 Hz  → vocals, synths      → makes it wave
 *   high  2–10 kHz     → hi-hats, cymbals    → makes it glitch
 * A "beat" is a sudden jump in bass above its recent average.
 *
 * Sources: a demo beat made with code, your own track, a browser tab
 * (YouTube, SoundCloud, Spotify web) or the microphone.
 */

let audioCtx = null;
let analyser = null;
let spectrum = null;
let liveSource = null;          // { kind, label, stop(), toggle?() }
let onSourceEnded = () => {};

const levels = { bass: 0, mid: 0, high: 0, energy: 0, beat: false };
const peaks = { bass: 0.3, mid: 0.3, high: 0.3 };
let bassAverage = 0;
let lastBeat = 0;

function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error("This browser can't analyse sound.");
    audioCtx = new AC();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.55;
    spectrum = new Uint8Array(analyser.frequencyBinCount);
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function stopLiveSource() {
  if (liveSource) {
    try { liveSource.stop(); } catch (e) { /* already stopped */ }
    liveSource = null;
  }
}

// ---------------------------------------------------------------- 1. demo beat
// A small techno loop at 124 BPM, synthesised from scratch:
// kick = a sine wave falling in pitch, hats and clap = filtered noise,
// bass = a sawtooth wave through a filter that opens and closes.
function startDemoBeat() {
  const ac = ensureAudio();
  stopLiveSource();
  const out = ac.createGain();
  out.gain.value = 0.55;
  out.connect(analyser);
  out.connect(ac.destination);

  const noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  const BPM = 124;
  const step = 60 / BPM / 4;                       // one sixteenth note
  const BASS = [0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 0];
  const ROOTS = [33, 33, 36, 31];                  // A, A, C, G (MIDI notes)
  const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);

  function kick(t) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + 0.42);
  }
  function hiss(t, type, freq, vol, length) {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noise;
    f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + length);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t, Math.random() * 0.5); s.stop(t + length + 0.02);
  }
  function bass(t, note) {
    const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
    o.type = "sawtooth"; o.frequency.value = hz(note);
    f.type = "lowpass"; f.Q.value = 8;
    f.frequency.setValueAtTime(220, t);
    f.frequency.exponentialRampToValueAtTime(1400, t + 0.03);
    f.frequency.exponentialRampToValueAtTime(220, t + step * 1.6);
    g.gain.setValueAtTime(0.32, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + step * 1.8);
    o.connect(f); f.connect(g); g.connect(out);
    o.start(t); o.stop(t + step * 2);
  }

  // The scheduler looks a little ahead and books notes with exact timestamps.
  let next = ac.currentTime + 0.06, n = 0;
  const timer = setInterval(() => {
    while (next < ac.currentTime + 0.15) {
      const s = n % 16, bar = Math.floor(n / 16);
      const breakdown = bar % 8 === 7;               // every 8th bar: drop the kick
      if (s % 4 === 0 && !breakdown) kick(next);
      if (s % 4 === 2) hiss(next, "highpass", 7000, 0.22, 0.18);    // open hat
      else if (s % 2 === 1) hiss(next, "highpass", 9000, 0.1, 0.04); // closed hat
      if ((s === 4 || s === 12) && !breakdown) hiss(next, "bandpass", 1600, 0.55, 0.16); // clap
      if (BASS[s]) bass(next, ROOTS[bar % 4]);
      next += step; n++;
    }
  }, 25);

  liveSource = {
    kind: "demo",
    label: "Demo beat · 124 BPM",
    stop() { clearInterval(timer); setTimeout(() => out.disconnect(), 400); },
  };
}

// ---------------------------------------------------------------- 2. your track
function startTrack(file) {
  const ac = ensureAudio();
  const el = new window.Audio();
  el.src = URL.createObjectURL(file);
  el.loop = true;
  const node = ac.createMediaElementSource(el);
  node.connect(analyser);
  node.connect(ac.destination);

  return el.play().then(() => {
    stopLiveSource();
    liveSource = {
      kind: "track",
      label: file.name.replace(/\.[^.]+$/, ""),
      stop() { el.pause(); node.disconnect(); URL.revokeObjectURL(el.src); },
      toggle() { if (el.paused) el.play(); else el.pause(); return !el.paused; },
    };
  }, () => {
    node.disconnect();
    throw new Error("This file couldn't be played here. MP3, M4A or WAV work best, on your GitHub page.");
  });
}

// ---------------------------------------------------------------- 3 + 4. tab or mic
// We only LISTEN to these. They are not sent to the speakers again,
// otherwise you'd hear everything twice.
function useStream(stream, kind, label) {
  const ac = ensureAudio();
  stopLiveSource();
  const node = ac.createMediaStreamSource(stream);
  node.connect(analyser);
  const src = {
    kind, label,
    stop() { stream.getTracks().forEach((t) => t.stop()); node.disconnect(); },
  };
  stream.getTracks().forEach((t) => t.addEventListener("ended", () => {
    if (liveSource === src) { liveSource = null; node.disconnect(); onSourceEnded(); }
  }));
  liveSource = src;
}

async function startTabCapture() {
  ensureAudio();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    throw new Error("Capturing a tab works in Chrome or Edge on a computer.");
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      selfBrowserSurface: "exclude",
      systemAudio: "include",
    });
  } catch (e) {
    if (e.name === "NotAllowedError") throw new Error("Sharing was cancelled or blocked here. On your GitHub page, pick the YouTube tab and allow it.");
    throw new Error("Tab capture isn't available in this browser.");
  }
  if (!stream.getAudioTracks().length) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error("No sound came through. Try again, choose the tab and switch on “Also share tab audio”.");
  }
  useStream(stream, "tab", "Shared tab");
}

async function startMic() {
  ensureAudio();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("This browser has no microphone access.");
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (e) {
    throw new Error("The microphone was blocked. Allow it in the browser, or use it on your GitHub page.");
  }
  useStream(stream, "mic", "Microphone");
}

// ---------------------------------------------------------------- analysis
function bandLevel(lo, hi) {
  const binHz = audioCtx.sampleRate / analyser.fftSize;
  const a = Math.max(1, Math.floor(lo / binHz));
  const b = Math.min(spectrum.length - 1, Math.ceil(hi / binHz));
  let sum = 0;
  for (let i = a; i <= b; i++) sum += spectrum[i];
  return sum / (b - a + 1) / 255;
}

// Call once per frame. Returns levels from 0 to 1, adapted to the track's volume.
function analyseAudio(now) {
  if (!liveSource || !analyser) {
    levels.bass *= 0.9; levels.mid *= 0.9; levels.high *= 0.9;
    levels.energy = (levels.bass + levels.mid + levels.high) / 3;
    levels.beat = false;
    return levels;
  }
  analyser.getByteFrequencyData(spectrum);
  const raw = { bass: bandLevel(30, 150), mid: bandLevel(150, 2000), high: bandLevel(2000, 10000) };

  for (const k of ["bass", "mid", "high"]) {
    // Automatic gain: compare with the loudest moment recently, so quiet
    // and loud tracks both fill the full 0..1 range.
    peaks[k] = Math.max(raw[k], peaks[k] * 0.996, 0.06);
    const v = Math.min(1, raw[k] / peaks[k]);
    levels[k] = v > levels[k] ? levels[k] * 0.3 + v * 0.7 : levels[k] * 0.86 + v * 0.14; // fast attack, slow release
  }
  levels.energy = (levels.bass + levels.mid + levels.high) / 3;

  bassAverage = bassAverage * 0.94 + raw.bass * 0.06;
  levels.beat = raw.bass > bassAverage * 1.22 && raw.bass > 0.28 && now - lastBeat > 0.26;
  if (levels.beat) lastBeat = now;
  return levels;
}
