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
const STORM_DISTANCE = 0.5; // palms closer than this fraction of the screen width make lightning
const BOLT_POINTS = 16;
const CHARGE_TIME = 1.2; // seconds to fully charge a fireball

const ORANGE = new THREE.Color(0xff7a1a);
const AMBER = new THREE.Color(0xffc247);
const VIOLET = new THREE.Color(0xa66bff);
const GREEN = new THREE.Color(0x8cff5a);
const LIME = new THREE.Color(0xd4ff6a);
const ICE = new THREE.Color(0xbfe9ff);
const EMBER_RED = new THREE.Color(0xff3b1a);

const rnd = (a) => (Math.random() - 0.5) * 2 * a;

const jointGeometry = new THREE.SphereGeometry(0.045, 16, 16);
const tipGeometry = new THREE.SphereGeometry(0.075, 16, 16);
const boneGeometry = new THREE.CylinderGeometry(0.018, 0.018, 1, 8);
const orbGeometry = new THREE.SphereGeometry(1, 20, 20);
const orbMaterial = new THREE.MeshBasicMaterial({
  color: 0xffb347,
  fog: false,
});
const UP = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3();
const dir = new THREE.Vector3();
const burst = new THREE.Vector3();
const velocityNow = new THREE.Vector3();

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

  // Glowing ball that grows while you hold a fist
  const orb = new THREE.Mesh(orbGeometry, orbMaterial);
  orb.visible = false;
  group.add(orb);

  group.visible = false;
  return {
    group,
    joints,
    bones,
    orb,
    material,
    points: Array.from({ length: 21 }, () => new THREE.Vector3()),
    palm: new THREE.Vector3(),
    lastPalm: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    hasLast: false,
    seen: false,
    gesture: "none",
    prev: "none",
    pending: "none",
    pendingCount: 0,
    acc: 0,
    batTimer: 0,
    charge: 0,
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

export function createStage(canvas, audio) {
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

  const particles = new Particles(5000);
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

  // Lightning: three jagged lines redrawn every frame
  const boltMaterial = new THREE.LineBasicMaterial({
    color: 0xbfe9ff,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const bolts = [0, 1, 2].map(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(BOLT_POINTS * 3), 3),
    );
    const line = new THREE.Line(geometry, boltMaterial);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    return line;
  });

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

  // ---------- Fireballs ----------
  const fireballs = [];

  function launch(hand) {
    const mesh = new THREE.Mesh(orbGeometry, orbMaterial);
    const size = 0.1 + 0.18 * hand.charge;
    mesh.scale.setScalar(size);
    mesh.position.copy(hand.palm);
    scene.add(mesh);

    // Fly in the direction the hand was moving, always pushed away from the camera
    const vel = hand.vel.clone().multiplyScalar(1.2);
    vel.z -= 3.5;
    const speed = vel.length();
    if (speed > 9) vel.multiplyScalar(9 / speed);

    fireballs.push({ mesh, vel, age: 0, life: 2.2, size });
    audio?.whoosh();
  }

  function explode(p, size) {
    for (let n = 0; n < 160; n++) {
      burst.set(rnd(1), rnd(1), rnd(1));
      if (burst.lengthSq() < 1e-6) continue;
      burst.normalize().multiplyScalar(1 + Math.random() * 3);
      const r = Math.random();
      const color = r < 0.35 ? EMBER_RED : r < 0.7 ? ORANGE : AMBER;
      particles.emit(
        p.x,
        p.y,
        p.z,
        burst.x,
        burst.y,
        burst.z,
        0.6 + Math.random() * 0.8,
        color,
        0.2 + size,
        -0.8,
      );
    }
    audio?.boom();
  }

  function updateFireballs(dt) {
    for (let i = fireballs.length - 1; i >= 0; i--) {
      const f = fireballs[i];
      f.age += dt;
      f.mesh.position.addScaledVector(f.vel, dt);
      const p = f.mesh.position;

      for (let n = 0; n < 3; n++) {
        particles.emit(
          p.x + rnd(0.05),
          p.y + rnd(0.05),
          p.z + rnd(0.05),
          rnd(0.3),
          rnd(0.3),
          rnd(0.3),
          0.5 + Math.random() * 0.4,
          Math.random() < 0.5 ? ORANGE : AMBER,
          f.size * 1.4,
        );
      }

      const k = (CAMERA_Z - p.z) / CAMERA_Z;
      const offScreen =
        Math.abs(p.x) > planeW * 0.55 * k ||
        Math.abs(p.y) > planeH * 0.55 * k ||
        p.z < -9;
      if (f.age >= f.life || offScreen) {
        explode(p, f.size);
        scene.remove(f.mesh);
        fireballs.splice(i, 1);
      }
    }
  }

  // ---------- Lightning ----------
  function updateBolts(a, b) {
    bolts.forEach((line, n) => {
      const arr = line.geometry.attributes.position.array;
      for (let i = 0; i < BOLT_POINTS; i++) {
        const t = i / (BOLT_POINTS - 1);
        const jitter = Math.sin(t * Math.PI) * (n === 0 ? 0.25 : 0.4);
        arr[i * 3] = a.x + (b.x - a.x) * t + rnd(jitter);
        arr[i * 3 + 1] = a.y + (b.y - a.y) * t + rnd(jitter);
        arr[i * 3 + 2] = a.z + (b.z - a.z) * t + rnd(jitter * 0.5);
      }
      line.geometry.attributes.position.needsUpdate = true;
      line.visible = true;
    });
    for (let n = 0; n < 4; n++) {
      const t = Math.random();
      particles.emit(
        a.x + (b.x - a.x) * t + rnd(0.15),
        a.y + (b.y - a.y) * t + rnd(0.15),
        a.z + (b.z - a.z) * t,
        rnd(0.5),
        rnd(0.5),
        rnd(0.3),
        0.25,
        ICE,
        0.1,
      );
    }
  }

  // ---------- What each gesture does ----------
  function cast(hand, gesture, dt, storm) {
    const p = hand.points;
    const palm = hand.palm;

    // Letting go of a charged fist throws the fireball
    if (hand.prev === "fist" && gesture !== "fist") {
      if (hand.charge > 0.25) launch(hand);
      hand.charge = 0;
      hand.orb.visible = false;
    }

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
    } else if (gesture === "open" && !storm) {
      // Witch fire: green embers rising from the palm
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
      hand.batTimer -= dt;
      if (hand.batTimer <= 0) {
        bats.spawn(palm.x, palm.y + 0.2, palm.z);
        hand.batTimer = 0.1;
      }
    } else if (gesture === "fist") {
      // Fireball charging: the orb grows and sparks spiral in
      hand.charge = Math.min(1, hand.charge + dt / CHARGE_TIME);
      hand.orb.visible = true;
      hand.orb.position.copy(palm);
      hand.orb.scale.setScalar(0.05 + 0.2 * hand.charge);
      hand.acc += (40 + 120 * hand.charge) * dt;
      while (hand.acc >= 1) {
        hand.acc -= 1;
        const ox = rnd(0.5);
        const oy = rnd(0.5);
        const oz = rnd(0.3);
        particles.emit(
          palm.x + ox,
          palm.y + oy,
          palm.z + oz,
          -ox * 3,
          -oy * 3,
          -oz * 3,
          0.3,
          Math.random() < 0.5 ? ORANGE : AMBER,
          0.12,
        );
      }
    } else {
      hand.acc = 0;
    }
  }

  const spellOn = { point: false, open: false, horns: false, storm: false };
  function setSpell(name, on) {
    if (spellOn[name] !== on) {
      spellOn[name] = on;
      audio?.setSpellActive(name, on);
    }
  }

  let lastUpdate = performance.now();

  // Returns the active spells for the on-screen spell bar
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

    // Pass 1: positions, speed and gesture of each hand
    hands.forEach((hand, slot) => {
      const lm = assigned[slot];
      if (!lm) {
        hand.group.visible = false;
        hand.seen = false;
        hand.gesture = "none";
        hand.prev = "none";
        hand.pending = "none";
        hand.pendingCount = 0;
        hand.hasLast = false;
        hand.charge = 0;
        hand.orb.visible = false;
        hand.vel.set(0, 0, 0);
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

      const p = hand.points;
      hand.palm.set(
        (p[0].x + p[5].x + p[17].x) / 3,
        (p[0].y + p[5].y + p[17].y) / 3,
        (p[0].z + p[5].z + p[17].z) / 3,
      );
      if (hand.hasLast) {
        velocityNow
          .copy(hand.palm)
          .sub(hand.lastPalm)
          .divideScalar(Math.max(dt, 0.001));
        hand.vel.lerp(velocityNow, 0.4);
      }
      hand.lastPalm.copy(hand.palm);
      hand.hasLast = true;

      hand.seen = true;
      hand.group.visible = true;
      stableGesture(hand, classifyHand(lm));
    });

    // Two open palms close together make a storm
    const storm =
      hands.every((h) => h.seen && h.gesture === "open") &&
      hands[0].palm.distanceTo(hands[1].palm) < planeW * STORM_DISTANCE;

    // Pass 2: cast spells
    hands.forEach((hand) => {
      if (!hand.seen) return;
      cast(hand, hand.gesture, dt, storm);
      hand.prev = hand.gesture;
    });

    if (storm) updateBolts(hands[0].palm, hands[1].palm);
    else bolts.forEach((line) => (line.visible = false));

    // Sound
    const any = (g) => hands.some((h) => h.seen && h.gesture === g);
    setSpell("point", any("point"));
    setSpell("open", any("open") && !storm);
    setSpell("horns", any("horns"));
    setSpell("storm", storm);
    const maxCharge = Math.max(
      ...hands.map((h) => (h.seen && h.gesture === "fist" ? h.charge : 0)),
    );
    audio?.charge(maxCharge > 0.02 ? maxCharge : null);

    const gestures = hands.filter((h) => h.seen).map((h) => h.gesture);
    return storm
      ? [...gestures.filter((g) => g !== "open"), "storm"]
      : gestures;
  }

  let lastRender = performance.now();

  function render() {
    const now = performance.now();
    const dt = Math.min((now - lastRender) / 1000, 0.1);
    lastRender = now;
    updateFireballs(dt);
    particles.update(dt);
    bats.update(dt);
    composer.render();
  }

  function dispose() {
    Object.keys(spellOn).forEach((name) => setSpell(name, false));
    audio?.charge(null);
    fireballs.forEach((f) => scene.remove(f.mesh));
    hands.forEach((h) => h.material.dispose());
    particles.dispose();
    bats.dispose();
    bolts.forEach((line) => line.geometry.dispose());
    boltMaterial.dispose();
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
