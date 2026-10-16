import { useState } from "react";
import Stage from "./components/Stage.jsx";

function friendlyError(err) {
  switch (err?.name) {
    case "NotAllowedError":
      return "Camera access was blocked. Allow the camera in your browser's address bar, then try again.";
    case "NotFoundError":
      return "No camera was found on this device.";
    case "NotReadableError":
      return "Your camera is being used by another app. Close it and try again.";
    default:
      return "Something went wrong starting hand tracking.";
  }
}

export default function App() {
  const [phase, setPhase] = useState("intro"); // intro | running | error
  const [error, setError] = useState("");

  function handleError(err) {
    console.error(err);
    setError(friendlyError(err));
    setPhase("error");
  }

  if (phase === "running") return <Stage onError={handleError} />;

  return (
    <main className="screen">
      <div>
        <h1>Handwave</h1>
        {phase === "error" ? (
          <p role="alert">{error}</p>
        ) : (
          <p>
            Control a 3D world with your bare hands. Everything runs in your
            browser, and your camera never leaves your device.
          </p>
        )}
        <button className="btn" onClick={() => setPhase("running")}>
          {phase === "error" ? "Try again" : "Start"}
        </button>
      </div>
    </main>
  );
}
