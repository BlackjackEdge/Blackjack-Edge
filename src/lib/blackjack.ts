export type Move = "H" | "S" | "D" | "P" | "R";
export type HandCategory = "hard" | "soft" | "pair";

export type TrainingHand = {
  player: string[];
  dealer: string;
  answer: Move;
  category: HandCategory;
};

export const moveNames: Record<Move, string> = {
  H: "Hit",
  S: "Stand",
  D: "Double",
  P: "Split",
  R: "Surrender",
};

export const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
export const suits = ["♠", "♥", "♦", "♣"];
export const suitLetters = ["S", "H", "D", "C"] as const;
export const dealerRanks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"];

export const MIN_BET = 5;
export const MAX_BET = 250_000;
export const DEFAULT_BANKROLL = 1000;

/** Net P/L from play only — excludes bankroll top-ups. */
export function calcTotalProfitLoss(
  currentBankroll: number,
  startingBankroll: number,
  bankrollAdded: number
): number {
  return currentBankroll - startingBankroll - bankrollAdded;
}

export function formatProfitLoss(amount: number): string {
  if (amount === 0) return "$0";
  const sign = amount > 0 ? "+" : "-";
  return `${sign}$${Math.abs(amount).toLocaleString()}`;
}

export type BankrollStatsFields = {
  startingBankroll: number;
  bankrollAdded: number;
  biggestWin: number;
  biggestLoss: number;
};

export function migrateBankrollStats<T extends Partial<BankrollStatsFields>>(
  saved: T,
  currentBankroll: number
): BankrollStatsFields {
  return {
    startingBankroll:
      typeof saved.startingBankroll === "number" ? saved.startingBankroll : DEFAULT_BANKROLL,
    bankrollAdded: typeof saved.bankrollAdded === "number" ? saved.bankrollAdded : 0,
    biggestWin: typeof saved.biggestWin === "number" ? saved.biggestWin : 0,
    biggestLoss: typeof saved.biggestLoss === "number" ? saved.biggestLoss : 0,
  };
}

const SUIT_LETTER_MAP: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const VALID_RANKS = new Set(ranks);

export function cardRank(card: string): string {
  if (!card || card === "back") return "";
  const trimmed = card.trim();
  const letterMatch = trimmed.match(/^((?:10|[2-9AJQK]))([SHDC])$/i);
  if (letterMatch) {
    const r = letterMatch[1].toUpperCase();
    return r === "10" ? "10" : r;
  }
  const unicodeRank = trimmed.replace(/[♠♥♦♣]/g, "");
  if (VALID_RANKS.has(unicodeRank)) return unicodeRank;
  if (VALID_RANKS.has(trimmed)) return trimmed;
  return trimmed;
}

export function cardSuit(card: string): string {
  if (!card || card === "back") return "♠";
  const trimmed = card.trim();
  const letterMatch = trimmed.match(/^((?:10|[2-9AJQK]))([SHDC])$/i);
  if (letterMatch) return SUIT_LETTER_MAP[letterMatch[2].toUpperCase()] || "♠";
  const unicode = trimmed.match(/[♠♥♦♣]/);
  if (unicode) return unicode[0];
  return "♠";
}

export function isKnownCard(card: string): boolean {
  if (!card || card === "back") return true;
  const rank = cardRank(card);
  return VALID_RANKS.has(rank);
}

export function recommendedBetUnits(trueCount: number): number {
  const tc = Math.floor(trueCount);
  if (tc < 2) return 1;
  if (tc === 2) return 2;
  if (tc === 3) return 4;
  if (tc === 4) return 6;
  return 8;
}

export function recommendedTrainingBet(
  trueCount: number,
  bankroll: number,
  minBet = MIN_BET,
  maxBet = MAX_BET
) {
  const units = recommendedBetUnits(trueCount);
  const flooredTc = Math.floor(trueCount);
  const amount = Math.min(units * minBet, maxBet, Math.max(bankroll, 0));
  return {
    amount,
    units,
    unitSize: minBet,
    trueCount: flooredTc,
    reason: `True count ${flooredTc >= 0 ? "+" : ""}${flooredTc}`,
  };
}

export function cardValue(card: string): number {
  const rank = cardRank(card);
  if (rank === "A") return 11;
  if (["10", "J", "Q", "K"].includes(rank)) return 10;
  return Number(rank);
}

export function handValue(cards: string[]) {
  let total = cards.reduce((sum, card) => sum + cardValue(card), 0);
  let aces = cards.filter((card) => cardRank(card) === "A").length;

  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  const hasUsableAce = cards.some((card) => cardRank(card) === "A") && total <= 21 && cards.reduce((sum, card) => sum + (cardRank(card) === "A" ? 11 : cardValue(card)), 0) === total;

  return { total, soft: hasUsableAce };
}

export function isBlackjack(cards: string[]) {
  return cards.length === 2 && handValue(cards).total === 21;
}

export function isBust(cards: string[]) {
  return handValue(cards).total > 21;
}

export function isPair(cards: string[]) {
  if (cards.length !== 2) return false;
  const normalize = (card: string) => (cardValue(card) === 10 ? "10" : cardRank(card));
  return normalize(cards[0]) === normalize(cards[1]);
}

/** Late surrender: first decision on an original (non-split) two-card hand, not blackjack. */
export function canSurrenderHand(hand: {
  cards: string[];
  fromSplit?: boolean;
}): boolean {
  if (hand.fromSplit) return false;
  if (hand.cards.length !== 2) return false;
  if (isBlackjack(hand.cards)) return false;
  return true;
}

export function surrenderReturn(bet: number): number {
  return Math.floor(bet / 2);
}

export function pairKey(cards: string[]) {
  const rank = cardValue(cards[0]) === 10 ? "10" : cardRank(cards[0]);
  return `${rank},${rank}`;
}

function dealerIndex(card: string) {
  const rank = cardRank(card);
  const normalized = cardValue(card) === 10 && rank !== "A" ? "10" : rank;
  return dealerRanks.indexOf(normalized);
}

// 6-deck, 3:2, S17, DAS, late surrender.
export const hardRows = ["5-8", "9", "10", "11", "12", "13", "14", "15", "16", "17+"];
export const softRows = ["A,2", "A,3", "A,4", "A,5", "A,6", "A,7", "A,8", "A,9"];
export const pairRows = ["A,A", "10,10", "9,9", "8,8", "7,7", "6,6", "5,5", "4,4", "3,3", "2,2"];

export const hardChart: Record<string, Move[]> = {
  "5-8": ["H", "H", "H", "H", "H", "H", "H", "H", "H", "H"],
  "9": ["H", "D", "D", "D", "D", "H", "H", "H", "H", "H"],
  "10": ["D", "D", "D", "D", "D", "D", "D", "D", "H", "H"],
  "11": ["D", "D", "D", "D", "D", "D", "D", "D", "D", "H"],
  "12": ["H", "H", "S", "S", "S", "H", "H", "H", "H", "H"],
  "13": ["S", "S", "S", "S", "S", "H", "H", "H", "H", "H"],
  "14": ["S", "S", "S", "S", "S", "H", "H", "H", "H", "H"],
  "15": ["S", "S", "S", "S", "S", "H", "H", "H", "R", "H"],
  "16": ["S", "S", "S", "S", "S", "H", "H", "R", "R", "R"],
  "17+": ["S", "S", "S", "S", "S", "S", "S", "S", "S", "S"],
};

export const softChart: Record<string, Move[]> = {
  "A,2": ["H", "H", "H", "D", "D", "H", "H", "H", "H", "H"],
  "A,3": ["H", "H", "H", "D", "D", "H", "H", "H", "H", "H"],
  "A,4": ["H", "H", "D", "D", "D", "H", "H", "H", "H", "H"],
  "A,5": ["H", "H", "D", "D", "D", "H", "H", "H", "H", "H"],
  "A,6": ["H", "D", "D", "D", "D", "H", "H", "H", "H", "H"],
  "A,7": ["S", "D", "D", "D", "D", "S", "S", "H", "H", "H"],
  "A,8": ["S", "S", "S", "S", "D", "S", "S", "S", "S", "S"],
  "A,9": ["S", "S", "S", "S", "S", "S", "S", "S", "S", "S"],
};

export const pairChart: Record<string, Move[]> = {
  "A,A": ["P", "P", "P", "P", "P", "P", "P", "P", "P", "P"],
  "10,10": ["S", "S", "S", "S", "S", "S", "S", "S", "S", "S"],
  "9,9": ["P", "P", "P", "P", "P", "S", "P", "P", "S", "S"],
  "8,8": ["P", "P", "P", "P", "P", "P", "P", "P", "P", "P"],
  "7,7": ["P", "P", "P", "P", "P", "P", "H", "H", "H", "H"],
  "6,6": ["P", "P", "P", "P", "P", "H", "H", "H", "H", "H"],
  "5,5": ["D", "D", "D", "D", "D", "D", "D", "D", "H", "H"],
  "4,4": ["H", "H", "H", "P", "P", "H", "H", "H", "H", "H"],
  "3,3": ["P", "P", "P", "P", "P", "P", "H", "H", "H", "H"],
  "2,2": ["P", "P", "P", "P", "P", "P", "H", "H", "H", "H"],
};

export function correctAction(player: string[], dealer: string): Move {
  const index = Math.max(0, dealerIndex(dealer));

  if (player.length < 2) return "H";

  if (isPair(player)) {
    const pair = pairChart[pairKey(player)];
    return pair ? pair[index] : "H";
  }

  const value = handValue(player);

  if (value.soft && player.length === 2) {
    const nonAce = player.find((card) => cardRank(card) !== "A");
    if (!nonAce) return "H";
    const soft = softChart[`A,${cardValue(nonAce)}`];
    return soft ? soft[index] : "H";
  }

  const key = value.total <= 8 ? "5-8" : value.total >= 17 ? "17+" : String(value.total);
  const hard = hardChart[key];
  return hard ? hard[index] : "H";
}

export function randomTrainingRank() {
  return ranks[Math.floor(Math.random() * ranks.length)];
}

export function generateTrainingHand(): TrainingHand {
  const type = Math.random();
  let player: string[];

  if (type < 0.3) {
    const rank = randomTrainingRank();
    player = [rank, rank];
  } else if (type < 0.58) {
    player = ["A", ranks[1 + Math.floor(Math.random() * 9)]];
  } else {
    do {
      player = [randomTrainingRank(), randomTrainingRank()];
    } while (handValue(player).total < 5 || handValue(player).total > 20);
  }

  const dealer = dealerRanks[Math.floor(Math.random() * dealerRanks.length)];
  const category = isPair(player) ? "pair" : handValue(player).soft ? "soft" : "hard";
  return { player, dealer, answer: correctAction(player, dealer), category };
}

export function handLabel(hand: TrainingHand) {
  if (isPair(hand.player)) return `Pair ${pairKey(hand.player)}`;
  const value = handValue(hand.player);
  return `${value.soft ? "Soft" : "Hard"} ${value.total}`;
}

export function hiLo(card: string) {
  const rank = cardRank(card);
  if (["2", "3", "4", "5", "6"].includes(rank)) return 1;
  if (["10", "J", "Q", "K", "A"].includes(rank)) return -1;
  return 0;
}

export function buildShoe(decks: number) {
  const shoe: string[] = [];

  for (let d = 0; d < decks; d++) {
    for (const letter of suitLetters) {
      for (const rank of ranks) shoe.push(`${rank}${letter}`);
    }
  }

  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }

  return shoe;
}

export function shouldDealerHit(cards: string[], hitSoft17 = true) {
  const value = handValue(cards);
  if (value.total < 17) return true;
  if (value.total === 17 && value.soft && hitSoft17) return true;
  return false;
}

export function formatMove(move: Move) {
  return moveNames[move];
}
