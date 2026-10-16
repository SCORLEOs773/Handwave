import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { HandLandmarker } from "@mediapipe/tasks-vision";

const HAND_COLORS = [0x7cf5ff, 0xff7ad9];
const FINGERTIPS = [4, 8, 12, 16, 20];
const CAMERA_Z = 6;
const FOV = 50;
const DEPTH_SCALE = 1.2; // how strongly hand depth shows in 3D
const SMOOTHING = 0.55; // 0 = very smooth and laggy, 1 = raw and jittery

const jointGeometry = new THREE.SphereGeometry(0.045, 16, 16);
const tipGeometry = new THREE.SphereGeometry(0.075, 16, 16);
const boneGeometry = new THREE.CylinderGeometry(0.018, 0.018, 1, 8);
const UP = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3();
const dir = new THREE.Vector3();

function makeHand(color) {
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 1.8,
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

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x090b14);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.set(0, 0, CAMERA_Z);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const light = new THREE.DirectionalLight(0xffffff, 1.2);
  light.position.set(2, 3, 5);
  scene.add(light);

  const hands = HAND_COLORS.map(makeHand);
  hands.forEach((h) => scene.add(h.group));

  // Bloom makes bright things glow
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.9, 0.6, 0.2));
  composer.addPass(new OutputPass());

  // Size of the visible area at z = 0, used to map the camera image into the scene
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
  }
  resize();

  // Camera image coordinates (0-1, top-left origin) -> 3D scene, mirrored like a selfie
  function toWorld(p) {
    return tmp.set(
      (0.5 - p.x) * planeW,
      (0.5 - p.y) * planeH,
      -p.z * planeW * DEPTH_SCALE,
    );
  }

  function update(result) {
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

    hands.forEach((hand, slot) => {
      const lm = assigned[slot];
      if (!lm) {
        hand.group.visible = false;
        hand.seen = false;
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
    });
  }

  function render() {
    composer.render();
  }

  function dispose() {
    hands.forEach((h) => h.material.dispose());
    composer.dispose?.();
    renderer.dispose();
  }

  return { update, render, resize, dispose };
}
