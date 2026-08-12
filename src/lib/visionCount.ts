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
  /** Rank recognition confidence 0–100 (drives the running count trust). */
  confidence: number;
  /** Suit recognition confidence 0–100 — secondary, does not gate counting. */
  suitConfidence?: number;
  manual?: boolean;
};

/** Live overlay / UI detection — shape first, rank/suit optional. */
export type FrameDetection = {
  rank: string | null;
  suit: string | null;
  /** Card shape/presence confidence 0–100 — geometry only, never implies rank/suit are known. */
  detectionConfidence: number;
  /** Rank recognition confidence 0–100 (0 when uncertain). Independent of detectionConfidence. */
  recognitionConfidence: number;
  /** Suit recognition confidence 0–100 (0 when uncertain). Independent of rank confidence. */
  suitConfidence: number;
  /** True only when RANK confidence is below its own threshold — never derived from detectionConfidence. */
  recognitionUncertain: boolean;
  /** True once this track has been registered into the running count */
  confirmed: boolean;
  bbox: { x: number; y: number; w: number; h: number };
  cx: number;
  cy: number;
};

export type DebugMetrics = {
  widthPx: number;
  heightPx: number;
  frameW: number;
  frameH: number;
  relWidthPct: number;
  relHeightPct: number;
  /** min(w,h)/max(w,h) — orientation-agnostic shape ratio actually used for gating. */
  aspectRatio: number;
};

export type DebugRect = {
  bbox: { x: number; y: number; w: number; h: number };
  accepted: boolean;
  detectionConfidence: number;
  reason: string;
  metrics: DebugMetrics;
};

export type FrameDetectionStats = {
  candidates: number;
  accepted: number;
  recognized: number;
  emitted: number;
};

const SUIT_LETTERS = ["S", "H", "D", "C"] as const;
const RANK_LIST = [...ranks];
const SUIT_LIST = [...suits];

/** Toggle from Vision Count UI; keep false for production default. */
export let VISION_DEBUG = false;
export function setVisionDebug(enabled: boolean) {
  VISION_DEBUG = enabled;
}

/**
 * Longest side (px) of the internal processing canvas. The canvas is sized
 * dynamically each frame to match the *actual* camera aspect ratio (see
 * `detectCardsInFrame`) — never a fixed 320x240 buffer — so a 16:9 webcam,
 * a 4:3 webcam, and a portrait phone camera all get scaled uniformly on
 * both axes instead of being stretched to fit a mismatched shape.
 */
const PROCESS_MAX_DIM = 360;
/** Nominal grid only used to bucket track positions into cells; independent of actual frame size since cx/cy are already 0–1 normalized. */
const GRID_W = 320;
const GRID_H = 240;

/* --- Relative geometry (normalized to the actual camera frame, NOT fixed pixels) ---
 * Every threshold below is a fraction of the live frame's own width/height,
 * so the same card is treated identically whether the camera delivers
 * 320x240, 1280x720, or 4032x3024 — only how close the card is to the lens
 * changes these fractions, not the source resolution.
 */
const MIN_AREA_FRAC = 0.0015; // reject only genuinely tiny specks (~0.15% of frame area)
const MAX_AREA_FRAC = 0.9;
/** A real card, even far away, should still span at least ~2.5% of the frame on its short side. */
const MIN_DIM_FRAC = 0.025;
const MAX_DIM_FRAC = 0.95;
/**
 * Orientation-agnostic shape ratio = min(w,h) / max(w,h).
 * A standard card is 2.5"x3.5" -> ratio ≈ 0.714, and this is identical
 * whether the card is held portrait (w<h) or landscape/rotated 90° (w>h),
 * so a single band covers both orientations without penalizing either.
 * Band is widened beyond the ideal ~0.71 to tolerate perspective
 * foreshortening and the extra "squaring" a rotated card's axis-aligned
 * bounding box picks up at intermediate rotation angles.
 */
const MIN_ASPECT_RATIO = 0.5;
const MAX_ASPECT_RATIO = 0.85;
/** Lowered from a stricter value to tolerate the lower fill of a rotated card's axis-aligned bbox (corners of a tilted rect fall outside the rect). */
const MIN_FILL_RATIO = 0.4;

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

/* --- Confidence gates (detection, rank recognition, and suit recognition are all independent) --- */
const DETECTION_CONF_MIN = 55;
const RECOGNITION_CONF_MIN = 62;
const REGISTRATION_CONF_MIN = 68;
const CONFIRM_FRAMES_REQUIRED = 2;
const MIN_RANK_MARGIN = 0.07;
const MIN_RANK_CORRELATION = 0.26;
/** Suit is secondary priority — its own gate, independent of rank/detection confidence. */
const SUIT_CONF_MIN = 45;
const MIN_SUIT_MARGIN = 0.05;
const MIN_SUIT_CORRELATION = 0.2;
/** Structural-feature (holes/ink-components) mismatch penalty applied to raw template correlation. */
const HOLES_PENALTY_WEIGHT = 0.22;
const COMPONENTS_PENALTY_WEIGHT = 0.4;

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
  metrics: DebugMetrics;
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
  return `${Math.floor((cx * GRID_W) / CELL_SIZE)},${Math.floor((cy * GRID_H) / CELL_SIZE)}`;
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

/* ============================================================================
 * RANK / SUIT RECOGNITION
 * ----------------------------------------------------------------------------
 * Everything below classifies WHAT a card is (rank + suit) from an already
 * detected/geometry-accepted region. It never adjusts detectionConfidence,
 * region bboxes, or any size/aspect gating above — recognition failing simply
 * yields rank/suit = null with its own independent confidence of 0.
 * ========================================================================== */

const RANK_PATCH_W = 26;
const RANK_PATCH_H = 32;
const SUIT_PATCH_W = 20;
const SUIT_PATCH_H = 18;

/** Supersample factor used when rendering templates for smoother, less-aliased reference glyphs. */
const TEMPLATE_SUPERSAMPLE = 3;

type RankTemplate = {
  gray: Float32Array; // normalized (zero-mean/unit-std), RANK_PATCH_W x RANK_PATCH_H
  holes: number; // enclosed background loops (e.g. 8 has 2, 6/9/0/A/Q have 1, most others have 0)
  components: number; // separate ink blobs ("10" has 2 — the "1" and the "0" — everything else has 1)
};

type SuitTemplate = {
  gray: Float32Array; // normalized, SUIT_PATCH_W x SUIT_PATCH_H
};

/**
 * Otsu threshold — picks the split point that best separates ink from
 * background for THIS patch's own histogram, rather than a fixed global
 * brightness cut. Needed because corner crops vary in exposure/contrast
 * far more than a full card face does.
 */
function otsuThreshold(gray: Float32Array): number {
  const hist = new Array(256).fill(0) as number[];
  for (let i = 0; i < gray.length; i++) {
    hist[Math.max(0, Math.min(255, Math.round(gray[i])))]++;
  }
  const total = gray.length || 1;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];

  let sumB = 0;
  let wB = 0;
  let maxVar = -1;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const varBetween = wB * wF * (mB - mF) * (mB - mF);
    if (varBetween > maxVar) {
      maxVar = varBetween;
      threshold = t;
    }
  }
  return threshold;
}

function binarizeInk(gray: Float32Array, threshold: number): Uint8Array {
  const bin = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) bin[i] = gray[i] < threshold ? 1 : 0;
  return bin;
}

/**
 * Counts (a) distinct ink blobs and (b) fully-enclosed background loops
 * ("holes") in a binarized glyph patch. These two small integers are a
 * cheap, rotation/font-tolerant structural fingerprint that cleanly
 * separates every rank pair called out as commonly confused:
 *   5(0,1) vs 6(1,1) · 6(1,1) vs 8(2,1) · 8(2,1) vs 9(1,1) ·
 *   9(1,1) vs 10(1,2) · 10(1,2) vs J(0,1) · J(0,1) vs Q(1,1) ·
 *   Q(1,1) vs K(0,1) · K(0,1) vs A(1,1)          (holes, components)
 */
function countHolesAndComponents(
  bin: Uint8Array,
  w: number,
  h: number
): { holes: number; components: number } {
  const MIN_AREA = 2;
  const visited = new Uint8Array(w * h);

  const floodCount = (
    matches: (i: number) => boolean,
    seeds: number[]
  ): number => {
    let count = 0;
    const local = new Uint8Array(w * h);
    for (const seed of seeds) {
      if (!matches(seed) || local[seed]) continue;
      local[seed] = 1;
      let area = 0;
      const stack = [seed];
      while (stack.length) {
        const cur = stack.pop()!;
        area++;
        const cx = cur % w;
        const cy = (cur / w) | 0;
        const neighbors = [cur - 1, cur + 1, cur - w, cur + w];
        for (const n of neighbors) {
          if (n < 0 || n >= w * h) continue;
          const nx = n % w;
          const ny = (n / w) | 0;
          if (Math.abs(nx - cx) + Math.abs(ny - cy) !== 1) continue;
          if (!local[n] && matches(n)) {
            local[n] = 1;
            stack.push(n);
          }
        }
      }
      if (area >= MIN_AREA) count++;
    }
    return count;
  };

  // Ink components: every dark pixel is a seed; matches() only accepts ink.
  const inkSeeds: number[] = [];
  for (let i = 0; i < bin.length; i++) if (bin[i] === 1) inkSeeds.push(i);
  const components = floodCount((i) => bin[i] === 1, inkSeeds);

  // Background reachable from the patch border is "outside"; whatever
  // background remains unreached is an enclosed hole.
  const outside = new Uint8Array(w * h);
  const borderStack: number[] = [];
  for (let x = 0; x < w; x++) {
    if (bin[x] === 0) borderStack.push(x);
    const bottom = (h - 1) * w + x;
    if (bin[bottom] === 0) borderStack.push(bottom);
  }
  for (let y = 0; y < h; y++) {
    if (bin[y * w] === 0) borderStack.push(y * w);
    const right = y * w + (w - 1);
    if (bin[right] === 0) borderStack.push(right);
  }
  for (const seed of borderStack) outside[seed] = 1;
  const stack = [...borderStack];
  while (stack.length) {
    const cur = stack.pop()!;
    const cx = cur % w;
    const cy = (cur / w) | 0;
    const neighbors = [cur - 1, cur + 1, cur - w, cur + w];
    for (const n of neighbors) {
      if (n < 0 || n >= w * h) continue;
      const nx = n % w;
      const ny = (n / w) | 0;
      if (Math.abs(nx - cx) + Math.abs(ny - cy) !== 1) continue;
      if (!outside[n] && bin[n] === 0) {
        outside[n] = 1;
        stack.push(n);
      }
    }
  }
  visited.fill(0);
  const holeSeeds: number[] = [];
  for (let i = 0; i < bin.length; i++) if (bin[i] === 0 && !outside[i]) holeSeeds.push(i);
  const holes = floodCount((i) => bin[i] === 0 && !outside[i], holeSeeds);

  return { holes, components };
}

/** Downsample a supersampled canvas render by box-averaging NxN blocks — cheap anti-aliasing that mimics camera-blur softness better than raw glyph edges. */
function boxDownsample(
  data: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  factor: number
): Float32Array {
  const dstW = Math.round(srcW / factor);
  const dstH = Math.round(srcH / factor);
  const out = new Float32Array(dstW * dstH);
  for (let dy = 0; dy < dstH; dy++) {
    for (let dx = 0; dx < dstW; dx++) {
      let sum = 0;
      let count = 0;
      for (let fy = 0; fy < factor; fy++) {
        for (let fx = 0; fx < factor; fx++) {
          const sx = dx * factor + fx;
          const sy = dy * factor + fy;
          if (sx >= srcW || sy >= srcH) continue;
          const i = (sy * srcW + sx) * 4;
          sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
          count++;
        }
      }
      out[dy * dstW + dx] = count ? sum / count : 255;
    }
  }
  return out;
}

let rankTemplates: Map<string, RankTemplate> | null = null;
let suitTemplates: Map<string, SuitTemplate> | null = null;

/**
 * Renders index-style rank glyphs at high supersampled resolution using a
 * bold serif face closer to real card corner-index typography than a plain
 * sans-serif, then box-downsamples for anti-aliased templates. Structural
 * features (holes/components) are computed once here and cached alongside
 * each template so runtime classification only pays for the query patch.
 */
function ensureRankTemplates(): Map<string, RankTemplate> {
  if (rankTemplates) return rankTemplates;
  rankTemplates = new Map();
  if (typeof document === "undefined") return rankTemplates;

  const ss = TEMPLATE_SUPERSAMPLE;
  const canvas = document.createElement("canvas");
  canvas.width = RANK_PATCH_W * ss;
  canvas.height = RANK_PATCH_H * ss;
  const ctx = canvas.getContext("2d");
  if (!ctx) return rankTemplates;

  for (const rank of RANK_LIST) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0a0a0a";
    ctx.textBaseline = "alphabetic";
    // "10" needs a tighter/narrower face to fit two glyphs the way real
    // card corners do; single characters use a slightly larger bold serif
    // that better matches typical corner-index type than a sans-serif.
    const fontPx = rank === "10" ? 21 * ss : 24 * ss;
    ctx.font = `bold ${fontPx}px Georgia, "Times New Roman", serif`;
    const label = rank;
    const tw = ctx.measureText(label).width;
    const x = Math.max(2 * ss, (canvas.width - tw) / 2);
    const y = canvas.height * 0.78;
    ctx.fillText(label, x, y);

    const raw = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const gray = boxDownsample(raw, canvas.width, canvas.height, ss);
    const threshold = otsuThreshold(gray);
    const bin = binarizeInk(gray, threshold);
    const { holes, components } = countHolesAndComponents(bin, RANK_PATCH_W, RANK_PATCH_H);

    rankTemplates.set(rank, {
      gray: normalizePatch(gray),
      holes,
      components: Math.max(1, components),
    });
  }
  return rankTemplates;
}

function ensureSuitTemplates(): Map<string, SuitTemplate> {
  if (suitTemplates) return suitTemplates;
  suitTemplates = new Map();
  if (typeof document === "undefined") return suitTemplates;

  const ss = TEMPLATE_SUPERSAMPLE;
  const canvas = document.createElement("canvas");
  canvas.width = SUIT_PATCH_W * ss;
  canvas.height = SUIT_PATCH_H * ss;
  const ctx = canvas.getContext("2d");
  if (!ctx) return suitTemplates;

  for (const suit of SUIT_LIST) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0a0a0a";
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "center";
    ctx.font = `${16 * ss}px "Segoe UI Symbol", Arial, sans-serif`;
    ctx.fillText(suit, canvas.width / 2, canvas.height * 0.82);
    ctx.textAlign = "left";

    const raw = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const gray = boxDownsample(raw, canvas.width, canvas.height, ss);
    suitTemplates.set(suit, { gray: normalizePatch(gray) });
  }
  return suitTemplates;
}

/**
 * Classify a rank glyph patch using normalized cross-correlation against
 * every rendered template, refined by a structural penalty from
 * holes/ink-component mismatches (see countHolesAndComponents doc comment
 * for exactly which confusable pairs this resolves).
 */
function classifyRank(
  rawGray: Float32Array
): { rank: string; confidence: number; holes: number; components: number } {
  const templates = ensureRankTemplates();
  const threshold = otsuThreshold(rawGray);
  const bin = binarizeInk(rawGray, threshold);
  const { holes, components } = countHolesAndComponents(bin, RANK_PATCH_W, RANK_PATCH_H);
  const normQuery = normalizePatch(rawGray);

  let bestRank = "A";
  let bestScore = -Infinity;
  let secondScore = -Infinity;

  for (const rank of RANK_LIST) {
    const template = templates.get(rank);
    if (!template) continue;
    const corr = correlate(normQuery, template.gray);
    const holesDiff = Math.abs(holes - template.holes);
    const componentsDiff = Math.abs(Math.max(1, components) - template.components);
    const score = corr - componentsDiff * COMPONENTS_PENALTY_WEIGHT - holesDiff * HOLES_PENALTY_WEIGHT;
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
    return { rank: bestRank, confidence: 0, holes, components };
  }

  // Map passing scores into ~62–99 so recognition gate is reachable
  const scoreHeadroom = bestScore - MIN_RANK_CORRELATION;
  const marginHeadroom = margin - MIN_RANK_MARGIN;
  const confidence = Math.max(
    0,
    Math.min(0.99, 0.62 + scoreHeadroom * 0.95 + marginHeadroom * 0.85)
  );
  return { rank: bestRank, confidence, holes, components };
}

/**
 * Classify a suit glyph patch. Color (red vs black) is a near-perfect prior
 * for playing cards, so it is used first to narrow the candidate set to two
 * (♥/♦ or ♠/♣), then NCC template correlation picks between those two —
 * this is far more reliable than the previous brightness-guessing heuristic
 * and gives a real, independent confidence score.
 */
function classifySuit(
  suitGray: Float32Array,
  suitColor: Uint8ClampedArray
): { suit: string; confidence: number } {
  let red = 0;
  let black = 0;
  for (let i = 0; i < suitColor.length; i += 4) {
    const pr = suitColor[i];
    const pg = suitColor[i + 1];
    const pb = suitColor[i + 2];
    if (pr > 120 && pr - pg > 30 && pr - pb > 30) red++;
    else if (pr < 110 && pg < 110 && pb < 110) black++;
  }
  const totalInk = red + black;
  const isRed = red >= black;
  const colorConfidence = totalInk > 0 ? Math.abs(red - black) / totalInk : 0;
  const candidates = isRed ? ["♥", "♦"] : ["♠", "♣"];

  const templates = ensureSuitTemplates();
  const normQuery = normalizePatch(suitGray);

  let bestSuit = candidates[0];
  let bestScore = -Infinity;
  let secondScore = -Infinity;
  for (const suit of candidates) {
    const template = templates.get(suit);
    if (!template) continue;
    const score = correlate(normQuery, template.gray);
    if (score > bestScore) {
      secondScore = bestScore;
      bestSuit = suit;
      bestScore = score;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  const margin = bestScore - secondScore;
  if (margin < MIN_SUIT_MARGIN || bestScore < MIN_SUIT_CORRELATION || totalInk < 3) {
    return { suit: bestSuit, confidence: 0 };
  }

  const scoreHeadroom = bestScore - MIN_SUIT_CORRELATION;
  const marginHeadroom = margin - MIN_SUIT_MARGIN;
  // Fold color-decision strength in as a multiplier — an ambiguous red/black
  // split (small corner, glare, etc.) should never report high confidence
  // even if the shape correlation happens to look good.
  const shapeConfidence = Math.max(
    0,
    Math.min(0.99, 0.5 + scoreHeadroom * 0.9 + marginHeadroom * 0.8)
  );
  const confidence = shapeConfidence * (0.55 + 0.45 * colorConfidence);
  return { suit: bestSuit, confidence };
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
  const fillRatio = area / (w * h || 1);
  const areaFrac = area / frameArea;
  const wFrac = w / width;
  const hFrac = h / height;
  // Orientation-agnostic: identical value whether the card is portrait or
  // rotated to landscape, so one band covers both without an "or" branch.
  const minDim = Math.min(w, h);
  const maxDim = Math.max(w, h) || 1;
  const aspectRatio = minDim / maxDim;

  const metrics: DebugMetrics = {
    widthPx: w,
    heightPx: h,
    frameW: width,
    frameH: height,
    relWidthPct: Math.round(wFrac * 1000) / 10,
    relHeightPct: Math.round(hFrac * 1000) / 10,
    aspectRatio: Math.round(aspectRatio * 1000) / 1000,
  };

  const face = regionFaceStats(gray, width, height, region);
  const edgeScore = perimeterEdgeScore(gray, width, height, region);

  const fail = (reason: string): ScoredCandidate => ({
    region,
    detectionConfidence: 0,
    reason,
    accepted: false,
    face,
    edgeScore,
    metrics,
  });

  if (areaFrac < MIN_AREA_FRAC || wFrac < MIN_DIM_FRAC || hFrac < MIN_DIM_FRAC) {
    return fail("too_small");
  }
  if (areaFrac > MAX_AREA_FRAC || wFrac > MAX_DIM_FRAC || hFrac > MAX_DIM_FRAC) {
    return fail("too_large");
  }
  if (aspectRatio < MIN_ASPECT_RATIO || aspectRatio > MAX_ASPECT_RATIO) {
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
  const aspectIdeal = 1 - Math.min(1, Math.abs(aspectRatio - 0.71) / 0.22);
  const sizeIdeal =
    areaFrac >= 0.03 && areaFrac <= 0.45 ? 1 : areaFrac < 0.03 ? areaFrac / 0.03 : Math.max(0, 1 - (areaFrac - 0.45) / 0.3);
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
      metrics,
    };
  }

  return {
    region,
    detectionConfidence,
    reason: "ok",
    accepted: true,
    face,
    edgeScore,
    metrics,
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
 * A real card's face is mostly-but-not-uniformly bright: pips, rank text,
 * suit ink, and soft shadows regularly dip below the brightness threshold
 * and split what is visually one card into several small disconnected
 * bright blobs. Without this merge step, `scoreCardCandidate` would only
 * ever see those small sub-patches (e.g. just the whitespace between two
 * pips) instead of the true card boundary — which is exactly why a
 * full-size card in frame was being reported as "too small" / wrong
 * aspect ratio. Bridge blobs whose (slightly expanded) bounding boxes
 * touch or overlap into one combined region before scoring.
 */
function mergeNearbyRegions(regions: RawRegion[], width: number, height: number): RawRegion[] {
  if (regions.length <= 1) return regions;

  // Bridge gaps up to ~2% of the frame's longest side — enough to span ink
  // strokes and minor shadow bands without merging unrelated objects.
  const gap = Math.max(2, Math.round(Math.max(width, height) * 0.02));
  const expanded = regions.map((r) => ({
    minX: r.x - gap,
    minY: r.y - gap,
    maxX: r.x + r.w + gap,
    maxY: r.y + r.h + gap,
  }));

  const parent = regions.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  const overlaps = (a: (typeof expanded)[number], b: (typeof expanded)[number]) =>
    a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;

  for (let i = 0; i < expanded.length; i++) {
    for (let j = i + 1; j < expanded.length; j++) {
      if (overlaps(expanded[i], expanded[j])) union(i, j);
    }
  }

  const groups = new Map<number, RawRegion[]>();
  for (let i = 0; i < regions.length; i++) {
    const root = find(i);
    const bucket = groups.get(root);
    if (bucket) bucket.push(regions[i]);
    else groups.set(root, [regions[i]]);
  }

  const merged: RawRegion[] = [];
  for (const group of Array.from(groups.values())) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let area = 0;
    for (const r of group) {
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w);
      maxY = Math.max(maxY, r.y + r.h);
      area += r.area;
    }
    merged.push({ x: minX, y: minY, w: maxX - minX, h: maxY - minY, area });
  }

  return merged.sort((a, b) => b.area - a.area);
}

/**
 * A standard card prints its rank+suit index stacked in the top-left corner
 * (and again, upside-down, in the bottom-right). Since detection only gives
 * us an axis-aligned bbox (no true perspective/rotation solve), we sample
 * each of the four corners *as if it were* the top-left in its own local
 * "inward" direction — this transparently covers a card presented upright,
 * upside-down (180°), or on either 180°-symmetric side without ever
 * touching the bbox/geometry itself. The caller tries all four and keeps
 * whichever corner actually yields a confident rank read.
 */
type CornerId = "tl" | "tr" | "bl" | "br";
const CORNER_IDS: CornerId[] = ["tl", "tr", "bl", "br"];
const CORNER_DIR: Record<CornerId, { dx: 1 | -1; dy: 1 | -1 }> = {
  tl: { dx: 1, dy: 1 },
  tr: { dx: -1, dy: 1 },
  bl: { dx: 1, dy: -1 },
  br: { dx: -1, dy: -1 },
};

/* Index-window geometry, expressed as fractions of the card bbox and measured
 * inward from whichever corner is being sampled. Rank sits at the very top of
 * the index block; the suit pip sits directly beneath it. */
const INDEX_INSET_U = 0.045;
const INDEX_INSET_V = 0.035;
const INDEX_SIZE_U = 0.3;
const RANK_SIZE_V = 0.145;
const SUIT_GAP_V = 0.012;
const SUIT_SIZE_V = 0.115;
const SUIT_SIZE_U = 0.24;

/** Sample a sub-window of the index block (rank or suit) anchored at one bbox corner, resampled to a fixed-size patch. */
function sampleIndexWindow(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  bbox: { x: number; y: number; w: number; h: number },
  corner: CornerId,
  vOffsetFrac: number,
  sizeVFrac: number,
  sizeUFrac: number,
  patchW: number,
  patchH: number
): { gray: Float32Array; color: Uint8ClampedArray } {
  const { dx, dy } = CORNER_DIR[corner];
  const originX = dx > 0 ? bbox.x : bbox.x + bbox.w;
  const originY = dy > 0 ? bbox.y : bbox.y + bbox.h;

  const gray = new Float32Array(patchW * patchH);
  const color = new Uint8ClampedArray(patchW * patchH * 4);

  for (let py = 0; py < patchH; py++) {
    for (let px = 0; px < patchW; px++) {
      const u = px / Math.max(1, patchW - 1);
      const v = py / Math.max(1, patchH - 1);
      // Slight shear approximates small perspective tilt, same tolerance as before.
      const offU = INDEX_INSET_U + u * sizeUFrac + v * sizeVFrac * 0.05;
      const offV = INDEX_INSET_V + vOffsetFrac + v * sizeVFrac;
      const sx = Math.min(width - 1, Math.max(0, Math.round(originX + dx * offU * bbox.w)));
      const sy = Math.min(height - 1, Math.max(0, Math.round(originY + dy * offV * bbox.h)));
      const src = (sy * width + sx) * 4;
      const dst = (py * patchW + px) * 4;
      color[dst] = data[src];
      color[dst + 1] = data[src + 1];
      color[dst + 2] = data[src + 2];
      color[dst + 3] = 255;
      gray[py * patchW + px] = (data[src] + data[src + 1] + data[src + 2]) / 3;
    }
  }

  return { gray, color };
}

type CardRecognition = {
  corner: CornerId;
  rank: string;
  rankConfidence: number;
  suit: string;
  suitConfidence: number;
};

/**
 * Full corner/index recognition pipeline for one detected card region:
 * for each of the four corners, crop+normalize the rank and suit sub-windows
 * and classify both independently, then keep the corner whose RANK read was
 * most confident (suit is secondary and follows whichever corner wins).
 * This is the "try multiple corners" rotation strategy from the spec.
 */
function recognizeCard(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  bbox: { x: number; y: number; w: number; h: number }
): CardRecognition {
  let best: CardRecognition | null = null;

  for (const corner of CORNER_IDS) {
    const rankWindow = sampleIndexWindow(
      data,
      width,
      height,
      bbox,
      corner,
      0,
      RANK_SIZE_V,
      INDEX_SIZE_U,
      RANK_PATCH_W,
      RANK_PATCH_H
    );
    const rankResult = classifyRank(rankWindow.gray);

    const suitWindow = sampleIndexWindow(
      data,
      width,
      height,
      bbox,
      corner,
      RANK_SIZE_V + SUIT_GAP_V,
      SUIT_SIZE_V,
      SUIT_SIZE_U,
      SUIT_PATCH_W,
      SUIT_PATCH_H
    );
    const suitResult = classifySuit(suitWindow.gray, suitWindow.color);

    const rankConfidence = Math.round(rankResult.confidence * 100);
    const suitConfidence = Math.round(suitResult.confidence * 100);

    if (!best || rankConfidence > best.rankConfidence) {
      best = { corner, rank: rankResult.rank, rankConfidence, suit: suitResult.suit, suitConfidence };
    }
  }

  return (
    best ?? { corner: "tl", rank: "A", rankConfidence: 0, suit: "♠", suitConfidence: 0 }
  );
}

/**
 * Read the source's native pixel dimensions. `CanvasImageSource` covers
 * <video>, <img>, <canvas>, and ImageBitmap — duck-type across them so the
 * detector always knows the *true* frame aspect ratio instead of assuming
 * one fixed resolution/shape.
 */
function getSourceSize(source: CanvasImageSource): { width: number; height: number } {
  if ("videoWidth" in source && "videoHeight" in source) {
    const v = source as HTMLVideoElement;
    if (v.videoWidth && v.videoHeight) return { width: v.videoWidth, height: v.videoHeight };
  }
  if ("naturalWidth" in source && "naturalHeight" in source) {
    const img = source as HTMLImageElement;
    if (img.naturalWidth && img.naturalHeight) return { width: img.naturalWidth, height: img.naturalHeight };
  }
  const generic = source as { width?: number; height?: number };
  if (generic.width && generic.height) return { width: generic.width, height: generic.height };
  return { width: PROCESS_MAX_DIM, height: Math.round((PROCESS_MAX_DIM * 3) / 4) };
}

function formatDebugReason(accepted: boolean, reason: string, m: DebugMetrics): string {
  const status = accepted ? "CARD DETECTED" : `Rejected: ${reason.replace(/_/g, " ")}`;
  return `${status} — W:${m.widthPx}px H:${m.heightPx}px Frame:${m.frameW}x${m.frameH} relW:${m.relWidthPct}% relH:${m.relHeightPct}% AR:${m.aspectRatio}`;
}

export function detectCardsInFrame(
  source: CanvasImageSource,
  processCanvas: HTMLCanvasElement,
  processCtx: CanvasRenderingContext2D,
  statsOut?: FrameDetectionStats,
  debugOut?: DebugRect[]
): FrameDetection[] {
  // Size the processing canvas to match the camera's own aspect ratio
  // (uniform scale on both axes) instead of forcing a fixed 320x240 (4:3)
  // buffer. Forcing a mismatched shape here silently stretches/squishes
  // every object in frame — including real cards — before any geometry
  // check ever runs, which was corrupting the aspect-ratio measurement at
  // the source.
  const { width: srcW, height: srcH } = getSourceSize(source);
  const scale = PROCESS_MAX_DIM / Math.max(srcW, srcH, 1);
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));

  processCanvas.width = width;
  processCanvas.height = height;
  processCtx.drawImage(source, 0, 0, width, height);

  const image = processCtx.getImageData(0, 0, width, height);
  const gray = grayscale(image.data, width, height);
  const rawRegions = mergeNearbyRegions(findBrightRegions(gray, width, height), width, height);

  const scored: ScoredCandidate[] = [];
  const rejects: ScoredCandidate[] = [];

  for (const region of rawRegions) {
    const result = scoreCardCandidate(gray, width, height, region);
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
          x: c.region.x / width,
          y: c.region.y / height,
          w: c.region.w / width,
          h: c.region.h / height,
        },
        accepted: true,
        detectionConfidence: c.detectionConfidence,
        reason: formatDebugReason(true, c.reason, c.metrics),
        metrics: c.metrics,
      });
    }
    for (const c of rejects) {
      debugOut.push({
        bbox: {
          x: c.region.x / width,
          y: c.region.y / height,
          w: c.region.w / width,
          h: c.region.h / height,
        },
        accepted: false,
        detectionConfidence: c.detectionConfidence,
        reason: formatDebugReason(false, c.reason, c.metrics),
        metrics: c.metrics,
      });
    }
  }

  const detections: FrameDetection[] = [];
  let recognized = 0;

  for (const candidate of accepted) {
    const rec = recognizeCard(image.data, width, height, candidate.region);
    // Rank and suit each gate on their OWN threshold — a confident rank with
    // a weak suit read still reports the rank; detectionConfidence never
    // factors into either decision.
    const recognitionOk = rec.rankConfidence >= RECOGNITION_CONF_MIN;
    const suitOk = rec.suitConfidence >= SUIT_CONF_MIN;

    if (recognitionOk) recognized++;

    // Shape/presence is accepted independently of rank recognition: a card
    // is reported as detected the moment its geometry passes, and rank/suit
    // recognition is attempted afterward without gating detection on it.
    detections.push({
      rank: recognitionOk ? rec.rank : null,
      suit: suitOk ? rec.suit : null,
      detectionConfidence: candidate.detectionConfidence,
      recognitionConfidence: recognitionOk ? rec.rankConfidence : 0,
      suitConfidence: suitOk ? rec.suitConfidence : 0,
      recognitionUncertain: !recognitionOk,
      confirmed: false,
      bbox: {
        x: candidate.region.x / width,
        y: candidate.region.y / height,
        w: candidate.region.w / width,
        h: candidate.region.h / height,
      },
      cx: (candidate.region.x + candidate.region.w / 2) / width,
      cy: (candidate.region.y + candidate.region.h / 2) / height,
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
          ? `detection ${detections[0].detectionConfidence}% / rank uncertain`
          : `${detections[0].rank ?? "?"}${detections[0].suit ?? "?"} — detection ${detections[0].detectionConfidence}% / rank ${detections[0].recognitionConfidence}% / suit ${detections[0].suitConfidence}%`
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
  suitConfidence: number;
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
          suitConfidence: det.suitConfidence,
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
          if (det.suit && det.suitConfidence >= match.suitConfidence) {
            match.suit = det.suit;
            match.suitConfidence = det.suitConfidence;
          }
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
          match.suitConfidence = det.suitConfidence;
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
          suitConfidence: match.suitConfidence,
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
        suitConfidence: t.suitConfidence,
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
    suitConfidence: 100,
    manual: true,
  };
}

export { RANK_LIST as VISION_RANKS, suits as VISION_SUITS };
