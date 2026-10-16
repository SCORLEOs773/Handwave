// Landmark indices: 0 wrist, 4 thumb tip, 8 index tip, 9 middle knuckle,
// 12 middle tip, 16 ring tip, 20 pinky tip

const ASPECT = 16 / 9; // the camera is requested at 1280x720

const dist = (a, b) => Math.hypot((a.x - b.x) * ASPECT, a.y - b.y);

// finger name -> [tip, middle joint]
const FINGERS = {
  index: [8, 6],
  middle: [12, 10],
  ring: [16, 14],
  pinky: [20, 18],
};

// A finger counts as extended when its tip is farther from the wrist than its middle joint
const EXTEND_MARGIN = 1.08;
const PINCH_RATIO = 0.3;

export function classifyHand(lm) {
  const wrist = lm[0];
  const handSize = dist(wrist, lm[9]) || 1;

  if (dist(lm[4], lm[8]) / handSize < PINCH_RATIO) return "pinch";

  const up = {};
  for (const [name, [tip, joint]] of Object.entries(FINGERS)) {
    up[name] = dist(wrist, lm[tip]) > dist(wrist, lm[joint]) * EXTEND_MARGIN;
  }

  const count = Object.values(up).filter(Boolean).length;
  if (count === 4) return "open";
  if (count === 0) return "fist";
  if (up.index && !up.middle && !up.ring && !up.pinky) return "point";
  if (up.index && up.pinky && !up.middle && !up.ring) return "horns";
  return "none";
}
