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
  R: "Surrender"
};

export const moveColors: Record<Move, string> = {
  H: "blue",
  S: "green",
  D: "gold",
  P: "purple",
  R: "gray"
};

export const ranks = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
export const dealerRanks = ["2","3","4","5","6","7","8","9","10","A"];

export function cardValue(card: string): number {
  if (card === "A") return 11;
  if (["10","J","Q","K"].includes(card)) return 10;
  return Number(card);
}

export function handValue(cards: string[]) {
  let total = cards.reduce((sum, card) => sum + cardValue(card), 0);
  let aces = cards.filter(card => card === "A").length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  const raw = cards.reduce((sum, card) => sum + (card === "A" ? 11 : cardValue(card)), 0);
  return { total, soft: cards.includes("A") && total <= 21 && raw === total };
}

export function isPair(cards: string[]) {
  if (cards.length !== 2) return false;
  const normalize = (card: string) => cardValue(card) === 10 ? "10" : card;
  return normalize(cards[0]) === normalize(cards[1]);
}

export function pairKey(cards: string[]) {
  const rank = cardValue(cards[0]) === 10 ? "10" : cards[0];
  return `${rank},${rank}`;
}

function dealerIndex(card: string) {
  const normalized = cardValue(card) === 10 && card !== "A" ? "10" : card;
  return dealerRanks.indexOf(normalized);
}

// 6-deck, 3:2, S17, DAS, late surrender.
export const hardRows = ["5-8","9","10","11","12","13","14","15","16","17+"];
export const softRows = ["A,2","A,3","A,4","A,5","A,6","A,7","A,8","A,9"];
export const pairRows = ["A,A","10,10","9,9","8,8","7,7","6,6","5,5","4,4","3,3","2,2"];

export const hardChart: Record<string, Move[]> = {
 "5-8":["H","H","H","H","H","H","H","H","H","H"],
 "9":["H","D","D","D","D","H","H","H","H","H"],
 "10":["D","D","D","D","D","D","D","D","H","H"],
 "11":["D","D","D","D","D","D","D","D","D","H"],
 "12":["H","H","S","S","S","H","H","H","H","H"],
 "13":["S","S","S","S","S","H","H","H","H","H"],
 "14":["S","S","S","S","S","H","H","H","H","H"],
 "15":["S","S","S","S","S","H","H","H","R","H"],
 "16":["S","S","S","S","S","H","H","R","R","R"],
 "17+":["S","S","S","S","S","S","S","S","S","S"]
};

export const softChart: Record<string, Move[]> = {
 "A,2":["H","H","H","D","D","H","H","H","H","H"],
 "A,3":["H","H","H","D","D","H","H","H","H","H"],
 "A,4":["H","H","D","D","D","H","H","H","H","H"],
 "A,5":["H","H","D","D","D","H","H","H","H","H"],
 "A,6":["H","D","D","D","D","H","H","H","H","H"],
 "A,7":["S","D","D","D","D","S","S","H","H","H"],
 "A,8":["S","S","S","S","D","S","S","S","S","S"],
 "A,9":["S","S","S","S","S","S","S","S","S","S"]
};

export const pairChart: Record<string, Move[]> = {
 "A,A":["P","P","P","P","P","P","P","P","P","P"],
 "10,10":["S","S","S","S","S","S","S","S","S","S"],
 "9,9":["P","P","P","P","P","S","P","P","S","S"],
 "8,8":["P","P","P","P","P","P","P","P","P","P"],
 "7,7":["P","P","P","P","P","P","H","H","H","H"],
 "6,6":["P","P","P","P","P","H","H","H","H","H"],
 "5,5":["D","D","D","D","D","D","D","D","H","H"],
 "4,4":["H","H","H","P","P","H","H","H","H","H"],
 "3,3":["P","P","P","P","P","P","H","H","H","H"],
 "2,2":["P","P","P","P","P","P","H","H","H","H"]
};

export function correctAction(player: string[], dealer: string): Move {
  const index = dealerIndex(dealer);
  if (isPair(player)) return pairChart[pairKey(player)][index];

  const value = handValue(player);
  if (value.soft && player.length === 2) {
    const nonAce = player.find(card => card !== "A");
    return softChart[`A,${cardValue(nonAce!)}`][index];
  }

  const key = value.total <= 8 ? "5-8" : value.total >= 17 ? "17+" : String(value.total);
  return hardChart[key][index];
}

export function randomCard() {
  return ranks[Math.floor(Math.random() * ranks.length)];
}

export function generateTrainingHand(): TrainingHand {
  const type = Math.random();
  let player: string[];

  if (type < 0.3) {
    const rank = randomCard();
    player = [rank, rank];
  } else if (type < 0.58) {
    player = ["A", ranks[1 + Math.floor(Math.random() * 9)]];
  } else {
    do {
      player = [randomCard(), randomCard()];
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
  if (["2","3","4","5","6"].includes(card)) return 1;
  if (["10","J","Q","K","A"].includes(card)) return -1;
  return 0;
}

export function buildShoe(decks: number) {
  const shoe: string[] = [];
  for (let d = 0; d < decks; d++) {
    for (let s = 0; s < 4; s++) shoe.push(...ranks);
  }
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}
