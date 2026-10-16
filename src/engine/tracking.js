import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

const BASE = import.meta.env.BASE_URL;

export async function createHandTracker() {
  const vision = await FilesetResolver.forVisionTasks(`${BASE}wasm`);

  const options = (delegate) => ({
    baseOptions: {
      modelAssetPath: `${BASE}models/hand_landmarker.task`,
      delegate,
    },
    runningMode: "VIDEO",
    numHands: 2,
  });

  try {
    return await HandLandmarker.createFromOptions(vision, options("GPU"));
  } catch {
    // Some devices can't use the GPU path, so fall back to the CPU
    return await HandLandmarker.createFromOptions(vision, options("CPU"));
  }
}

export async function startCamera(video) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 1280, height: 720, facingMode: "user" },
    audio: false,
  });
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  return stream;
}
