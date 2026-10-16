import { useEffect, useRef, useState } from "react";
import { createStage } from "../engine/stage.js";
import { createHandTracker, startCamera } from "../engine/tracking.js";

export default function Stage({ onError }) {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [fps, setFps] = useState(0);

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
        stage.update(tracker.detectForVideo(video, performance.now()));
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
      <video ref={videoRef} className="preview" playsInline muted />
      <div className="hud">
        <strong>Handwave</strong>
        <span>{fps} fps</span>
      </div>
      {loading && <div className="status">Loading hand tracking...</div>}
      <p className="note">
        Your camera stays on your device. Nothing is recorded or uploaded.
      </p>
    </>
  );
}
