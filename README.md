# Glyph Atelier

Transcribing paintings into code. Upload a painting and the browser redraws it as letters, as halftone dots or as thousands of brush strokes. In **Live mode** it becomes fullscreen visuals that react to music, like the screens behind a DJ set.

**Live app:** _add your GitHub Pages link here_

## Why I built this
I'm a medical student learning to code. Medicine is full of images that are really data: X-rays, dermatoscopy photos, histology slides. Before training models on them, I wanted to understand at the pixel level what an image actually is to a computer. Transcribing paintings was the most enjoyable way to learn that.

## Three ways to transcribe a painting

| Style | Idea | Technique |
|---|---|---|
| **Glyphs** | Every patch of the painting becomes one character, heavier where it needs more ink. Your own text can be woven through it. | Downsampling, luminance, mapping values to a character ramp |
| **Halftone** | Like newspaper printing: a honeycomb of dots, bigger where it's darker. | Hexagonal grid, area-proportional radius (√) |
| **Strokes** | The painting is repainted with short strokes that follow its edges and forms. | Sobel edge filter, gradient direction rotated by 90°, layered rendering |

Plus:
- **Listen to the painting:** a playhead scans left to right. Height becomes pitch (pentatonic scale), brightness becomes volume, and warm colours open up the tone. Built with the Web Audio API.
- **Animate:** glyphs shimmer and ripple, dots pulse and strokes sway.
- **Hold to see original**, **Copy as text** (the glyph picture as plain text) and **Export image**.

## v2 · Live mode
Press **Play it with music** and the painting fills the screen and moves with the sound.

**Sound sources**
- **Demo beat:** a 124 BPM techno loop synthesised in code (kick, hats, clap, acid bass), so it works instantly.
- **Your track:** any MP3, M4A or WAV from your computer.
- **YouTube tab:** play a DJ set on YouTube (or SoundCloud, Spotify web) in another tab, click *YouTube tab*, choose that tab and switch on *Also share tab audio*. Works in Chrome and Edge on a computer. YouTube doesn't let websites read its audio directly, so the app listens to the tab instead.
- **Mic:** listens to the room, e.g. a speaker or a live set.

**How the music moves the picture**
The Web Audio API's analyser runs a Fast Fourier Transform 60 times a second and splits the sound into three bands:

| Band | Instruments | Effect |
|---|---|---|
| Bass 30–150 Hz | kick, bassline | the image pulses and zooms, letters and dots swell |
| Mid 150–2000 Hz | vocals, synths | waves move through the picture |
| High 2–10 kHz | hi-hats, cymbals | letters scramble, strokes jitter |

A **beat** is a sudden jump in bass above its recent average. Each beat triggers an RGB-split glitch and torn slices, and every 32 beats *Auto* switches the style. Levels adapt to the track's loudness (automatic gain), so quiet and loud songs both work.

**Looks and effects:** Neon (hue spins with the bass), Infrared, Ice, video-feedback trails, CRT scanlines and film grain.

**Safety:** strobe flashes are **off by default** and marked with a warning, because flashing light can trigger seizures in photosensitive people. If the system asks for reduced motion, pulsing is toned down.

**Keyboard:** `1` `2` `3` style · `L` look · `A` auto · `T` trails · `G` glitch · `F` fullscreen · `Space` play/pause · `H` hide controls · `Esc` exit.

## How it's built
Plain HTML, CSS and JavaScript on a `<canvas>`. No libraries, no build step.

```
index.html      page structure
style.css       design, named after pigments (Payne's grey, ultramarine, cadmium)
transcribe.js   the three styles: sample → map → draw
sound.js        sonification: "listen to the painting"
sample.js       a painting generated with code, used until you upload your own
app.js          studio controls, animation loop, upload, export
live-audio.js   v2: sound sources, demo beat synth, FFT analysis, beat detection
live.js         v2: fullscreen live visuals, looks, trails, glitch, controls
```

Every style follows the same three steps:
1. **Sample:** shrink the image to a small grid so the browser averages each cell's colour.
2. **Map:** turn each cell's brightness into something: a letter, a dot size, a stroke direction.
3. **Draw:** paint the result onto the canvas.

## What I learned
- An image is a grid of numbers, and brightness is a weighted sum of red, green and blue (0.21 R + 0.72 G + 0.07 B).
- Edges are where those numbers change fast. The Sobel filter is the same idea that sits at the start of image-analysis pipelines in radiology.
- Seeded random numbers make "random" art reproducible.
- Animation means redrawing about 60 times a second from the same data.
- Sound is also just numbers: the FFT turns a waveform into loudness per frequency, much like a spectrum in signal processing (ECG and EEG analysis use the same maths).
- Performance matters: effects that cost the most (the RGB split) now run only on beats.

## Run it locally
Open `index.html` in a browser. Your images never leave your computer.

## Next ideas
- Export the animation as a video
- Apply the edge filter to a public medical image dataset

## Author
Joanna (Asiek) Farnicka, medical student and doctoral researcher, Charité – Universitätsmedizin Berlin.
