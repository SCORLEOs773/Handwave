# Handwave

> Cast Halloween spells with your bare hands. Runs entirely in your browser.

![React + Vite](https://img.shields.io/badge/React-Vite-61DAFB?logo=react&logoColor=white)
![three.js](https://img.shields.io/badge/three.js-WebGL-000000?logo=threedotjs&logoColor=white)
![MediaPipe](https://img.shields.io/badge/MediaPipe-Hand%20Tracking-0097A7)
![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)

**Live demo:** [Handwave](https://handwave.mykeyman777.workers.dev/)

Handwave turns your webcam into a spellbook. Hold up your hands and they appear as glowing 3D skeletons under a moonlit Halloween sky. Point, open your palm, throw the horns, make a fist or bring your hands together to cast spells, each with its own visuals and sound, over a haunting background soundtrack.

There is no sign-up and nothing to install. Open the link, allow the camera, and play.

> **Privacy:** your camera feed is processed locally in your browser. There is no backend, nothing is recorded, and nothing is uploaded.

<!--
Add screenshots or a short GIF to docs/ and uncomment.
![Handwave demo](docs/demo.gif)
![Fireball](docs/fireball.png)
-->

## Spells

| Gesture | Spell | What happens |
|---|---|---|
| Point with your index finger | **Wisp writing** | Your fingertip leaves a trail of glowing orange and violet sparks you can write with in the air |
| Open palm | **Witch fire** | Toxic green embers rise from your palm, with a crackling fire sound |
| Index and pinky up ("horns") | **Summon bats** | A swarm of flapping bats flies out of your hand |
| Hold a fist, then open and flick | **Fireball** | An orb charges in your fist, growing the longer you hold. Release it with a flick to throw it. It explodes with a boom |
| Both open palms close together | **Storm** | Lightning arcs between your hands |

Every spell has its own sound effect, and a generative soundtrack of drones, wind and music-box bells plays throughout. There is a sound on/off button in the corner.

**Tips for the best experience:** use a laptop or desktop with a webcam, stand back so both hands are in view, and keep some light on your hands.

## Features

- Real-time two-hand tracking with 21 landmarks per hand, running locally with MediaPipe
- Five gesture-driven spells with custom particle effects, bats, a fireball and lightning
- Gesture recognition with smoothing and short stabilisation to prevent flicker
- Atmospheric 3D scene: moon, stars, haze and a bloom glow effect
- All audio synthesised live with the Web Audio API, so there are no audio files
- Spell bar that lights up as you cast, so players learn the gestures without a tutorial
- Friendly error messages for blocked cameras, missing cameras and busy devices
- Fully static site that is free to host

## How it works

1. **Capture.** The webcam stream feeds MediaPipe's Hand Landmarker, which returns 21 3D points per hand each frame.
2. **Smooth.** Points are smoothed between frames so the skeletons do not jitter.
3. **Recognise.** Gestures are classified from finger geometry: a finger counts as extended when its tip is farther from the wrist than its middle joint, and a pinch is measured relative to hand size. A gesture must hold for a few frames before it counts.
4. **Cast.** Each gesture triggers a spell: particle emitters, bats, a charging orb and thrown fireball, or a lightning bolt between the palms.
5. **Render.** three.js draws the scene and a bloom pass makes bright elements glow.
6. **Sound.** The Web Audio API generates the background music and spell sounds on the fly.

## Tech stack

| Area | Technology |
|---|---|
| UI | React, Vite |
| 3D and effects | three.js (custom particle shaders, bloom post-processing) |
| Hand tracking | MediaPipe Tasks Vision (Hand Landmarker), self-hosted WASM and model |
| Audio | Web Audio API (synthesised music and effects) |
| Fonts | Pirata One, Instrument Sans (Google Fonts) |
| Hosting | Cloudflare Pages (any static host works) |

## Project structure

```
Handwave/
├── public/
│   ├── models/
│   │   └── hand_landmarker.task    Hand tracking model
│   ├── wasm/                       MediaPipe engine (generated on install)
│   ├── _headers                    Long-term caching for the model and engine
│   └── og.png                      Social preview image
├── scripts/
│   └── copy-wasm.mjs               Copies the MediaPipe engine into public/
├── src/
│   ├── components/
│   │   └── Stage.jsx               Canvas, camera, spell bar and sound button
│   ├── engine/
│   │   ├── tracking.js             Camera and hand tracker setup
│   │   ├── gestures.js             Gesture classification
│   │   ├── stage.js                3D scene, hands and spells
│   │   ├── effects.js              Particles, bats and glow textures
│   │   └── audio.js                Music and sound effects
│   ├── App.jsx                     Intro screen and app state
│   ├── main.jsx
│   └── index.css
├── index.html
├── package.json
├── LICENSE
└── README.md
```

The `engine/` folder is plain JavaScript with no React, so the real-time loop never triggers React re-renders.

## Getting started

### Prerequisites

- Node.js 20 or newer
- A webcam
- A modern browser with WebGL2 (recent Chrome, Edge, Firefox or Safari)

### Run locally

```bash
git clone https://github.com/SCORLEOs773/Handwave.git
cd Handwave
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`), click **Enter**, and allow camera access. Browsers only allow camera access on `localhost` or HTTPS.

`npm install` automatically runs a `postinstall` script that copies the MediaPipe engine files from `node_modules` into `public/wasm`.

### Build for production

```bash
npm run build
npm run preview
```

### Troubleshooting

| Problem | Fix |
|---|---|
| Console error about `.wasm` or `/wasm` | Run `npm run postinstall` to regenerate `public/wasm` |
| Error loading `hand_landmarker.task` | Check that `public/models/hand_landmarker.task` exists. If missing, re-download it from the [MediaPipe Hand Landmarker docs](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker) |
| "Camera access was blocked" | Allow the camera in your browser's address bar, then press Try again |
| Hands are not detected | Improve the lighting and keep both hands fully in frame |
| No sound | Make sure you clicked **Enter**, because browsers only allow audio after a click. Check the Sound button is on |
| Low frame rate | Close other camera or GPU-heavy apps, or lower the particle count and bloom strength |

## Tuning

Most of the feel of the experience lives in a few constants.

| What | Where | Constant |
|---|---|---|
| How strict finger detection is | `src/engine/gestures.js` | `EXTEND_MARGIN`, `PINCH_RATIO` |
| How steady the hands feel | `src/engine/stage.js` | `SMOOTHING` |
| How much depth shows in 3D | `src/engine/stage.js` | `DEPTH_SCALE` |
| Fireball charge time | `src/engine/stage.js` | `CHARGE_TIME` |
| How close palms must be for lightning | `src/engine/stage.js` | `STORM_DISTANCE` |
| Music and effect loudness | `src/engine/audio.js` | `music.gain`, `sfx.gain`, `LOOP_LEVEL` |

## Deployment

Handwave is a static site, so any static host works. The hand tracking engine and model add up to roughly 17 MB on a first visit, so choose a host with generous bandwidth. This project uses Cloudflare Pages.

1. Push the repository to GitHub.
2. In Cloudflare, create a Pages project and connect the repository.
3. Use these settings:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Environment variable (if needed):** `NODE_VERSION` = `22`
4. Deploy. Cloudflare runs `npm install`, which triggers the `postinstall` script that copies the engine files.

`public/_headers` sets long-term caching for `/wasm/*` and `/models/*`, so returning visitors do not re-download them. Cloudflare Pages has a 25 MiB limit per file, and the largest file here is well under that. Check your host's current free-plan limits before relying on them.

## Roadmap

- [x] Hand tracking with glowing 3D hands
- [x] Gesture recognition and five spells
- [x] Generative background music and spell sounds
- [ ] Touch-friendly layout and performance mode for phones
- [ ] More spells (summon a ghost, freeze time, shape-drawing runes)
- [ ] Record and share a short clip of your casting
- [ ] Gesture calibration for different hand sizes and lighting
- [ ] Non-Halloween themes

## Contributing

Ideas and pull requests are welcome. If you find a gesture that misfires, open an issue with your lighting setup and which gesture it confused.

## License

MIT. See [LICENSE](LICENSE).

## Acknowledgements

[three.js](https://threejs.org), [MediaPipe](https://ai.google.dev/edge/mediapipe), [Vite](https://vite.dev), and the Pirata One and Instrument Sans typefaces from [Google Fonts](https://fonts.google.com).
