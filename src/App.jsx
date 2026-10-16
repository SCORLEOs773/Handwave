import { useCallback, useEffect, useState } from "react";
import Stage from "./components/Stage.jsx";
import { createAudio } from "./engine/audio.js";

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
  const [audio, setAudio] = useState(null);

  // Stops the music when the sound engine is replaced or the page closes
  useEffect(() => () => audio?.dispose(), [audio]);

  const handleError = useCallback((err) => {
    console.error(err);
    setError(friendlyError(err));
    setAudio(null);
    setPhase("error");
  }, []);

  function start() {
    let a = null;
    try {
      a = createAudio();
      a.start();
    } catch (err) {
      console.error("Audio unavailable", err);
      a = null;
    }
    setAudio(a);
    setPhase("running");
  }

  if (phase === "running") return <Stage onError={handleError} audio={audio} />;

  return (
    <main className="screen">
      <div>
        <h1>Handwave</h1>
        {phase === "error" ? (
          <p role="alert">{error}</p>
        ) : (
          <>
            <p>
              Cast spells with your bare hands. Everything runs in your browser,
              and your camera never leaves your device.
            </p>
            <p className="tip">
              Stand back so both hands are in view, with some light on them.
              Turn your sound on.
            </p>
          </>
        )}
        <button className="btn" onClick={start}>
          {phase === "error" ? "Try again" : "Enter"}
        </button>
      </div>
    </main>
  );
}
