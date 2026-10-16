import { cpSync, existsSync, mkdirSync } from "node:fs";

const from = "node_modules/@mediapipe/tasks-vision/wasm";
const to = "public/wasm";

if (existsSync(from)) {
  mkdirSync("public", { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log("Copied MediaPipe WASM files to public/wasm");
} else {
  console.warn("MediaPipe WASM files not found. Run npm install first.");
}
