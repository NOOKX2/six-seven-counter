"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  PoseLandmarker,
  type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";
import AnimatedCounter from "@/components/AnimatedCounter";
import {
  SixSevenDetector,
  type DetectionStatus,
} from "@/lib/six-seven-detector";

const WASM_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

const STATUS_LABELS: Record<DetectionStatus, string> = {
  idle: "พร้อมเริ่ม",
  pose_missing: "ให้เห็นตัวและแขนทั้งสองข้างในกล้อง",
  ready: "ยกแขนสลับซ้าย-ขวาเหนือไหล่",
  left_up: "แขนซ้ายยกแล้ว!",
  right_up: "แขนขวายกแล้ว!",
  counted: "+1",
};

export default function SixSevenCounter() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const detectorRef = useRef(new SixSevenDetector());
  const animFrameRef = useRef<number>(0);
  const lastVideoTimeRef = useRef(-1);

  const [count, setCount] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<DetectionStatus>("idle");
  const [isFullscreen, setIsFullscreen] = useState(false);

  const showFullscreen = isFullscreen && isActive;

  const drawResults = useCallback(
    (result: PoseLandmarkerResult, width: number, height: number) => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, width, height);
      ctx.restore();

      for (const landmarks of result.landmarks) {
        ctx.beginPath();
        ctx.fillStyle = "rgba(255, 165, 0, 0.85)";
        for (const point of landmarks) {
          const x = (1 - point.x) * width;
          const y = point.y * height;
          ctx.moveTo(x + 3, y);
          ctx.arc(x, y, 3, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    },
    [],
  );

  const detectFrame = useCallback(() => {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !landmarker || video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(detectFrame);
      return;
    }

    if (video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      const result = landmarker.detectForVideo(video, performance.now());
      drawResults(result, video.videoWidth, video.videoHeight);

      const pose = result.landmarks[0] ?? null;
      const { counted, status: nextStatus } = detectorRef.current.process(pose);
      setStatus(nextStatus);

      if (counted) {
        setCount((c) => c + 1);
      }
    }

    animFrameRef.current = requestAnimationFrame(detectFrame);
  }, [drawResults]);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    const video = videoRef.current;
    if (video?.srcObject) {
      const stream = video.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    }
    setIsActive(false);
    setIsFullscreen(false);
    setStatus("idle");
  }, []);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      if (!landmarkerRef.current) {
        const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
        const options = {
          runningMode: "VIDEO" as const,
          numPoses: 1,
        };
        try {
          landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: MODEL_URL,
              delegate: "GPU",
            },
            ...options,
          });
        } catch {
          landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: MODEL_URL,
              delegate: "CPU",
            },
            ...options,
          });
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });

      const video = videoRef.current;
      if (!video) return;

      video.srcObject = stream;
      await video.play();

      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      detectorRef.current.reset();
      setIsActive(true);
      setStatus("ready");
      animFrameRef.current = requestAnimationFrame(detectFrame);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "ไม่สามารถเปิดกล้องได้";
      setError(message);
      stopCamera();
    } finally {
      setIsLoading(false);
    }
  }, [detectFrame, stopCamera]);

  const handleReset = () => {
    setCount(0);
    detectorRef.current.reset();
    setStatus(isActive ? "ready" : "idle");
  };

  useEffect(() => {
    if (!showFullscreen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showFullscreen]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      const video = videoRef.current;
      if (video?.srcObject) {
        const stream = video.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
      }
      landmarkerRef.current?.close();
    };
  }, []);

  const counterBlock = (
    <div className="text-center">
      <AnimatedCounter value={count} variant={showFullscreen ? "overlay" : "default"} />
      <p
        className={`mt-2 text-sm ${
          showFullscreen ? "text-white/80 drop-shadow" : "text-zinc-400"
        }`}
      >
        {STATUS_LABELS[status]}
      </p>
    </div>
  );

  return (
    <div
      className={
        showFullscreen
          ? "fixed inset-0 z-50"
          : "mx-auto flex w-full max-w-md flex-col gap-8 px-6 py-12"
      }
    >
      {!showFullscreen && (
        <header className="text-center">
          <p className="text-sm font-medium tracking-widest text-orange-400 uppercase">
            Six Seven
          </p>
          <h1 className="mt-1 text-4xl font-semibold tracking-tight">Counter</h1>
          <p className="mt-2 text-sm text-zinc-500">
            ยกแขนสลับซ้าย-ขวาเหนือไหล่ให้เร็วที่สุด
          </p>
        </header>
      )}

      <div
        className={`overflow-hidden bg-zinc-900 transition-shadow duration-300 ${
          showFullscreen
            ? "absolute inset-0"
            : "relative rounded-2xl"
        }`}
      >
        <video ref={videoRef} className="hidden" playsInline muted />
        <canvas
          ref={canvasRef}
          className={
            showFullscreen
              ? `absolute inset-0 h-full w-full object-cover ${isActive ? "block" : "hidden"}`
              : `aspect-4/3 w-full object-cover ${isActive ? "block" : "hidden"}`
          }
        />

        {!isActive && !showFullscreen && (
          <div className="flex aspect-4/3 flex-col items-center justify-center gap-3 bg-zinc-100 text-zinc-400">
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden
            >
              <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
            <span className="text-sm">กดเปิดกล้องเพื่อเริ่มนับ</span>
          </div>
        )}

        {isActive && showFullscreen && (
          <div className="pointer-events-none absolute inset-x-0 top-[18%] z-10">
            {counterBlock}
          </div>
        )}

        {isActive && (
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={showFullscreen ? "ออกจากโหมดเต็มจอ" : "โหมดเต็มจอ"}
            className={`absolute z-20 rounded-full text-white backdrop-blur-sm transition-colors ${
              showFullscreen
                ? "top-4 right-4 bg-black/50 p-2.5 hover:bg-black/70"
                : "top-3 right-3 bg-black/40 p-2 hover:bg-black/60"
            }`}
          >
            <svg
              width={showFullscreen ? 20 : 18}
              height={showFullscreen ? 20 : 18}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              {showFullscreen ? (
                <path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3" />
              ) : (
                <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
              )}
            </svg>
          </button>
        )}

        {showFullscreen && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/50 to-transparent px-6 pt-16 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <div className="pointer-events-auto flex gap-3">
              <button
                type="button"
                onClick={toggleFullscreen}
                className="flex-1 rounded-full border border-white/30 bg-black/30 py-3 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/50"
              >
                ย่อจอ
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="rounded-full border border-white/30 bg-black/30 px-6 py-3 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/50"
              >
                รีเซ็ต
              </button>
              <button
                type="button"
                onClick={stopCamera}
                className="rounded-full border border-white/30 bg-black/30 px-6 py-3 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/50"
              >
                หยุด
              </button>
            </div>
          </div>
        )}
      </div>

      {!showFullscreen && (
        <>
          {counterBlock}

          {error && (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-center text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            {isActive ? (
              <>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="flex-1 rounded-full border border-zinc-200 py-3 text-sm font-medium transition-colors hover:bg-zinc-50"
                >
                  หยุด
                </button>
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="rounded-full border border-zinc-200 px-5 py-3 text-sm font-medium transition-colors hover:bg-zinc-50"
                >
                  เต็มจอ
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={startCamera}
                disabled={isLoading}
                className="flex-1 rounded-full bg-zinc-900 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
              >
                {isLoading ? "กำลังโหลด…" : "เปิดกล้อง"}
              </button>
            )}
            <button
              type="button"
              onClick={handleReset}
              className="rounded-full border border-zinc-200 px-6 py-3 text-sm font-medium transition-colors hover:bg-zinc-50"
            >
              รีเซ็ต
            </button>
          </div>
        </>
      )}
    </div>
  );
}
