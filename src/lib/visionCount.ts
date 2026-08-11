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

export type FrameDetection = {
  rank: string;
  suit: string;
  confidence: number;
  confirmed: boolean;
  bbox: { x: number; y: number; w: number; h: number };
  cx: number;
  cy: number;
};

const SUIT_LETTERS = ["S", "H", "D", "C"] as const;
const RANK_LIST = [...ranks];
/** Set true in devtools to log per-frame region/rank stats. */
export const VISION_DEBUG = false;

const MIN_REGION_AREA = 3200;
const MAX_REGION_AREA = 32000;
const MIN_CARD_W = 24;
const MAX_CARD_W = 120;
const MIN_CARD_H = 32;
const MAX_CARD_H = 160;
const MIN_ASPECT = 0.52;
const MAX_ASPECT = 0.88;
const MIN_FILL_RATIO = 0.55;
const MAX_REGIONS = 5;
const CELL_SIZE = 44;
const TRACK_MISS_LIMIT = 12;
const MATCH_DISTANCE = 0.16;
const DETECTION_CONF_MIN = 58;
const REGISTRATION_CONF_MIN = 64;
const CONFIRM_FRAMES_REQUIRED = 2;
const MIN_RANK_MARGIN = 0.08;
const MIN_RANK_CORRELATION = 0.28;
const MIN_FACE_BRIGHTNESS = 152;
const MIN_INK_DARKNESS = 65;
const MIN_PATCH_STD = 0.22;
const BRIGHTNESS_THRESHOLD = 176;

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
  return `${Math.floor(cx / CELL_SIZE)},${Math.floor(cy / CELL_SIZE)}`;
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
    const text = rank;
    ctx.fillText(text, rank === "10" ? 0 : 3, 21);
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
  const scoreHeadroom = bestScore - MIN_RANK_CORRELATION;
  const marginHeadroom = margin - MIN_RANK_MARGIN;
  const confidence = Math.max(
    0,
    Math.min(0.99, 0.52 + scoreHeadroom * 1.1 + marginHeadroom * 0.75)
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
  const samples: number[] = [];

  for (let py = bbox.y; py < bbox.y + bbox.h; py++) {
    for (let px = bbox.x; px < bbox.x + bbox.w; px++) {
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
  let variance = 0;
  for (const v of samples) {
    const d = v - mean;
    variance += d * d;
  }
  const std = Math.sqrt(variance / count) / 128;

  return { avgBrightness: mean, darkRatio: dark / count, std };
}

function validateCardRegion(
  gray: Float32Array,
  width: number,
  height: number,
  region: { x: number; y: number; w: number; h: number; area: number }
): boolean {
  const { w, h, area } = region;
  const aspect = w / (h || 1);
  const fillRatio = area / (w * h);

  if (area < MIN_REGION_AREA || area > MAX_REGION_AREA) return false;
  if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) return false;
  if (w < MIN_CARD_W || w > MAX_CARD_W || h < MIN_CARD_H || h > MAX_CARD_H) return false;
  if (fillRatio < MIN_FILL_RATIO) return false;

  const face = regionFaceStats(gray, width, height, region);
  if (face.avgBrightness < MIN_FACE_BRIGHTNESS) return false;
  if (face.darkRatio < 0.012 || face.darkRatio > 0.48) return false;
  if (face.std < MIN_PATCH_STD) return false;

  return true;
}

function findCardRegions(gray: Float32Array, width: number, height: number) {
  const threshold = BRIGHTNESS_THRESHOLD;
  const visited = new Uint8Array(width * height);
  const regions: { x: number; y: number; w: number; h: number; area: number }[] = [];
  let candidates = 0;

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

      candidates++;
      const region = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, area };
      if (validateCardRegion(gray, width, height, region)) regions.push(region);
    }
  }

  if (VISION_DEBUG && candidates > 0) {
    console.debug("[visionCount] regions", { candidates, validated: regions.length });
  }

  return regions.sort((a, b) => b.area - a.area).slice(0, MAX_REGIONS);
}

function extractCornerPatch(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  bbox: { x: number; y: number; w: number; h: number }
): { patch: Float32Array; corner: Uint8ClampedArray; avg: [number, number, number] } {
  const patchW = 22;
  const patchH = 30;
  const sx = bbox.x + Math.floor(bbox.w * 0.06);
  const sy = bbox.y + Math.floor(bbox.h * 0.05);
  const patch = new Float32Array(patchW * patchH);
  const corner = new Uint8ClampedArray(patchW * patchH * 4);
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let count = 0;

  for (let py = 0; py < patchH; py++) {
    for (let px = 0; px < patchW; px++) {
      const fx = Math.min(width - 1, sx + px);
      const fy = Math.min(height - 1, sy + py);
      const src = (fy * width + fx) * 4;
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

export type FrameDetectionStats = {
  regionsFound: number;
  regionsPassed: number;
  rankMatches: number;
  emitted: number;
};

export function detectCardsInFrame(
  source: CanvasImageSource,
  processCanvas: HTMLCanvasElement,
  processCtx: CanvasRenderingContext2D,
  statsOut?: FrameDetectionStats
): FrameDetection[] {
  const targetW = 320;
  const targetH = 240;
  processCanvas.width = targetW;
  processCanvas.height = targetH;
  processCtx.drawImage(source, 0, 0, targetW, targetH);

  const image = processCtx.getImageData(0, 0, targetW, targetH);
  const gray = grayscale(image.data, targetW, targetH);
  const regions = findCardRegions(gray, targetW, targetH);
  const detections: FrameDetection[] = [];
  let rankMatches = 0;

  if (statsOut) {
    statsOut.regionsFound = regions.length;
    statsOut.regionsPassed = regions.length;
    statsOut.rankMatches = 0;
    statsOut.emitted = 0;
  }

  for (const region of regions) {
    const { patch, corner, avg } = extractCornerPatch(image.data, targetW, targetH, region);
    const { rank, confidence: rankConf } = classifyRank(patch);
    const suit = classifySuit(avg[0], avg[1], avg[2], corner);
    const confidence = Math.round(rankConf * 100);

    if (rankConf > 0) rankMatches++;
    if (confidence < DETECTION_CONF_MIN) continue;

    detections.push({
      rank,
      suit,
      confidence,
      confirmed: false,
      bbox: {
        x: region.x / targetW,
        y: region.y / targetH,
        w: region.w / targetW,
        h: region.h / targetH,
      },
      cx: (region.x + region.w / 2) / targetW,
      cy: (region.y + region.h / 2) / targetH,
    });
  }

  if (statsOut) {
    statsOut.rankMatches = rankMatches;
    statsOut.emitted = detections.length;
  }

  if (VISION_DEBUG && (regions.length > 0 || rankMatches > 0)) {
    console.debug("[visionCount]", {
      regions: regions.length,
      rankMatches,
      emitted: detections.length,
      sample: detections[0]
        ? `${detections[0].rank}${detections[0].suit} @ ${detections[0].confidence}%`
        : null,
    });
  }

  return detections;
}

type ActiveTrack = {
  id: string;
  rank: string;
  suit: string;
  cx: number;
  cy: number;
  cell: string;
  bbox: { x: number; y: number; w: number; h: number };
  confidence: number;
  registered: boolean;
  confirmFrames: number;
  missedFrames: number;
};

export class DetectionTracker {
  private tracks: ActiveTrack[] = [];
  private registeredCells = new Set<string>();
  private nextId = 1;

  reset() {
    this.tracks = [];
    this.registeredCells.clear();
    this.nextId = 1;
  }

  private findSpatialMatch(det: FrameDetection): ActiveTrack | undefined {
    return this.tracks.find(
      (t) =>
        t.missedFrames < TRACK_MISS_LIMIT &&
        (t.cell === cellKey(det.cx * 320, det.cy * 240) ||
          distance(t, { cx: det.cx, cy: det.cy }) < MATCH_DISTANCE)
    );
  }

  processFrame(detections: FrameDetection[]): DetectedCard[] {
    const newlyRegistered: DetectedCard[] = [];

    for (const track of this.tracks) track.missedFrames++;

    for (const det of detections) {
      const cell = cellKey(det.cx * 320, det.cy * 240);
      if (this.registeredCells.has(cell)) continue;

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
          confidence: det.confidence,
          registered: false,
          confirmFrames: 1,
          missedFrames: 0,
        };
        this.tracks.push(match);
      } else {
        match.cx = det.cx;
        match.cy = det.cy;
        match.cell = cell;
        match.bbox = det.bbox;
        match.confidence = Math.max(match.confidence, det.confidence);
        match.suit = det.suit;
        match.missedFrames = 0;

        if (match.rank === det.rank) {
          match.confirmFrames++;
        } else if (det.confidence >= match.confidence) {
          match.rank = det.rank;
          match.confirmFrames = 1;
        } else {
          match.confirmFrames = Math.max(0, match.confirmFrames - 1);
        }
      }

      const ready =
        !match.registered &&
        match.confirmFrames >= CONFIRM_FRAMES_REQUIRED &&
        match.confidence >= REGISTRATION_CONF_MIN;

      if (ready) {
        match.registered = true;
        this.registeredCells.add(cell);
        newlyRegistered.push({
          id: match.id,
          rank: match.rank,
          suit: match.suit,
          label: cardLabel(match.rank, match.suit),
          confidence: match.confidence,
        });
      }
    }

    this.tracks = this.tracks.filter((t) => t.missedFrames < TRACK_MISS_LIMIT);
    return newlyRegistered;
  }

  getActiveDetections(minConfidence = DETECTION_CONF_MIN): FrameDetection[] {
    return this.tracks
      .filter((t) => t.missedFrames === 0 && t.confidence >= minConfidence)
      .map((t) => ({
        rank: t.rank,
        suit: t.suit,
        confidence: t.confidence,
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
