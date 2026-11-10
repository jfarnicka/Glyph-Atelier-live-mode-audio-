/*
 * sound.js — "listen to the painting" (sonification).
 *
 * A playhead moves from left to right across the picture, like a music box.
 * The picture is cut into horizontal bands: the top band is the highest note,
 * the bottom band the lowest. Where a band is bright, its note is loud.
 * Warm colours (red/orange) open up the tone, cool colours (blue) make it softer.
 * Notes come from a pentatonic scale, so any picture sounds pleasant.
 */

const SOUND_BANDS = 15;
const SOUND_STEPS = 64;
const PENTATONIC = [0, 2, 4, 7, 9];

let audio = null; // the running performance, or null

// MIDI note number → frequency in Hz (A4 = note 69 = 440 Hz)
const noteToHz = (n) => 440 * Math.pow(2, (n - 69) / 12);

function playPainting(source, seconds) {
  stopPainting();
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) throw new Error("This browser can't play generated sound.");
  const ac = new AC();

  const grid = sampleImage(source, SOUND_STEPS, SOUND_BANDS, { brightness: 0, contrast: 0.4, invert: false });
  const master = ac.createGain();
  master.gain.value = 0.0001;
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 0.7;
  filter.connect(master);
  master.connect(ac.destination);

  const start = ac.currentTime + 0.1;
  const step = seconds / SOUND_STEPS;
  master.gain.setTargetAtTime(0.22, start, 0.2);

  const voices = [];
  for (let band = 0; band < SOUND_BANDS; band++) {
    // band 0 = bottom row = lowest note
    const degree = PENTATONIC[band % 5] + 12 * Math.floor(band / 5);
    const osc = ac.createOscillator();
    osc.type = band < 5 ? "sine" : "triangle";
    osc.frequency.value = noteToHz(45 + degree);
    const gain = ac.createGain();
    gain.gain.value = 0;
    const pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
    osc.connect(gain);
    if (pan) { gain.connect(pan); pan.connect(filter); } else gain.connect(filter);

    // Schedule every column in advance; the browser plays it with exact timing.
    const row = SOUND_BANDS - 1 - band;
    for (let col = 0; col < SOUND_STEPS; col++) {
      const cell = grid.cells[row * SOUND_STEPS + col];
      const loud = Math.pow(cell.lum, 2.2) / SOUND_BANDS * 2.4;
      gain.gain.setTargetAtTime(loud, start + col * step, step * 0.35);
      if (pan) pan.pan.setValueAtTime(-0.8 + (col / SOUND_STEPS) * 1.6, start + col * step);
    }
    osc.start(start);
    osc.stop(start + seconds + 0.6);
    voices.push(osc);
  }

  // Colour temperature per column steers the filter: warm = bright tone.
  for (let col = 0; col < SOUND_STEPS; col++) {
    let warm = 0;
    for (let row = 0; row < SOUND_BANDS; row++) {
      const c = grid.cells[row * SOUND_STEPS + col];
      warm += (c.r - c.b) / 255;
    }
    warm /= SOUND_BANDS;                       // about -1 (blue) … +1 (red)
    filter.frequency.setTargetAtTime(1400 + warm * 1100, start + col * step, step * 0.5);
  }
  master.gain.setTargetAtTime(0.0001, start + seconds, 0.15);

  audio = { ac, start, seconds, voices };
  return audio;
}

// 0..1 how far the playhead has travelled, or null when nothing plays.
function soundProgress() {
  if (!audio) return null;
  const p = (audio.ac.currentTime - audio.start) / audio.seconds;
  if (p > 1.02) { stopPainting(); return null; }
  return clamp(p, 0, 1);
}

function stopPainting() {
  if (!audio) return;
  try { audio.ac.close(); } catch (e) { /* already closed */ }
  audio = null;
}
