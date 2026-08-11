"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Settings2 } from "lucide-react";
import {
  computeRunningCount,
  createManualCard,
  detectCardsInFrame,
  DetectionTracker,
  formatRunningCount,
  type DetectedCard,
  type FrameDetection,
  type VisionStatus,
  VISION_RANKS,
  VISION_SUITS,
} from "@/lib/visionCount";

type VisionCountProps = {
  onBack: () => void;
};

type CameraError = "denied" | "not_found" | "unsupported" | "unknown";

function statusLabel(
  status: VisionStatus,
  scanning: boolean,
  hasConfirmed: boolean,
  hasUncertain: boolean,
  hasAnyLive: boolean
): string {
  if (status === "permission_required") return "Camera Permission Required";
  if (status === "no_camera") return "No Camera Available";
  if (scanning && hasConfirmed) return "Card Confirmed";
  if (scanning && hasUncertain) return "Card Detected (Confirming…)";
  if (scanning && !hasAnyLive) return "Scanning — No Cards Found";
  if (scanning) return "Scanning";
  if (status === "detected") return "Card Detected";
  if (status === "ready") return "Camera Ready";
  return "Camera Ready";
}

function statusClass(status: VisionStatus, scanning: boolean): string {
  if (status === "permission_required" || status === "no_camera") return "vision-status-warn";
  if (scanning) return "vision-status-scan";
  if (status === "detected") return "vision-status-hit";
  return "vision-status-ready";
}

export function VisionCount({ onBack }: VisionCountProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const processCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const processCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const trackerRef = useRef(new DetectionTracker());
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const scanningRef = useRef(false);

  const [cameraReady, setCameraReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<CameraError | null>(null);
  const [detectedCards, setDetectedCards] = useState<DetectedCard[]>([]);
  const [liveDetections, setLiveDetections] = useState<FrameDetection[]>([]);
  const [lastConfidence, setLastConfidence] = useState<number | null>(null);
  const [editCardId, setEditCardId] = useState<string | null>(null);
  const [editRank, setEditRank] = useState("A");
  const [editSuit, setEditSuit] = useState("♠");

  const runningCount = useMemo(() => computeRunningCount(detectedCards), [detectedCards]);

  const hasConfirmedLive = liveDetections.some((d) => d.confirmed);
  const hasUncertainLive = liveDetections.some((d) => !d.confirmed);
  const hasAnyLive = liveDetections.length > 0;

  const visionStatus: VisionStatus = useMemo(() => {
    if (cameraError === "denied") return "permission_required";
    if (cameraError === "not_found" || cameraError === "unsupported") return "no_camera";
    if (scanning && hasConfirmedLive) return "detected";
    if (scanning) return "scanning";
    if (cameraReady) return "ready";
    return "idle";
  }, [cameraError, cameraReady, hasConfirmedLive, scanning]);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const initCamera = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("unsupported");
      setCameraReady(false);
      return;
    }

    stopStream();
    setCameraError(null);
    setCameraReady(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
        setCameraReady(true);
      }
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setCameraError("denied");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setCameraError("not_found");
      } else {
        setCameraError("unknown");
      }
      setCameraReady(false);
    }
  }, [stopStream]);

  useEffect(() => {
    initCamera();
    return () => {
      scanningRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      stopStream();
    };
  }, [initCamera, stopStream]);

  const drawOverlay = useCallback((detections: FrameDetection[], video: HTMLVideoElement) => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const rect = video.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const det of detections) {
      const x = det.bbox.x * canvas.width;
      const y = det.bbox.y * canvas.height;
      const w = det.bbox.w * canvas.width;
      const h = det.bbox.h * canvas.height;
      const confirmed = det.confirmed;
      ctx.strokeStyle = confirmed ? "rgba(212, 175, 55, 0.95)" : "rgba(160, 160, 160, 0.75)";
      ctx.lineWidth = confirmed ? 2 : 1.5;
      ctx.setLineDash(confirmed ? [] : [5, 4]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
      const state = confirmed ? "" : " ?";
      const label = `${det.rank}${det.suit}${state} ${det.confidence}%`;
      ctx.font = "600 11px DM Sans, system-ui, sans-serif";
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = confirmed ? "rgba(26, 20, 16, 0.82)" : "rgba(40, 40, 40, 0.78)";
      ctx.fillRect(x, Math.max(0, y - 18), tw + 10, 16);
      ctx.fillStyle = confirmed ? "#f4e4a6" : "#d0d0d0";
      ctx.fillText(label, x + 5, Math.max(12, y - 6));
    }
  }, []);

  const scanLoop = useCallback(() => {
    if (!scanningRef.current) return;
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }

    if (!processCanvasRef.current) {
      processCanvasRef.current = document.createElement("canvas");
      processCtxRef.current = processCanvasRef.current.getContext("2d", { willReadFrequently: true });
    }

    const processCanvas = processCanvasRef.current;
    const processCtx = processCtxRef.current;
    if (!processCtx) {
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }

    try {
      const frameDetections = detectCardsInFrame(video, processCanvas, processCtx);
      const newlyRegistered = trackerRef.current.processFrame(frameDetections);
      const active = trackerRef.current.getActiveDetections();

      setLiveDetections(active);
      if (active.length) setLastConfidence(Math.max(...active.map((d) => d.confidence)));
      else if (!scanningRef.current) setLastConfidence(null);

      if (newlyRegistered.length) {
        setDetectedCards((prev) => [...prev, ...newlyRegistered]);
      }

      drawOverlay(active, video);
    } catch {
      /* safe no-op on detection failures */
    }

    rafRef.current = requestAnimationFrame(scanLoop);
  }, [drawOverlay]);

  const startScanning = () => {
    if (!cameraReady || cameraError) return;
    scanningRef.current = true;
    setScanning(true);
    rafRef.current = requestAnimationFrame(scanLoop);
  };

  const stopScanning = () => {
    scanningRef.current = false;
    setScanning(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setLiveDetections([]);
    const canvas = overlayRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleReset = () => {
    stopScanning();
    trackerRef.current.reset();
    setDetectedCards([]);
    setLiveDetections([]);
    setLastConfidence(null);
    setEditCardId(null);
  };

  const openEdit = (card: DetectedCard) => {
    setEditCardId(card.id);
    setEditRank(card.rank);
    setEditSuit(card.suit);
  };

  const applyEdit = () => {
    if (!editCardId) return;
    setDetectedCards((prev) =>
      prev.map((c) =>
        c.id === editCardId
          ? createManualCard(editRank, editSuit, c.id)
          : c
      )
    );
    setEditCardId(null);
  };

  const removeCard = (id: string) => {
    setDetectedCards((prev) => prev.filter((c) => c.id !== id));
    if (editCardId === id) setEditCardId(null);
  };

  const detectedSummary = detectedCards.length
    ? detectedCards.map((c) => c.label).join(" ")
    : "No cards yet";

  return (
    <section className="screen panel-screen vision-count-screen">
      <button type="button" className="back-link" onClick={onBack}>
        ← Trainer
      </button>

      <div className="panel-header">
        <span className="eyebrow">Vision Count</span>
        <h1>Vision Count</h1>
        <p className="text-muted">
          Use your camera to identify playing cards and practice keeping an accurate count.
        </p>
      </div>

      <div className="vision-count-instructions cream-panel">
        <p>Point your camera at playing cards.</p>
        <p>Vision Count will identify the cards and track your running count.</p>
      </div>

      <div className={`vision-status-pill ${statusClass(visionStatus, scanning)}`}>
        {statusLabel(visionStatus, scanning, hasConfirmedLive, hasUncertainLive, hasAnyLive)}
      </div>

      <div className="vision-count-layout">
        <div className="vision-camera-wrap">
          {cameraError === "denied" && (
            <div className="vision-camera-fallback cream-panel">
              <strong>Camera access is blocked</strong>
              <p className="text-muted">
                Allow camera access in your browser or device settings to scan cards.
              </p>
              <button type="button" className="btn-secondary" onClick={() => void initCamera()}>
                <Settings2 size={16} /> Try Again
              </button>
              <p className="vision-settings-hint text-muted">
                On mobile: Settings → Browser → Camera → Allow
              </p>
            </div>
          )}

          {cameraError === "not_found" && (
            <div className="vision-camera-fallback cream-panel">
              <strong>No camera found</strong>
              <p className="text-muted">This device does not expose a camera. Manual correction is still available below.</p>
            </div>
          )}

          {cameraError === "unsupported" && (
            <div className="vision-camera-fallback cream-panel">
              <strong>Camera not supported</strong>
              <p className="text-muted">Your browser does not support live camera capture.</p>
            </div>
          )}

          {!cameraError && (
            <div className="vision-camera-stage">
              <video
                ref={videoRef}
                className="vision-camera-video"
                playsInline
                muted
                autoPlay
              />
              <canvas ref={overlayRef} className="vision-camera-overlay" aria-hidden="true" />
            </div>
          )}

          <div className="vision-camera-actions">
            {!scanning ? (
              <button
                type="button"
                className="btn-primary"
                onClick={startScanning}
                disabled={!cameraReady || !!cameraError}
              >
                Start Scanning
              </button>
            ) : (
              <button type="button" className="btn-secondary" onClick={stopScanning}>
                Stop Scanning
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={handleReset}>
              <RotateCcw size={16} /> Reset
            </button>
          </div>
        </div>

        <div className="vision-count-side">
          <div className="vision-running-count cream-panel">
            <span className="eyebrow">Running Count (Hi-Lo)</span>
            <strong>{formatRunningCount(runningCount)}</strong>
          </div>

          <div className="vision-detected-panel cream-panel">
            <span className="eyebrow">Detected Cards</span>
            <p className="vision-detected-summary">{detectedSummary}</p>
            {detectedCards.length > 0 && (
              <ul className="vision-detected-list">
                {detectedCards.map((card) => (
                  <li key={card.id}>
                    <span>
                      {card.label}
                      {card.manual ? " (edited)" : ""}
                      {!card.manual && ` · ${card.confidence}%`}
                    </span>
                    <div className="vision-card-actions">
                      <button type="button" className="btn-ghost" onClick={() => openEdit(card)}>
                        Edit
                      </button>
                      <button type="button" className="btn-ghost" onClick={() => removeCard(card.id)}>
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="vision-confidence cream-panel">
            <span className="eyebrow">Detection</span>
            <p>
              {lastConfidence != null
                ? hasUncertainLive && !hasConfirmedLive
                  ? `Confirming detection (${lastConfidence}% confidence)…`
                  : `Latest confidence: ${lastConfidence}%`
                : scanning
                  ? "Scanning — no cards in frame yet. Hold a card steady in view."
                  : "Start scanning to detect cards."}
            </p>
          </div>

          <div className="vision-manual-add cream-panel">
            <span className="eyebrow">Manual Correction</span>
            <p className="text-muted">Add or correct a card if detection missed it.</p>
            <div className="selector vision-rank-selector">
              {VISION_RANKS.map((rank) => (
                <button
                  key={rank}
                  type="button"
                  className={editRank === rank ? "selected" : ""}
                  onClick={() => setEditRank(rank)}
                >
                  {rank}
                </button>
              ))}
            </div>
            <div className="selector vision-suit-selector">
              {VISION_SUITS.map((suit) => (
                <button
                  key={suit}
                  type="button"
                  className={editSuit === suit ? "selected" : ""}
                  onClick={() => setEditSuit(suit)}
                >
                  {suit}
                </button>
              ))}
            </div>
            {editCardId ? (
              <button type="button" className="btn-primary" onClick={applyEdit}>
                Save Correction
              </button>
            ) : (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDetectedCards((prev) => [...prev, createManualCard(editRank, editSuit)])}
              >
                Add Card Manually
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
