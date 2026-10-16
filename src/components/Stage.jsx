import { useEffect, useRef, useState } from "react";
import { createStage } from "../engine/stage.js";
import { createHandTracker, startCamera } from "../engine/tracking.js";

const SPELLS = [
  { gesture: "point", icon: "☝️", name: "Wisp writing" },
  { gesture: "open", icon: "🖐️", name: "Witch fire" },
  { gesture: "horns", icon: "🤘", name: "Summon bats" },
];

export default function Stage({ onError }) {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const activeKey = useRef("");
  const [loading, setLoading] = useState(true);
  const [fps, setFps] = useState(0);
  const [active, setActive] = useState([]);

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let tracker = null;
    let stream = null;

    const stage = createStage(canvasRef.current);
    const onResize = () => stage.resize();
    window.addEventListener("resize", onResize);

    let lastVideoTime = -1;
    let frames = 0;
    let lastFpsTime = performance.now();

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const video = videoRef.current;

      // Only run detection when the camera has delivered a new frame
      if (
        video &&
        video.readyState >= 2 &&
        video.currentTime !== lastVideoTime
      ) {
        lastVideoTime = video.currentTime;
        const gestures = stage.update(
          tracker.detectForVideo(video, performance.now()),
        );

        // Only touch React state when the gestures actually change
        const key = gestures.join(",");
        if (key !== activeKey.current) {
          activeKey.current = key;
          setActive(gestures);
        }
      }
      stage.render();

      frames++;
      const now = performance.now();
      if (now - lastFpsTime >= 1000) {
        setFps(frames);
        frames = 0;
        lastFpsTime = now;
      }
    };

    (async () => {
      try {
        const t = await createHandTracker();
        if (cancelled) {
          t.close();
          return;
        }
        tracker = t;

        const s = await startCamera(videoRef.current);
        if (cancelled) {
          s.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = s;

        setLoading(false);
        loop();
      } catch (err) {
        if (!cancelled) onError(err);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      tracker?.close();
      stream?.getTracks().forEach((track) => track.stop());
      stage.dispose();
    };
  }, [onError]);

  return (
    <>
      <canvas ref={canvasRef} className="canvas" />
      <div className="vignette" />
      <video ref={videoRef} className="preview" playsInline muted />
      <div className="hud">
        <strong>Handwave</strong>
        <span>
          {active.length ? `${active.join(" + ")} · ` : ""}
          {fps} fps
        </span>
      </div>
      {loading && <div className="status">Loading hand tracking...</div>}

      <ul className="spells">
        {SPELLS.map((s) => (
          <li
            key={s.gesture}
            className={active.includes(s.gesture) ? "on" : ""}
          >
            <span aria-hidden="true">{s.icon}</span> {s.name}
          </li>
        ))}
      </ul>
      <p className="note">
        Your camera stays on your device. Nothing is recorded or uploaded.
      </p>
    </>
  );
}
