import { hiLo, ranks, suits } from "./blackjack";

export type VisionStatus =
  | "idle"
  | "ready"
  | "scanning"
  | "detected"
  | "permission_required"
  | "no_camera";

export type DetectedCard = {
  id: string;
  rank: string;
  suit: string;
  label: string;
  confidence: number;
  manual?: boolean;
};

/** Live overlay / UI detection — shape first, rank/suit optional. */
export type FrameDetection = {
  rank: string | null;
  suit: string | null;
  /** Shape/presence confidence 0–100 */
  detectionConfidence: number;
  /** Rank recognition confidence 0–100 (0 when uncertain) */
  recognitionConfidence: number;
  recognitionUncertain: boolean;
  /** True once this track has been registered into the running count */
  confirmed: boolean;
  bbox: { x: number; y: number; w: number; h: number };
  cx: number;
  cy: number;
};

export type DebugRect = {
  bbox: { x: number; y: number; w: number; h: number };
  accepted: boolean;
  detectionConfidence: number;
  reason: string;
};

export type FrameDetectionStats = {
  candidates: number;
  accepted: number;
  recognized: number;
  emitted: number;
};

const SUIT_LETTERS = ["S", "H", "D", "C"] as const;
const RANK_LIST = [...ranks];

/** Toggle from Vision Count UI; keep false for production default. */
export let VISION_DEBUG = false;
export function setVisionDebug(enabled: boolean) {
  VISION_DEBUG = enabled;
}

const PROCESS_W = 320;
const PROCESS_H = 240;

/* --- Relative geometry (normalized to process frame) --- */
const MIN_AREA_FRAC = 0.012; // ~1.2% of frame
const MAX_AREA_FRAC = 0.55;
const MIN_W_FRAC = 0.06;
const MAX_W_FRAC = 0.72;
const MIN_H_FRAC = 0.1;
const MAX_H_FRAC = 0.92;
/** Playing-card portrait width/height ≈ 0.65–0.72; allow tilt & crop. */
const MIN_ASPECT = 0.48;
const MAX_ASPECT = 0.92;
const MIN_FILL_RATIO = 0.52;

/* --- Face / ink heuristics (grayscale 0–255) --- */
const BRIGHTNESS_THRESHOLD = 168;
const MIN_FACE_BRIGHTNESS = 140;
const MAX_FACE_BRIGHTNESS = 252;
const MIN_INK_DARKNESS = 70;
const MIN_DARK_RATIO = 0.008;
const MAX_DARK_RATIO = 0.52;
const MIN_FACE_STD = 0.14;

/* --- Edge strength along bbox perimeter --- */
const MIN_EDGE_SCORE = 0.22;

/* --- Confidence gates (detection vs recognition are independent) --- */
const DETECTION_CONF_MIN = 55;
const RECOGNITION_CONF_MIN = 62;
const REGISTRATION_CONF_MIN = 68;
const CONFIRM_FRAMES_REQUIRED = 2;
const MIN_RANK_MARGIN = 0.07;
const MIN_RANK_CORRELATION = 0.26;

const MAX_REGIONS = 6;
const MAX_DEBUG_REJECTS = 12;
const CELL_SIZE = 40;
const TRACK_MISS_LIMIT = 14;
const MATCH_DISTANCE = 0.14;
const SIZE_SIMILARITY = 0.45;

type RawRegion = {
  x: number;
  y: number;
  w: number;
  h: number;
  area: number;
};

type ScoredCandidate = {
  region: RawRegion;
  detectionConfidence: number;
  reason: string;
  accepted: boolean;
  face: { avgBrightness: number; darkRatio: number; std: number };
  edgeScore: number;
};

function suitLetter(suit: string): string {
  const idx = suits.indexOf(suit);
  return idx >= 0 ? SUIT_LETTERS[idx] : "S";
}

export function cardLabel(rank: string, suit: string): string {
  return `${rank}${suit}`;
}

export function formatRunningCount(count: number): string {
  if (count > 0) return `+${count}`;
  if (count < 0) return String(count);
  return "0";
}

export function computeRunningCount(cards: DetectedCard[]): number {
  return cards.reduce((sum, card) => {
    const value = hiLo(`${card.rank}${suitLetter(card.suit)}`);
    return sum + value;
  }, 0);
}

export function hiLoValueForRank(rank: string): number {
  return hiLo(`${rank}S`);
}

function cellKey(cx: number, cy: number): string {
  return `${Math.floor((cx * PROCESS_W) / CELL_SIZE)},${Math.floor((cy * PROCESS_H) / CELL_SIZE)}`;
}

function distance(a: { cx: number; cy: number }, b: { cx: number; cy: number }): number {
  const dx = a.cx - b.cx;
  const dy = a.cy - b.cy;
  return Math.sqrt(dx * dx + dy * dy);
}

function grayscale(data: Uint8ClampedArray, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    out[i] = (data[o] + data[o + 1] + data[o + 2]) / 3;
  }
  return out;
}

function normalizePatch(patch: Float32Array): Float32Array {
  let mean = 0;
  for (let i = 0; i < patch.length; i++) mean += patch[i];
  mean /= patch.length || 1;
  let variance = 0;
  for (let i = 0; i < patch.length; i++) {
    const d = patch[i] - mean;
    variance += d * d;
  }
  const std = Math.sqrt(variance / (patch.length || 1)) || 1;
  const out = new Float32Array(patch.length);
  for (let i = 0; i < patch.length; i++) out[i] = (patch[i] - mean) / std;
  return out;
}

function correlate(a: Float32Array, b: Float32Array): number {
  const len = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < len; i++) sum += a[i] * b[i];
  return sum / len;
}

let rankTemplates: Map<string, Float32Array> | null = null;

function ensureRankTemplates(): Map<string, Float32Array> {
  if (rankTemplates) return rankTemplates;
  rankTemplates = new Map();
  if (typeof document === "undefined") return rankTemplates;

  const canvas = document.createElement("canvas");
  canvas.width = 22;
  canvas.height = 30;
  const ctx = canvas.getContext("2d");
  if (!ctx) return rankTemplates;

  for (const rank of RANK_LIST) {
    ctx.fillStyle = "#f8f8f8";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#1a1a1a";
    ctx.font = "bold 16px Arial, Helvetica, sans-serif";
    ctx.fillText(rank, rank === "10" ? 0 : 3, 21);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    rankTemplates.set(rank, normalizePatch(grayscale(data, canvas.width, canvas.height)));
  }
  return rankTemplates;
}

function classifyRank(patch: Float32Array): { rank: string; confidence: number } {
  const templates = ensureRankTemplates();
  let bestRank = "A";
  let bestScore = -Infinity;
  let secondScore = -Infinity;

  for (const rank of RANK_LIST) {
    const template = templates.get(rank);
    if (!template) continue;
    const score = correlate(patch, template);
    if (score > bestScore) {
      secondScore = bestScore;
      bestRank = rank;
      bestScore = score;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  const margin = bestScore - secondScore;
  if (margin < MIN_RANK_MARGIN || bestScore < MIN_RANK_CORRELATION) {
    return { rank: bestRank, confidence: 0 };
  }

  // Map passing scores into ~62–99 so recognition gate is reachable
  const scoreHeadroom = bestScore - MIN_RANK_CORRELATION;
  const marginHeadroom = margin - MIN_RANK_MARGIN;
  const confidence = Math.max(
    0,
    Math.min(0.99, 0.62 + scoreHeadroom * 0.95 + marginHeadroom * 0.85)
  );
  return { rank: bestRank, confidence };
}

function classifySuit(r: number, g: number, b: number, cornerData: Uint8ClampedArray): string {
  let red = 0;
  let black = 0;
  for (let i = 0; i < cornerData.length; i += 4) {
    const pr = cornerData[i];
    const pg = cornerData[i + 1];
    const pb = cornerData[i + 2];
    if (pr > 140 && pg < 110 && pb < 110) red++;
    else if (pr < 90 && pg < 90 && pb < 90) black++;
  }
  const isRed = red > black * 0.35;
  if (isRed) {
    const upperSum = (r + g + b) / 3;
    return upperSum > 150 ? "♦" : "♥";
  }
  const avg = (r + g + b) / 3;
  return avg > 120 ? "♣" : "♠";
}

function regionFaceStats(
  gray: Float32Array,
  width: number,
  height: number,
  bbox: { x: number; y: number; w: number; h: number }
): { avgBrightness: number; darkRatio: number; std: number } {
  let sum = 0;
  let count = 0;
  let dark = 0;
  let varianceAcc = 0;

  // Subsample for speed
  const stepY = Math.max(1, Math.floor(bbox.h / 24));
  const stepX = Math.max(1, Math.floor(bbox.w / 18));
  const samples: number[] = [];

  for (let py = bbox.y; py < bbox.y + bbox.h; py += stepY) {
    for (let px = bbox.x; px < bbox.x + bbox.w; px += stepX) {
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const v = gray[py * width + px];
      sum += v;
      count++;
      samples.push(v);
      if (v < MIN_INK_DARKNESS) dark++;
    }
  }

  if (!count) return { avgBrightness: 0, darkRatio: 0, std: 0 };

  const mean = sum / count;
  for (const v of samples) {
    const d = v - mean;
    varianceAcc += d * d;
  }
  const std = Math.sqrt(varianceAcc / count) / 128;

  return { avgBrightness: mean, darkRatio: dark / count, std };
}

/** Average Sobel magnitude along the four bbox edges (normalized 0–1). */
function perimeterEdgeScore(
  gray: Float32Array,
  width: number,
  height: number,
  bbox: { x: number; y: number; w: number; h: number }
): number {
  const sample = (x: number, y: number) => {
    const cx = Math.max(1, Math.min(width - 2, x | 0));
    const cy = Math.max(1, Math.min(height - 2, y | 0));
    const i = cy * width + cx;
    const gx =
      -gray[i - width - 1] -
      2 * gray[i - 1] -
      gray[i + width - 1] +
      gray[i - width + 1] +
      2 * gray[i + 1] +
      gray[i + width + 1];
    const gy =
      -gray[i - width - 1] -
      2 * gray[i - width] -
      gray[i - width + 1] +
      gray[i + width - 1] +
      2 * gray[i + width] +
      gray[i + width + 1];
    return Math.sqrt(gx * gx + gy * gy);
  };

  let sum = 0;
  let n = 0;
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    sum += sample(bbox.x + t * bbox.w, bbox.y);
    sum += sample(bbox.x + t * bbox.w, bbox.y + bbox.h);
    sum += sample(bbox.x, bbox.y + t * bbox.h);
    sum += sample(bbox.x + bbox.w, bbox.y + t * bbox.h);
    n += 4;
  }
  // Typical card edge magnitude on 0–255 gray is ~40–180
  return Math.min(1, sum / (n * 120));
}

function scoreCardCandidate(
  gray: Float32Array,
  width: number,
  height: number,
  region: RawRegion
): ScoredCandidate {
  const frameArea = width * height;
  const { w, h, area } = region;
  const aspect = w / (h || 1);
  const fillRatio = area / (w * h || 1);
  const areaFrac = area / frameArea;
  const wFrac = w / width;
  const hFrac = h / height;

  const face = regionFaceStats(gray, width, height, region);
  const edgeScore = perimeterEdgeScore(gray, width, height, region);

  const fail = (reason: string): ScoredCandidate => ({
    region,
    detectionConfidence: 0,
    reason,
    accepted: false,
    face,
    edgeScore,
  });

  if (areaFrac < MIN_AREA_FRAC || wFrac < MIN_W_FRAC || hFrac < MIN_H_FRAC) {
    return fail("too_small");
  }
  if (areaFrac > MAX_AREA_FRAC || wFrac > MAX_W_FRAC || hFrac > MAX_H_FRAC) {
    return fail("too_large");
  }
  if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) {
    return fail("aspect_ratio");
  }
  if (fillRatio < MIN_FILL_RATIO) {
    return fail("fill_ratio");
  }
  if (face.avgBrightness < MIN_FACE_BRIGHTNESS || face.avgBrightness > MAX_FACE_BRIGHTNESS) {
    return fail("face_brightness");
  }
  if (face.darkRatio < MIN_DARK_RATIO || face.darkRatio > MAX_DARK_RATIO) {
    return fail("ink_ratio");
  }
  if (face.std < MIN_FACE_STD) {
    return fail("texture");
  }
  if (edgeScore < MIN_EDGE_SCORE) {
    return fail("edge_strength");
  }

  // Composite detection confidence (shape + face + edges) — independent of rank
  const aspectIdeal = 1 - Math.min(1, Math.abs(aspect - 0.66) / 0.22);
  const sizeIdeal =
    areaFrac >= 0.04 && areaFrac <= 0.35 ? 1 : areaFrac < 0.04 ? areaFrac / 0.04 : Math.max(0, 1 - (areaFrac - 0.35) / 0.2);
  const fillIdeal = Math.min(1, (fillRatio - MIN_FILL_RATIO) / 0.35);
  const brightIdeal = Math.min(1, Math.max(0, (face.avgBrightness - MIN_FACE_BRIGHTNESS) / 40));
  const inkIdeal =
    face.darkRatio >= 0.02 && face.darkRatio <= 0.28
      ? 1
      : face.darkRatio < 0.02
        ? face.darkRatio / 0.02
        : Math.max(0, 1 - (face.darkRatio - 0.28) / 0.24);

  const raw =
    0.22 * aspectIdeal +
    0.16 * sizeIdeal +
    0.14 * fillIdeal +
    0.18 * brightIdeal +
    0.12 * inkIdeal +
    0.18 * Math.min(1, edgeScore / 0.55);

  const detectionConfidence = Math.round(Math.max(0, Math.min(0.99, 0.5 + raw * 0.5)) * 100);

  if (detectionConfidence < DETECTION_CONF_MIN) {
    return {
      region,
      detectionConfidence,
      reason: "low_detection_confidence",
      accepted: false,
      face,
      edgeScore,
    };
  }

  return {
    region,
    detectionConfidence,
    reason: "ok",
    accepted: true,
    face,
    edgeScore,
  };
}

function findBrightRegions(gray: Float32Array, width: number, height: number): RawRegion[] {
  const threshold = BRIGHTNESS_THRESHOLD;
  const visited = new Uint8Array(width * height);
  const regions: RawRegion[] = [];

  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const idx = y * width + x;
      if (visited[idx] || gray[idx] < threshold) continue;

      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let area = 0;
      const stack: number[] = [idx];

      while (stack.length) {
        const cur = stack.pop()!;
        if (visited[cur]) continue;
        const cx = cur % width;
        const cy = (cur / width) | 0;
        if (gray[cur] < threshold) continue;
        visited[cur] = 1;
        area++;
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);

        const neighbors = [cur - 1, cur + 1, cur - width, cur + width];
        for (const n of neighbors) {
          if (n < 0 || n >= width * height) continue;
          const nx = n % width;
          const ny = (n / width) | 0;
          if (Math.abs(nx - cx) + Math.abs(ny - cy) !== 1) continue;
          if (!visited[n] && gray[n] >= threshold) stack.push(n);
        }
      }

      regions.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, area });
    }
  }

  return regions.sort((a, b) => b.area - a.area);
}

/**
 * Crop top-left index corner with light perspective-style sampling:
 * sample a parallelogram biased toward the card interior so tilted cards
 * still yield a usable rank patch.
 */
function extractCornerPatch(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  bbox: { x: number; y: number; w: number; h: number }
): { patch: Float32Array; corner: Uint8ClampedArray; avg: [number, number, number] } {
  const patchW = 22;
  const patchH = 30;
  const ox = bbox.x + Math.floor(bbox.w * 0.05);
  const oy = bbox.y + Math.floor(bbox.h * 0.04);
  // Scale sampling window with card size (relative crop)
  const srcW = Math.max(patchW, Math.floor(bbox.w * 0.28));
  const srcH = Math.max(patchH, Math.floor(bbox.h * 0.22));

  const patch = new Float32Array(patchW * patchH);
  const corner = new Uint8ClampedArray(patchW * patchH * 4);
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let count = 0;

  for (let py = 0; py < patchH; py++) {
    for (let px = 0; px < patchW; px++) {
      const u = px / (patchW - 1);
      const v = py / (patchH - 1);
      // Slight shear approximates small perspective tilt
      const sx = Math.min(width - 1, Math.max(0, Math.round(ox + u * srcW + v * srcW * 0.04)));
      const sy = Math.min(height - 1, Math.max(0, Math.round(oy + v * srcH + u * srcH * 0.02)));
      const src = (sy * width + sx) * 4;
      const dst = (py * patchW + px) * 4;
      corner[dst] = data[src];
      corner[dst + 1] = data[src + 1];
      corner[dst + 2] = data[src + 2];
      corner[dst + 3] = 255;
      patch[py * patchW + px] = (data[src] + data[src + 1] + data[src + 2]) / 3;
      rSum += data[src];
      gSum += data[src + 1];
      bSum += data[src + 2];
      count++;
    }
  }

  return {
    patch: normalizePatch(patch),
    corner,
    avg: [rSum / count, gSum / count, bSum / count],
  };
}

export function detectCardsInFrame(
  source: CanvasImageSource,
  processCanvas: HTMLCanvasElement,
  processCtx: CanvasRenderingContext2D,
  statsOut?: FrameDetectionStats,
  debugOut?: DebugRect[]
): FrameDetection[] {
  processCanvas.width = PROCESS_W;
  processCanvas.height = PROCESS_H;
  processCtx.drawImage(source, 0, 0, PROCESS_W, PROCESS_H);

  const image = processCtx.getImageData(0, 0, PROCESS_W, PROCESS_H);
  const gray = grayscale(image.data, PROCESS_W, PROCESS_H);
  const rawRegions = findBrightRegions(gray, PROCESS_W, PROCESS_H);

  const scored: ScoredCandidate[] = [];
  const rejects: ScoredCandidate[] = [];

  for (const region of rawRegions) {
    const result = scoreCardCandidate(gray, PROCESS_W, PROCESS_H, region);
    if (result.accepted) scored.push(result);
    else if (rejects.length < MAX_DEBUG_REJECTS) rejects.push(result);
  }

  scored.sort((a, b) => b.detectionConfidence - a.detectionConfidence);
  const accepted = scored.slice(0, MAX_REGIONS);

  if (debugOut) {
    debugOut.length = 0;
    for (const c of accepted) {
      debugOut.push({
        bbox: {
          x: c.region.x / PROCESS_W,
          y: c.region.y / PROCESS_H,
          w: c.region.w / PROCESS_W,
          h: c.region.h / PROCESS_H,
        },
        accepted: true,
        detectionConfidence: c.detectionConfidence,
        reason: `Detected card Confidence: ${c.detectionConfidence}%`,
      });
    }
    for (const c of rejects) {
      debugOut.push({
        bbox: {
          x: c.region.x / PROCESS_W,
          y: c.region.y / PROCESS_H,
          w: c.region.w / PROCESS_W,
          h: c.region.h / PROCESS_H,
        },
        accepted: false,
        detectionConfidence: c.detectionConfidence,
        reason: `Rejected object Reason: ${c.reason.replace(/_/g, " ")}`,
      });
    }
  }

  const detections: FrameDetection[] = [];
  let recognized = 0;

  for (const candidate of accepted) {
    const { patch, corner, avg } = extractCornerPatch(image.data, PROCESS_W, PROCESS_H, candidate.region);
    const { rank, confidence: rankConf } = classifyRank(patch);
    const recognitionConfidence = Math.round(rankConf * 100);
    const recognitionOk = recognitionConfidence >= RECOGNITION_CONF_MIN;
    const suit = recognitionOk ? classifySuit(avg[0], avg[1], avg[2], corner) : null;

    if (recognitionOk) recognized++;

    detections.push({
      rank: recognitionOk ? rank : null,
      suit,
      detectionConfidence: candidate.detectionConfidence,
      recognitionConfidence: recognitionOk ? recognitionConfidence : 0,
      recognitionUncertain: !recognitionOk,
      confirmed: false,
      bbox: {
        x: candidate.region.x / PROCESS_W,
        y: candidate.region.y / PROCESS_H,
        w: candidate.region.w / PROCESS_W,
        h: candidate.region.h / PROCESS_H,
      },
      cx: (candidate.region.x + candidate.region.w / 2) / PROCESS_W,
      cy: (candidate.region.y + candidate.region.h / 2) / PROCESS_H,
    });
  }

  if (statsOut) {
    statsOut.candidates = rawRegions.length;
    statsOut.accepted = accepted.length;
    statsOut.recognized = recognized;
    statsOut.emitted = detections.length;
  }

  if (VISION_DEBUG) {
    console.debug("[visionCount]", {
      candidates: rawRegions.length,
      accepted: accepted.length,
      recognized,
      sample: detections[0]
        ? detections[0].recognitionUncertain
          ? `shape@${detections[0].detectionConfidence}% uncertain`
          : `${detections[0].rank}${detections[0].suit} det${detections[0].detectionConfidence}% rec${detections[0].recognitionConfidence}%`
        : null,
    });
  }

  return detections;
}

type ActiveTrack = {
  id: string;
  rank: string | null;
  suit: string | null;
  cx: number;
  cy: number;
  cell: string;
  bbox: { x: number; y: number; w: number; h: number };
  detectionConfidence: number;
  recognitionConfidence: number;
  recognitionUncertain: boolean;
  registered: boolean;
  confirmFrames: number;
  missedFrames: number;
  area: number;
};

function bboxArea(b: { w: number; h: number }) {
  return b.w * b.h;
}

export class DetectionTracker {
  private tracks: ActiveTrack[] = [];
  private registeredKeys = new Set<string>();
  private nextId = 1;

  reset() {
    this.tracks = [];
    this.registeredKeys.clear();
    this.nextId = 1;
  }

  private identityKey(track: ActiveTrack): string {
    return `${track.cell}:${track.rank ?? "?"}`;
  }

  private findSpatialMatch(det: FrameDetection): ActiveTrack | undefined {
    const detArea = bboxArea(det.bbox);
    return this.tracks.find((t) => {
      if (t.missedFrames >= TRACK_MISS_LIMIT) return false;
      const sameCell = t.cell === cellKey(det.cx, det.cy);
      const near = distance(t, { cx: det.cx, cy: det.cy }) < MATCH_DISTANCE;
      if (!sameCell && !near) return false;
      const areaRatio = Math.min(t.area, detArea) / Math.max(t.area, detArea || 1e-6);
      return areaRatio >= SIZE_SIMILARITY;
    });
  }

  processFrame(detections: FrameDetection[]): DetectedCard[] {
    const newlyRegistered: DetectedCard[] = [];

    for (const track of this.tracks) track.missedFrames++;

    for (const det of detections) {
      const cell = cellKey(det.cx, det.cy);
      let match = this.findSpatialMatch(det);

      if (!match) {
        match = {
          id: `vc-${this.nextId++}`,
          rank: det.rank,
          suit: det.suit,
          cx: det.cx,
          cy: det.cy,
          cell,
          bbox: det.bbox,
          detectionConfidence: det.detectionConfidence,
          recognitionConfidence: det.recognitionConfidence,
          recognitionUncertain: det.recognitionUncertain,
          registered: false,
          confirmFrames: det.recognitionUncertain ? 0 : 1,
          missedFrames: 0,
          area: bboxArea(det.bbox),
        };
        this.tracks.push(match);
      } else {
        match.cx = det.cx;
        match.cy = det.cy;
        match.cell = cell;
        match.bbox = det.bbox;
        match.area = bboxArea(det.bbox);
        match.detectionConfidence = Math.max(match.detectionConfidence, det.detectionConfidence);
        match.missedFrames = 0;

        if (det.recognitionUncertain) {
          // Keep last good rank guess but do not advance confirmation
          match.recognitionUncertain = match.recognitionConfidence < REGISTRATION_CONF_MIN;
        } else if (match.rank === det.rank && det.rank) {
          match.rank = det.rank;
          match.suit = det.suit;
          match.recognitionConfidence = Math.max(match.recognitionConfidence, det.recognitionConfidence);
          match.recognitionUncertain = false;
          match.confirmFrames++;
        } else if (
          det.recognitionConfidence >= match.recognitionConfidence ||
          match.recognitionUncertain ||
          !match.rank
        ) {
          match.rank = det.rank;
          match.suit = det.suit;
          match.recognitionConfidence = det.recognitionConfidence;
          match.recognitionUncertain = false;
          match.confirmFrames = 1;
        } else {
          match.confirmFrames = Math.max(0, match.confirmFrames - 1);
        }
      }

      const key = this.identityKey(match);
      if (match.registered || this.registeredKeys.has(key)) {
        // Same card still in view — never re-count
        if (match.registered) this.registeredKeys.add(key);
        continue;
      }

      // Also block nearby cells for the same recognized rank (duplicate prevention)
      const nearbyRegistered = Array.from(this.registeredKeys).some((k) => {
        const [c, r] = k.split(":");
        return r === match!.rank && r !== "?" && c === match!.cell;
      });
      if (nearbyRegistered) continue;

      const ready =
        !match.recognitionUncertain &&
        !!match.rank &&
        !!match.suit &&
        match.confirmFrames >= CONFIRM_FRAMES_REQUIRED &&
        match.recognitionConfidence >= REGISTRATION_CONF_MIN;

      if (ready) {
        match.registered = true;
        this.registeredKeys.add(key);
        newlyRegistered.push({
          id: match.id,
          rank: match.rank!,
          suit: match.suit!,
          label: cardLabel(match.rank!, match.suit!),
          confidence: match.recognitionConfidence,
        });
      }
    }

    // Free identity keys when the track fully disappears (re-entry allowed later)
    const aliveKeys = new Set(
      this.tracks
        .filter((t) => t.registered && t.missedFrames < TRACK_MISS_LIMIT)
        .map((t) => this.identityKey(t))
    );
    for (const key of Array.from(this.registeredKeys)) {
      if (!aliveKeys.has(key)) {
        // Keep lock briefly via tracks filter below; drop when track gone
        const stillTracked = this.tracks.some(
          (t) => this.identityKey(t) === key && t.missedFrames < TRACK_MISS_LIMIT
        );
        if (!stillTracked) this.registeredKeys.delete(key);
      }
    }

    this.tracks = this.tracks.filter((t) => t.missedFrames < TRACK_MISS_LIMIT);
    return newlyRegistered;
  }

  getActiveDetections(): FrameDetection[] {
    return this.tracks
      .filter((t) => t.missedFrames === 0 && t.detectionConfidence >= DETECTION_CONF_MIN)
      .map((t) => ({
        rank: t.rank,
        suit: t.suit,
        detectionConfidence: t.detectionConfidence,
        recognitionConfidence: t.recognitionConfidence,
        recognitionUncertain: t.recognitionUncertain || !t.rank,
        confirmed: t.registered,
        bbox: t.bbox,
        cx: t.cx,
        cy: t.cy,
      }));
  }
}

export function createManualCard(rank: string, suit: string, id?: string): DetectedCard {
  return {
    id: id ?? `manual-${Date.now()}`,
    rank,
    suit,
    label: cardLabel(rank, suit),
    confidence: 100,
    manual: true,
  };
}

export { RANK_LIST as VISION_RANKS, suits as VISION_SUITS };
