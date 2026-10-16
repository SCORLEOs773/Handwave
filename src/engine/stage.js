import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { HandLandmarker } from "@mediapipe/tasks-vision";
import { classifyHand } from "./gestures.js";
import { Bats, Particles, makeGlowTexture } from "./effects.js";

const HAND_COLORS = [0xa66bff, 0xff7a1a];
const FINGERTIPS = [4, 8, 12, 16, 20];
const CAMERA_Z = 6;
const FOV = 50;
const DEPTH_SCALE = 1.2;
const SMOOTHING = 0.55;
const MOON_DEPTH = 4;
const BG = 0x0d0716;

const ORANGE = new THREE.Color(0xff7a1a);
const AMBER = new THREE.Color(0xffc247);
const VIOLET = new THREE.Color(0xa66bff);
const GREEN = new THREE.Color(0x8cff5a);
const LIME = new THREE.Color(0xd4ff6a);

const rnd = (a) => (Math.random() - 0.5) * 2 * a;

const jointGeometry = new THREE.SphereGeometry(0.045, 16, 16);
const tipGeometry = new THREE.SphereGeometry(0.075, 16, 16);
const boneGeometry = new THREE.CylinderGeometry(0.018, 0.018, 1, 8);
const UP = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3();
const dir = new THREE.Vector3();
const palm = new THREE.Vector3();

function makeHand(color) {
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 1.6,
    roughness: 0.4,
  });
  const group = new THREE.Group();

  const joints = Array.from({ length: 21 }, (_, i) => {
    const mesh = new THREE.Mesh(
      FINGERTIPS.includes(i) ? tipGeometry : jointGeometry,
      material,
    );
    group.add(mesh);
    return mesh;
  });
  const bones = HandLandmarker.HAND_CONNECTIONS.map(() => {
    const mesh = new THREE.Mesh(boneGeometry, material);
    group.add(mesh);
    return mesh;
  });

  group.visible = false;
  return {
    group,
    joints,
    bones,
    material,
    points: Array.from({ length: 21 }, () => new THREE.Vector3()),
    seen: false,
    gesture: "none",
    pending: "none",
    pendingCount: 0,
    acc: 0,
    batTimer: 0,
  };
}

// Stretch a thin cylinder so it connects point a to point b
function placeBone(mesh, a, b) {
  dir.subVectors(b, a);
  const length = dir.length();
  if (length < 1e-6) return;
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.scale.set(1, length, 1);
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
}

// Only switch gesture after it has been seen for a few frames in a row (stops flicker)
function stableGesture(hand, raw) {
  if (raw === hand.pending) hand.pendingCount++;
  else {
    hand.pending = raw;
    hand.pendingCount = 1;
  }
  if (hand.pendingCount >= 3) hand.gesture = raw;
  return hand.gesture;
}

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.FogExp2(0x1a0d2e, 0.06);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.set(0, 0, CAMERA_Z);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const light = new THREE.DirectionalLight(0xffffff, 1.2);
  light.position.set(2, 3, 5);
  scene.add(light);

  const hands = HAND_COLORS.map(makeHand);
  hands.forEach((h) => scene.add(h.group));

  const particles = new Particles(4000);
  scene.add(particles.points);
  const bats = new Bats(scene);

  // Moon, its halo, and stars
  const glowTexture = makeGlowTexture();
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe2a8, fog: false }),
  );
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      opacity: 0.9,
    }),
  );
  halo.scale.set(6, 6, 1);
  scene.add(moon, halo);

  const starPositions = new Float32Array(250 * 3);
  for (let i = 0; i < 250; i++) {
    starPositions[i * 3] = rnd(12);
    starPositions[i * 3 + 1] = rnd(7);
    starPositions[i * 3 + 2] = -8 - Math.random() * 6;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(starPositions, 3),
  );
  const starMaterial = new THREE.PointsMaterial({
    color: 0xd9ccff,
    size: 0.04,
    transparent: true,
    opacity: 0.8,
    fog: false,
  });
  scene.add(new THREE.Points(starGeometry, starMaterial));

  // Bloom makes bright things glow
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(
    new UnrealBloomPass(new THREE.Vector2(1, 1), 0.9, 0.6, 0.25),
  );
  composer.addPass(new OutputPass());

  let planeW = 1;
  let planeH = 1;

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    planeH = 2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * CAMERA_Z;
    planeW = planeH * camera.aspect;

    // Keep the moon in the upper right whatever the window shape
    const k = (CAMERA_Z + MOON_DEPTH) / CAMERA_Z;
    moon.position.set(0.3 * planeW * k, 0.3 * planeH * k, -MOON_DEPTH);
    halo.position.set(moon.position.x, moon.position.y, -MOON_DEPTH - 0.1);

    particles.setScale(
      (h * renderer.getPixelRatio()) /
        (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2))),
    );
  }
  resize();

  function toWorld(p) {
    return tmp.set(
      (0.5 - p.x) * planeW,
      (0.5 - p.y) * planeH,
      -p.z * planeW * DEPTH_SCALE,
    );
  }

  // What each gesture does
  function cast(hand, gesture, dt) {
    const p = hand.points;

    if (gesture === "point") {
      // Wisp writing: sparks left behind the fingertip
      hand.acc += 90 * dt;
      while (hand.acc >= 1) {
        hand.acc -= 1;
        particles.emit(
          p[8].x + rnd(0.03),
          p[8].y + rnd(0.03),
          p[8].z + rnd(0.03),
          rnd(0.15),
          0.1 + rnd(0.1),
          rnd(0.1),
          1.3 + Math.random() * 0.8,
          Math.random() < 0.5 ? ORANGE : VIOLET,
          0.16,
        );
      }
    } else if (gesture === "open") {
      // Witch fire: green embers rising from the palm
      palm.set(
        (p[0].x + p[5].x + p[17].x) / 3,
        (p[0].y + p[5].y + p[17].y) / 3,
        (p[0].z + p[5].z + p[17].z) / 3,
      );
      hand.acc += 140 * dt;
      while (hand.acc >= 1) {
        hand.acc -= 1;
        particles.emit(
          palm.x + rnd(0.25),
          palm.y + rnd(0.1),
          palm.z + rnd(0.15),
          rnd(0.5),
          0.6 + Math.random() * 1.2,
          rnd(0.3),
          1 + Math.random() * 0.8,
          Math.random() < 0.7 ? GREEN : LIME,
          0.14,
          0.6,
        );
      }
    } else if (gesture === "horns") {
      // Summon bats
      palm.set(
        (p[0].x + p[5].x + p[17].x) / 3,
        (p[0].y + p[5].y + p[17].y) / 3,
        (p[0].z + p[5].z + p[17].z) / 3,
      );
      hand.batTimer -= dt;
      if (hand.batTimer <= 0) {
        bats.spawn(palm.x, palm.y + 0.2, palm.z);
        hand.batTimer = 0.1;
      }
    } else {
      hand.acc = 0;
    }
  }

  let lastUpdate = performance.now();

  // Returns the gesture of each visible hand, for the on-screen spell bar
  function update(result) {
    const now = performance.now();
    const dt = Math.min((now - lastUpdate) / 1000, 0.1);
    lastUpdate = now;

    const landmarks = result?.landmarks ?? [];

    // Keep each hand in the same colour slot using its Left/Right label
    const assigned = [null, null];
    const used = [false, false];
    landmarks.forEach((lm, i) => {
      const label = result.handedness?.[i]?.[0]?.categoryName;
      let slot = label === "Left" ? 0 : 1;
      if (used[slot]) slot = 1 - slot;
      used[slot] = true;
      assigned[slot] = lm;
    });

    const gestures = [];
    hands.forEach((hand, slot) => {
      const lm = assigned[slot];
      if (!lm) {
        hand.group.visible = false;
        hand.seen = false;
        hand.gesture = "none";
        hand.pending = "none";
        hand.pendingCount = 0;
        return;
      }

      for (let j = 0; j < 21; j++) {
        const target = toWorld(lm[j]);
        if (hand.seen) hand.points[j].lerp(target, SMOOTHING);
        else hand.points[j].copy(target);
        hand.joints[j].position.copy(hand.points[j]);
      }
      HandLandmarker.HAND_CONNECTIONS.forEach(({ start, end }, k) => {
        placeBone(hand.bones[k], hand.points[start], hand.points[end]);
      });
      hand.seen = true;
      hand.group.visible = true;

      const gesture = stableGesture(hand, classifyHand(lm));
      gestures.push(gesture);
      cast(hand, gesture, dt);
    });

    return gestures;
  }

  let lastRender = performance.now();

  function render() {
    const now = performance.now();
    const dt = Math.min((now - lastRender) / 1000, 0.1);
    lastRender = now;
    particles.update(dt);
    bats.update(dt);
    composer.render();
  }

  function dispose() {
    hands.forEach((h) => h.material.dispose());
    particles.dispose();
    bats.dispose();
    moon.geometry.dispose();
    moon.material.dispose();
    halo.material.dispose();
    glowTexture.dispose();
    starGeometry.dispose();
    starMaterial.dispose();
    composer.dispose?.();
    renderer.dispose();
  }

  return { update, render, resize, dispose };
}
