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
  bbox: { x: number; y: number; w: number; h: number };
  cx: number;
  cy: number;
};

const SUIT_LETTERS = ["S", "H", "D", "C"] as const;
const RANK_LIST = [...ranks];
const MIN_REGION_AREA = 2800;
const MAX_REGIONS = 6;
const CELL_SIZE = 48;
const TRACK_MISS_LIMIT = 12;
const MATCH_DISTANCE = 56;

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
  return cards.reduce((sum, card) => sum + hiLo(`${card.rank}${suitLetter(card.suit)}`), 0);
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
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#111111";
    ctx.font = "bold 15px Georgia, 'Times New Roman', serif";
    const text = rank;
    ctx.fillText(text, rank === "10" ? 1 : 4, 19);
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
  const confidence = Math.max(0, Math.min(0.99, 0.55 + margin * 0.35 + bestScore * 0.08));
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

function findCardRegions(gray: Float32Array, width: number, height: number) {
  const threshold = 175;
  const visited = new Uint8Array(width * height);
  const regions: { x: number; y: number; w: number; h: number; area: number }[] = [];

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

        const neighbors = [
          cur - 1,
          cur + 1,
          cur - width,
          cur + width,
        ];
        for (const n of neighbors) {
          if (n < 0 || n >= width * height) continue;
          const nx = n % width;
          const ny = (n / width) | 0;
          if (Math.abs(nx - cx) + Math.abs(ny - cy) !== 1) continue;
          if (!visited[n] && gray[n] >= threshold) stack.push(n);
        }
      }

      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      const aspect = w / (h || 1);
      if (area < MIN_REGION_AREA) continue;
      if (aspect < 0.45 || aspect > 0.95) continue;
      if (w < 24 || h < 32) continue;
      regions.push({ x: minX, y: minY, w, h, area });
    }
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

export function detectCardsInFrame(
  source: CanvasImageSource,
  processCanvas: HTMLCanvasElement,
  processCtx: CanvasRenderingContext2D
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

  for (const region of regions) {
    const { patch, corner, avg } = extractCornerPatch(image.data, targetW, targetH, region);
    const { rank, confidence: rankConf } = classifyRank(patch);
    const suit = classifySuit(avg[0], avg[1], avg[2], corner);
    const confidence = Math.round(rankConf * 100);

    if (confidence < 52) continue;

    detections.push({
      rank,
      suit,
      confidence,
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

  return detections;
}

type ActiveTrack = {
  id: string;
  rank: string;
  suit: string;
  cx: number;
  cy: number;
  cell: string;
  confidence: number;
  registered: boolean;
  missedFrames: number;
};

export class DetectionTracker {
  private tracks: ActiveTrack[] = [];
  private nextId = 1;

  reset() {
    this.tracks = [];
    this.nextId = 1;
  }

  processFrame(detections: FrameDetection[]): DetectedCard[] {
    const newlyRegistered: DetectedCard[] = [];

    for (const track of this.tracks) track.missedFrames++;

    for (const det of detections) {
      const cell = cellKey(det.cx * 320, det.cy * 240);
      let match = this.tracks.find(
        (t) =>
          t.missedFrames < TRACK_MISS_LIMIT &&
          (t.cell === cell || distance(t, { cx: det.cx, cy: det.cy }) < MATCH_DISTANCE / 320) &&
          t.rank === det.rank
      );

      if (!match) {
        match = {
          id: `vc-${this.nextId++}`,
          rank: det.rank,
          suit: det.suit,
          cx: det.cx,
          cy: det.cy,
          cell,
          confidence: det.confidence,
          registered: false,
          missedFrames: 0,
        };
        this.tracks.push(match);
      } else {
        match.cx = det.cx;
        match.cy = det.cy;
        match.cell = cell;
        match.confidence = Math.max(match.confidence, det.confidence);
        match.suit = det.suit;
        match.missedFrames = 0;
      }

      if (!match.registered && match.confidence >= 58) {
        match.registered = true;
        const card: DetectedCard = {
          id: match.id,
          rank: match.rank,
          suit: match.suit,
          label: cardLabel(match.rank, match.suit),
          confidence: match.confidence,
        };
        newlyRegistered.push(card);
      }
    }

    this.tracks = this.tracks.filter((t) => t.missedFrames < TRACK_MISS_LIMIT);
    return newlyRegistered;
  }

  getActiveDetections(): FrameDetection[] {
    return this.tracks
      .filter((t) => t.missedFrames === 0)
      .map((t) => ({
        rank: t.rank,
        suit: t.suit,
        confidence: t.confidence,
        bbox: {
          x: t.cx - 0.04,
          y: t.cy - 0.06,
          w: 0.08,
          h: 0.12,
        },
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
