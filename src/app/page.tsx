"use client";

import { useEffect, useMemo, useState } from "react";
import { Brain, ChevronLeft, ChevronRight, Clock, RotateCcw, Sparkles, PlayCircle, Lightbulb, Gauge, Settings2, HelpCircle } from "lucide-react";
import {
  buildShoe,
  correctAction,
  formatMove,
  generateTrainingHand,
  handLabel,
  handValue,
  hiLo,
  isBlackjack,
  isBust,
  isPair,
  moveNames,
  shouldDealerHit,
  type Move,
  type TrainingHand,
} from "@/lib/blackjack";
import { Coach, Logo, PlayingCard, StrategyCardOverlay } from "@/components/ui";

type Screen = "home" | "basic" | "basicDrill" | "basicResults" | "counting" | "countLearn" | "countDrill" | "play";
type HandResult = { hand: TrainingHand; choice: Move; seconds: number };
type SwipeValue = -1 | 0 | 1;

type PlayerHand = {
  cards: string[];
  bet: number;
  seatIndex?: number;
  doubled?: boolean;
  stood?: boolean;
  busted?: boolean;
  result?: string;
  payout?: number;
};

type PlayPhase = "betting" | "player" | "dealer" | "roundOver";

const avg = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const swipeValue = (card: string): SwipeValue => hiLo(card) === 1 ? 1 : hiLo(card) === -1 ? -1 : 0;
const chipValues = [5, 25, 50, 100, 250, 500, 1000];

const premiumChips: Record<number, { label: string; image: string }> = {
  5: { label: "$5", image: "/chips/chip-5.png" },
  25: { label: "$25", image: "/chips/chip-25.png" },
  50: { label: "$50", image: "/chips/chip-50.png" },
  100: { label: "$100", image: "/chips/chip-100.png" },
  250: { label: "$250", image: "/chips/chip-250.png" },
  500: { label: "$500", image: "/chips/chip-500.png" },
  1000: { label: "$1K", image: "/chips/chip-1000.png" },
};
const STORAGE_KEY = "blackjack-edge-v0310-session";

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [now, setNow] = useState(Date.now());
  const [strategyOpen, setStrategyOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState<"basic" | "counting" | "play" | "strategy" | null>(null);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);

  const [roundSize, setRoundSize] = useState(10);
  const [currentHand, setCurrentHand] = useState<TrainingHand | null>(null);
  const [handIndex, setHandIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [start, setStart] = useState(0);
  const [results, setResults] = useState<HandResult[]>([]);
  const [feedback, setFeedback] = useState("The table is ready. Pick the correct play.");

  const [shoe, setShoe] = useState<string[]>([]);
  const [countCard, setCountCard] = useState<string | null>(null);
  const [dealt, setDealt] = useState<string[]>([]);
  const [countCards, setCountCards] = useState(20);
  const [countDecks, setCountDecks] = useState(6);
  const [guided, setGuided] = useState(true);
  const [countCorrect, setCountCorrect] = useState(0);
  const [cardStart, setCardStart] = useState(0);
  const [swipeTimes, setSwipeTimes] = useState<number[]>([]);
  const [runningGuess, setRunningGuess] = useState("");
  const [trueGuess, setTrueGuess] = useState("");
  const [countFeedback, setCountFeedback] = useState("Swipe or tap: left -1, up 0, right +1.");

  const [playDecks, setPlayDecks] = useState(6);
  const [playShoe, setPlayShoe] = useState<string[]>([]);
  const [seenCards, setSeenCards] = useState<string[]>([]);
  const [bankroll, setBankroll] = useState(1000);
  const [bet, setBet] = useState(0);
  const [selectedChip, setSelectedChip] = useState(5);
  const [seatBets, setSeatBets] = useState<number[]>([0, 0, 0]);
  const [dealerHand, setDealerHand] = useState<string[]>([]);
  const [playerHands, setPlayerHands] = useState<PlayerHand[]>([]);
  const [activeHand, setActiveHand] = useState(0);
  const [playPhase, setPlayPhase] = useState<PlayPhase>("betting");
  const [playMessage, setPlayMessage] = useState("Place your chips and deal.");
  const [bankrollAlert, setBankrollAlert] = useState<{ title: string; message: string } | null>(null);
  const [roundBanner, setRoundBanner] = useState<{ type: "win" | "lose" | "push" | "blackjack"; title: string; subtitle: string } | null>(null);
  const [hudOpen, setHudOpen] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const [showPlayTotals, setShowPlayTotals] = useState(false);
  const [showBasicReview, setShowBasicReview] = useState(false);
  const [countSubmitted, setCountSubmitted] = useState(false);
  const [hasLoadedSession, setHasLoadedSession] = useState(false);

  useEffect(() => {
    const i = window.setInterval(() => setNow(Date.now()), 50);
    return () => window.clearInterval(i);
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);

      if (!raw) {
        setHasLoadedSession(true);
        return;
      }

      const saved = JSON.parse(raw);

      if (typeof saved.bankroll === "number") setBankroll(saved.bankroll);
      if (typeof saved.bet === "number") setBet(saved.bet);
      if (typeof saved.selectedChip === "number") setSelectedChip(saved.selectedChip);
      if (Array.isArray(saved.seatBets) && saved.seatBets.length === 3) setSeatBets(saved.seatBets);
      if (typeof saved.playDecks === "number") setPlayDecks(saved.playDecks);
      if (Array.isArray(saved.playShoe)) setPlayShoe(saved.playShoe);
      if (Array.isArray(saved.seenCards)) setSeenCards(saved.seenCards);
      if (Array.isArray(saved.dealerHand)) setDealerHand(saved.dealerHand);
      if (Array.isArray(saved.playerHands)) setPlayerHands(saved.playerHands);
      if (typeof saved.activeHand === "number") setActiveHand(saved.activeHand);
      if (["betting", "player", "dealer", "roundOver"].includes(saved.playPhase)) setPlayPhase(saved.playPhase);
      if (typeof saved.playMessage === "string") setPlayMessage(saved.playMessage);
      if (saved.roundBanner === null || typeof saved.roundBanner === "object") setRoundBanner(saved.roundBanner);
      if (typeof saved.showPlayTotals === "boolean") setShowPlayTotals(saved.showPlayTotals);

      if (typeof saved.countDecks === "number") setCountDecks(saved.countDecks);
      if (typeof saved.countCards === "number") setCountCards(saved.countCards);
      if (typeof saved.guided === "boolean") setGuided(saved.guided);

      setPlayMessage((message) => message || "Session restored. Continue playing.");
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setHasLoadedSession(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedSession) return;

    const saved = {
      bankroll,
      bet,
      selectedChip,
      seatBets,
      playDecks,
      playShoe,
      seenCards,
      dealerHand,
      playerHands,
      activeHand,
      playPhase,
      playMessage,
      roundBanner,
      showPlayTotals,
      countDecks,
      countCards,
      guided,
      savedAt: Date.now(),
    };

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // If browser storage is full or blocked, the app should keep working.
    }
  }, [
    hasLoadedSession,
    bankroll,
    bet,
    selectedChip,
    seatBets,
    playDecks,
    playShoe,
    seenCards,
    dealerHand,
    playerHands,
    activeHand,
    playPhase,
    playMessage,
    roundBanner,
    showPlayTotals,
    countDecks,
    countCards,
    guided,
  ]);

  const elapsed = start ? (now - start) / 1000 : 0;
  const accuracy = handIndex ? Math.round((correct / handIndex) * 100) : 0;
  const avgTime = avg(results.map((r) => r.seconds));
  const finalRunning = dealt.reduce((sum, c) => sum + hiLo(c), 0);
  const decksRemaining = Math.max(shoe.length / 52, 0.1);
  const finalTrue = finalRunning / decksRemaining;
  const guessedRunning = Number(runningGuess);
  const guessedTrue = Number(trueGuess);
  const runningGuessIsCorrect = countSubmitted && Number.isFinite(guessedRunning) && guessedRunning === finalRunning;
  const trueGuessIsCorrect = countSubmitted && Number.isFinite(guessedTrue) && Math.abs(guessedTrue - Number(finalTrue.toFixed(1))) <= 0.1;

  const playRunning = seenCards.reduce((sum, c) => sum + hiLo(c), 0);
  const playDecksRemaining = Math.max(playShoe.length / 52, 0.1);
  const playTrue = playRunning / playDecksRemaining;
  const penetration = Math.round(((playDecks * 52 - playShoe.length) / (playDecks * 52)) * 100);
  const totalSeatBet = seatBets.reduce((sum, value) => sum + value, 0);
  const tableSeatOrder = [2, 1, 0]; // blackjack table flow: right hand, center hand, left hand
  const bettingSeats = tableSeatOrder
    .map((seatIndex) => ({ seatBet: seatBets[seatIndex], seatIndex }))
    .filter((seat) => seat.seatBet > 0);

  const activePlayHand = playerHands[activeHand];
  const dealerUpcard = dealerHand[0];
  const canAct = Boolean(playPhase === "player" && activePlayHand && !activePlayHand.stood && !activePlayHand.busted);
  const canSplit = Boolean(canAct && activePlayHand && isPair(activePlayHand.cards) && bankroll >= activePlayHand.bet);
  const canDouble = Boolean(canAct && activePlayHand && activePlayHand.cards.length === 2 && bankroll >= activePlayHand.bet);
  const tipMove = activePlayHand && dealerUpcard && activePlayHand.cards.length >= 2 ? correctAction(activePlayHand.cards, dealerUpcard) : null;

  useEffect(() => {
    if (!hasLoadedSession) return;
    if (!playShoe.length) setPlayShoe(buildShoe(playDecks));
  }, [hasLoadedSession]);

  function startBasic() {
    setResults([]);
    setHandIndex(0);
    setCorrect(0);
    setShowBasicReview(false);
    setFeedback("Cards are out. Make the correct move.");
    setCurrentHand(generateTrainingHand());
    setStart(Date.now());
    setScreen("basicDrill");
  }

  function chooseMove(move: Move) {
    if (!currentHand) return;
    const seconds = (Date.now() - start) / 1000;
    const ok = move === currentHand.answer;

    setResults((prev) => [...prev, { hand: currentHand, choice: move, seconds }]);
    setCorrect((prev) => prev + (ok ? 1 : 0));
    setFeedback(ok ? `Perfect. ${moveNames[move]} is the play.` : `Close. Correct play: ${moveNames[currentHand.answer]}.`);

    const next = handIndex + 1;
    setHandIndex(next);

    window.setTimeout(() => {
      if (next >= roundSize) setScreen("basicResults");
      else {
        setCurrentHand(generateTrainingHand());
        setStart(Date.now());
        setFeedback("Next hand. Stay sharp.");
      }
    }, ok ? 650 : 1150);
  }

  function getNextDifferentCard(current: string | null, shoeList: string[]) {
    if (!shoeList.length) return { nextCard: null, nextShoe: shoeList };
    let nextShoe = [...shoeList];
    let nextCard = nextShoe.pop()!;
    let attempts = 0;

    while (current && nextCard === current && nextShoe.length > 0 && attempts < 20) {
      nextShoe.unshift(nextCard);
      nextCard = nextShoe.pop()!;
      attempts++;
    }

    return { nextCard, nextShoe };
  }

  function startCounting() {
    const fresh = buildShoe(countDecks);
    const { nextCard, nextShoe } = getNextDifferentCard(null, fresh);
    setShoe(nextShoe);
    setCountCard(nextCard);
    setDealt([]);
    setCountCorrect(0);
    setSwipeTimes([]);
    setRunningGuess("");
    setTrueGuess("");
    setCountSubmitted(false);
    setCardStart(Date.now());
    setCountFeedback(guided ? "Guided mode: running count shows as you go." : "Hidden mode: keep the running count in your head.");
    setScreen("countDrill");
  }

  function reDrillSameCountingCards() {
    if (!dealt.length) {
      startCounting();
      return;
    }

    const repeatCards = [...dealt];
    const firstCard = repeatCards[0];

    setShoe(repeatCards.slice(1).reverse());
    setCountCard(firstCard);
    setDealt([]);
    setCountCorrect(0);
    setSwipeTimes([]);
    setRunningGuess("");
    setTrueGuess("");
    setCountSubmitted(false);
    setCardStart(Date.now());
    setCountFeedback("Same drill loaded. Run the count again.");
    setScreen("countDrill");
  }

  function chooseCount(value: SwipeValue) {
    if (!countCard) return;
    const expected = swipeValue(countCard);
    const ms = Date.now() - cardStart;
    const nextDealt = [...dealt, countCard];

    setDealt(nextDealt);
    setSwipeTimes((prev) => [...prev, ms]);
    if (expected === value) setCountCorrect((prev) => prev + 1);
    setCountFeedback(expected === value ? `Correct. ${countCard} counts as ${expected}.` : `Careful. ${countCard} counts as ${expected}.`);

    if (nextDealt.length >= countCards || shoe.length === 0) {
      setCountCard(null);
      return;
    }

    const { nextCard, nextShoe } = getNextDifferentCard(countCard, shoe);
    window.setTimeout(() => {
      setShoe(nextShoe);
      setCountCard(nextCard);
      setCardStart(Date.now());
    }, 250);
  }

  function drawFromPlayShoe(shoeList: string[], count = 1) {
    let working = [...shoeList];
    const drawn: string[] = [];
    let reshuffled = false;

    for (let i = 0; i < count; i++) {
      if (!working.length) {
        working = buildShoe(playDecks);
        setSeenCards([]);
        reshuffled = true;
      }

      drawn.push(working.pop()!);
    }

    if (reshuffled) {
      setPlayMessage("Shoe finished. New shoe shuffled.");
    }

    return { drawn, nextShoe: working };
  }

  function openPlay() {
    setScreen("play");
    if (!playShoe.length) setPlayShoe(buildShoe(playDecks));
  }

  function showBankrollAlert(title: string, message: string) {
    setBankrollAlert({ title, message });
    setPlayMessage(message);
  }

  function showRoundBannerDelayed(banner: { type: "win" | "lose" | "push" | "blackjack"; title: string; subtitle: string }, delay = 650) {
    window.setTimeout(() => {
      if (banner.type === "win" || banner.type === "blackjack") playCasinoSound("win");
      setRoundBanner(banner);
    }, delay);
  }

  function playCasinoSound(kind: "chip" | "deal" | "tap" | "win" | "soft") {
    if (typeof window === "undefined") return;

    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;

      const ctx = new AudioContextClass();
      const gain = ctx.createGain();
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();

      if (kind === "chip") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(620, now);
        osc.frequency.exponentialRampToValueAtTime(240, now + 0.08);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.09, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (kind === "deal") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(360, now);
        osc.frequency.exponentialRampToValueAtTime(680, now + 0.055);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.055, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (kind === "win") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(820, now + 0.12);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.075, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.22);
      } else {
        osc.type = "sine";
        osc.frequency.setValueAtTime(kind === "soft" ? 240 : 420, now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.04, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.08);
      }
    } catch {
      // Sound is optional. Some browsers block WebAudio until a user gesture.
    }
  }

  function addChip(amount: number) {
    if (playPhase !== "betting" && playPhase !== "roundOver") return;
    playCasinoSound("chip");
    setSelectedChip(amount);
    setPlayMessage(`${premiumChips[amount].label} chip selected. Tap a betting spot.`);
  }

  function placeSeatBet(seatIndex: number) {
    if (playPhase !== "betting" && playPhase !== "roundOver") return;

    const currentTotal = seatBets.reduce((sum, value) => sum + value, 0);
    const requestedSeatTotal = seatBets[seatIndex] + selectedChip;
    const requestedTotal = currentTotal + selectedChip;

    if (selectedChip < 5) return;

    if (requestedSeatTotal > 5000) {
      showBankrollAlert("Table Limit", "Maximum bet per hand is $5,000.");
      return;
    }

    if (requestedTotal > 5000) {
      showBankrollAlert("Table Limit", "Maximum total table bet is $5,000.");
      return;
    }

    if (requestedTotal > bankroll) {
      showBankrollAlert(
        "Not Enough Bankroll",
        `You only have $${bankroll.toLocaleString()} available. Lower the bet or add bankroll.`
      );
      return;
    }

    setBankrollAlert(null);
    playCasinoSound("chip");

    setSeatBets((current) => {
      const updated = [...current];
      updated[seatIndex] += selectedChip;
      const total = updated.reduce((sum, value) => sum + value, 0);
      setBet(total);
      return updated;
    });

    setDealerHand([]);
    setPlayerHands([]);
    setRoundBanner(null);
    setPlayMessage(`Seat ${seatIndex + 1} bet: $${requestedSeatTotal.toLocaleString()}. Total bet: $${requestedTotal.toLocaleString()}.`);
  }

  function clearBet() {
    if (playPhase !== "betting" && playPhase !== "roundOver") return;
    playCasinoSound("soft");
    setBankrollAlert(null);
    setSeatBets([0, 0, 0]);
    setBet(0);
    setDealerHand([]);
    setPlayerHands([]);
    setRoundBanner(null);
    setPlayMessage("Bets cleared. Select a chip and tap a betting spot.");
  }

  function resetShoe(decks = playDecks) {
    setPlayShoe(buildShoe(decks));
    setSeenCards([]);
    setPlayMessage(`${decks}-deck shoe loaded.`);
  }

  function resetSavedSession() {
    window.localStorage.removeItem(STORAGE_KEY);
    const freshDecks = 6;

    setPlayDecks(freshDecks);
    setPlayShoe(buildShoe(freshDecks));
    setSeenCards([]);
    setBankroll(1000);
    setBet(0);
    setSelectedChip(5);
    setSeatBets([0, 0, 0]);
    setDealerHand([]);
    setPlayerHands([]);
    setActiveHand(0);
    setPlayPhase("betting");
    setRoundBanner(null);
    setBankrollAlert(null);
    setHudOpen(false);
    setTipOpen(false);
    setShowPlayTotals(false);
    setCountDecks(6);
    setCountCards(20);
    setGuided(true);
    setPlayMessage("Saved session reset. Place your chips and deal.");
  }

  function dealBlackjack() {
    if (playPhase !== "betting" && playPhase !== "roundOver") return;

    const seatsToDeal = tableSeatOrder
      .map((seatIndex) => ({ seatBet: seatBets[seatIndex], seatIndex }))
      .filter((seat) => seat.seatBet > 0);

    const tableBet = seatsToDeal.reduce((sum, seat) => sum + seat.seatBet, 0);

    if (bankroll < 5) {
      showBankrollAlert(
        "Bankroll Needed",
        "You do not have enough bankroll to deal a hand. Add bankroll to keep playing."
      );
      return;
    }

    if (tableBet < 5 || seatsToDeal.length === 0) {
      showBankrollAlert(
        "Place a Bet",
        "Select a chip, then tap one of the three betting spots before you deal."
      );
      return;
    }

    if (tableBet > 5000) {
      showBankrollAlert(
        "Table Limit",
        "Maximum total table bet is $5,000."
      );
      return;
    }

    if (bankroll < tableBet) {
      showBankrollAlert(
        "Not Enough Bankroll",
        "You do not have enough bankroll for those bets. Lower your bets or add bankroll."
      );
      return;
    }

    playCasinoSound("deal");
    setBankrollAlert(null);
    setRoundBanner(null);
    setTipOpen(false);
    setHudOpen(false);
    setShowPlayTotals(false);

    const cardsNeeded = seatsToDeal.length * 2 + 2;
    const { drawn, nextShoe } = drawFromPlayShoe(playShoe, cardsNeeded);

    let cursor = 0;
    const initialHands: PlayerHand[] = seatsToDeal.map((seat) => {
      const cards = [drawn[cursor], drawn[cursor + seatsToDeal.length]];
      cursor += 1;
      return { cards, bet: seat.seatBet, seatIndex: seat.seatIndex };
    });

    const dealer = [drawn[seatsToDeal.length * 2], drawn[seatsToDeal.length * 2 + 1]];
    const visibleNow = [...initialHands.flatMap((hand) => hand.cards), dealer[0]];

    setActiveHand(0);
    setPlayShoe(nextShoe);
    setSeenCards((prev) => [...prev, ...visibleNow]);
    setBankroll((b) => b - tableBet);
    setDealerHand(dealer);
    setBet(tableBet);

    const dealerBJ = isBlackjack(dealer);
    const anyPlayerBJ = initialHands.some((hand) => isBlackjack(hand.cards));

    if (dealerBJ || anyPlayerBJ) {
      const reveal = dealer[1];
      setSeenCards((prev) => [...prev, reveal]);

      let totalReturn = 0;

      const settledHands = initialHands.map((hand) => {
        const playerBJ = isBlackjack(hand.cards);
        let payout = 0;
        let result = "";

        if (playerBJ && dealerBJ) {
          payout = hand.bet;
          result = "Push";
        } else if (playerBJ) {
          payout = hand.bet + hand.bet * 1.5;
          result = "Blackjack";
        } else if (dealerBJ) {
          payout = 0;
          result = "Dealer BJ";
        } else {
          result = "";
        }

        totalReturn += payout;
        return { ...hand, result, payout };
      });

      setBankroll((b) => b + totalReturn);
      setPlayerHands(settledHands);
      setPlayPhase(dealerBJ || settledHands.every((hand) => hand.result) ? "roundOver" : "player");

      if (dealerBJ || settledHands.every((hand) => hand.result)) {
        const net = totalReturn - tableBet;
        if (net > 0) {
          showRoundBannerDelayed({ type: "blackjack", title: "BLACKJACK!", subtitle: `+$${net.toFixed(0)}` }, 800);
          setPlayMessage(`Blackjack payout. Net +$${net.toFixed(0)}.`);
        } else if (net < 0) {
          showRoundBannerDelayed({ type: "lose", title: "DEALER BLACKJACK", subtitle: `-$${Math.abs(net).toFixed(0)}` });
          setPlayMessage(`Dealer blackjack. Net -$${Math.abs(net).toFixed(0)}.`);
        } else {
          showRoundBannerDelayed({ type: "push", title: "PUSH", subtitle: "Bet returned." });
          setPlayMessage("Push round.");
        }
        return;
      }

      const firstPlayable = settledHands.findIndex((hand) => !hand.result);
      setActiveHand(firstPlayable >= 0 ? firstPlayable : 0);
      setPlayMessage(`Playing hand ${(firstPlayable >= 0 ? firstPlayable : 0) + 1} of ${settledHands.length}.`);
      return;
    }

    setPlayerHands(initialHands);
    setPlayPhase("player");
    setPlayMessage(`Dealer shows ${dealer[0]}. Playing right-to-left like a real blackjack table.`);
  }

  function finishHand(updatedHands: PlayerHand[], nextIndex = activeHand + 1) {
    if (nextIndex < updatedHands.length) {
      setPlayerHands(updatedHands);
      setActiveHand(nextIndex);
      const nextSeat = updatedHands[nextIndex]?.seatIndex;
      const seatName = nextSeat === 2 ? "right" : nextSeat === 1 ? "center" : nextSeat === 0 ? "left" : `${nextIndex + 1}`;
      setPlayMessage(`Playing ${seatName} hand (${nextIndex + 1} of ${updatedHands.length}).`);
      return;
    }

    runDealerAndSettle(updatedHands);
  }

  function hitPlayHand() {
    if (playPhase !== "player") return;
    playCasinoSound("deal");

    const { drawn, nextShoe } = drawFromPlayShoe(playShoe, 1);
    const updated = playerHands.map((h, i) => i === activeHand ? { ...h, cards: [...h.cards, drawn[0]] } : h);
    const hand = updated[activeHand];

    setPlayShoe(nextShoe);
    setSeenCards((prev) => [...prev, drawn[0]]);

    if (isBust(hand.cards)) {
      hand.busted = true;
      hand.stood = true;
      hand.result = "Bust";
      setPlayMessage("Bust. Moving to next hand.");
      finishHand(updated);
      return;
    }

    if (handValue(hand.cards).total === 21) {
      hand.stood = true;
      setPlayMessage("21. Standing automatically.");
      finishHand(updated);
      return;
    }

    setPlayerHands(updated);
  }

  function standPlayHand() {
    if (playPhase !== "player") return;
    playCasinoSound("tap");
    const updated = playerHands.map((h, i) => i === activeHand ? { ...h, stood: true } : h);
    finishHand(updated);
  }

  function doublePlayHand() {
    if (playPhase !== "player" || !activePlayHand) return;
    playCasinoSound("chip");

    if (activePlayHand.cards.length !== 2) {
      setPlayMessage("Double is only available on your first two cards.");
      return;
    }

    if (bankroll < activePlayHand.bet) {
      setPlayMessage("Not enough bankroll to double.");
      return;
    }

    const { drawn, nextShoe } = drawFromPlayShoe(playShoe, 1);
    const updated = [...playerHands];

    updated[activeHand] = {
      ...activePlayHand,
      cards: [...activePlayHand.cards, drawn[0]],
      bet: activePlayHand.bet * 2,
      doubled: true,
      stood: true,
    };

    if (isBust(updated[activeHand].cards)) {
      updated[activeHand].busted = true;
      updated[activeHand].result = "Bust";
    }

    setBankroll((b) => b - activePlayHand.bet);
    setPlayShoe(nextShoe);
    setSeenCards((prev) => [...prev, drawn[0]]);
    finishHand(updated);
  }

  function splitPlayHand() {
    if (playPhase !== "player" || !activePlayHand) return;
    playCasinoSound("chip");

    if (!isPair(activePlayHand.cards)) {
      setPlayMessage("You can only split matching pairs.");
      return;
    }

    if (bankroll < activePlayHand.bet) {
      setPlayMessage("Not enough bankroll to split.");
      return;
    }

    const { drawn, nextShoe } = drawFromPlayShoe(playShoe, 2);
    const first: PlayerHand = { cards: [activePlayHand.cards[0], drawn[0]], bet: activePlayHand.bet, seatIndex: activePlayHand.seatIndex };
    const second: PlayerHand = { cards: [activePlayHand.cards[1], drawn[1]], bet: activePlayHand.bet, seatIndex: activePlayHand.seatIndex };
    const updated = [...playerHands];
    updated.splice(activeHand, 1, first, second);

    setBankroll((b) => b - activePlayHand.bet);
    setPlayShoe(nextShoe);
    setSeenCards((prev) => [...prev, ...drawn]);
    setPlayerHands(updated);
    setPlayMessage("Split. Playing first hand.");
  }

  function runDealerAndSettle(hands: PlayerHand[]) {
    setPlayPhase("dealer");

    let dealer = [...dealerHand];
    let workingShoe = [...playShoe];
    const newlySeen: string[] = [];

    if (dealer[1]) newlySeen.push(dealer[1]);

    const anyLiveHand = hands.some((h) => !isBust(h.cards));

    if (anyLiveHand) {
      while (shouldDealerHit(dealer, true)) {
        const draw = drawFromPlayShoe(workingShoe, 1);
        dealer = [...dealer, draw.drawn[0]];
        workingShoe = draw.nextShoe;
        newlySeen.push(draw.drawn[0]);
      }
    }

    const dealerTotal = handValue(dealer).total;
    const dealerBust = isBust(dealer);
    let totalReturn = 0;

    const settled = hands.map((hand) => {
      const playerTotal = handValue(hand.cards).total;
      let result = "";
      let payout = 0;

      if (isBust(hand.cards)) {
        result = "Bust";
      } else if (dealerBust) {
        result = "Win";
        payout = hand.bet * 2;
      } else if (playerTotal > dealerTotal) {
        result = "Win";
        payout = hand.bet * 2;
      } else if (playerTotal < dealerTotal) {
        result = "Lose";
      } else {
        result = "Push";
        payout = hand.bet;
      }

      totalReturn += payout;
      return { ...hand, result, payout };
    });

    setDealerHand(dealer);
    setPlayShoe(workingShoe);
    setSeenCards((prev) => [...prev, ...newlySeen]);
    setPlayerHands(settled);
    setBankroll((b) => b + totalReturn);
    setPlayPhase("roundOver");

    const totalBet = hands.reduce((sum, h) => sum + h.bet, 0);
    const net = totalReturn - totalBet;

    if (net > 0) {
      showRoundBannerDelayed({ type: "win", title: "YOU WIN", subtitle: `+$${net}` });
    } else if (net < 0) {
      showRoundBannerDelayed({ type: "lose", title: "DEALER WINS", subtitle: `-$${Math.abs(net)}` });
    } else {
      showRoundBannerDelayed({ type: "push", title: "PUSH", subtitle: "Bet returned." });
    }

    setPlayMessage(net > 0 ? `You won $${net}.` : net < 0 ? `You lost $${Math.abs(net)}.` : "Push round.");
  }

  const dealerVisibleHand = playPhase === "player" && dealerHand.length > 1 ? [dealerHand[0]] : dealerHand;

  return (
    <main className={`app ${screen === "play" ? "play-app" : ""}`}>
      <div className="bg" />

      <header className={`top ${screen === "play" ? "play-top" : ""}`}>
        <button onClick={() => setScreen("home")} className="brand brand-with-logo">
          <Logo compact />
          <span>
            Blackjack Edge
            <em>Master The Game</em>
          </span>
        </button>

        {screen.startsWith("basic") && (
          <button onClick={() => setStrategyOpen(true)} className="small-btn">Strategy Card</button>
        )}


      </header>

      {screen === "home" && (
        <section className="home compact-home v04-home">
          <div className="home-title-block v04-home-title">
            <span className="eyebrow">Blackjack Edge</span>
            <h1>Play. Train. Count.</h1>
            <p className="home-subtitle">Perfect strategy, professional card counting, and live shoe practice in one premium blackjack app.</p>
          </div>

          <div className="home-actions home-actions-three v04-mode-grid">
            <button onClick={openPlay} className="big-card play-card mode-card mode-play">
              <div className="mode-art premium-mode-art">
                <img src="/mode-play-blackjack.png" alt="" />
              </div>
              <strong>Play Blackjack</strong>
              <span>Live shoe practice with betting, splits, doubles, H17, and 3:2 blackjack.</span>
            </button>

            <button onClick={() => setScreen("basic")} className="big-card mode-card mode-bs">
              <div className="mode-art premium-mode-art">
                <img src="/mode-basic-strategy.png" alt="" />
              </div>
              <strong>Basic Strategy</strong>
              <span>Drill perfect decisions and open the strategy card anytime.</span>
            </button>

            <button onClick={() => setScreen("counting")} className="big-card mode-card mode-cc">
              <div className="mode-art premium-mode-art">
                <img src="/mode-card-counting.png" alt="" />
              </div>
              <strong>Card Counting</strong>
              <span>Practice Hi-Lo recognition, running count, and true count.</span>
            </button>
          </div>
        </section>
      )}

      {screen === "basic" && (
        <section className="panel">
          <span className="eyebrow">Basic Strategy</span>
          <h1>Perfect decisions.</h1>
          <p>Train the mathematically correct play until it becomes automatic.</p>

          <button className="primary" onClick={startBasic}>Start Drill</button>
          <button className="secondary" onClick={() => setStrategyOpen(true)}>Open Strategy Card</button>

          <div className="selector">
            {[10, 25, 50].map((n) => (
              <button key={n} className={roundSize === n ? "selected" : ""} onClick={() => setRoundSize(n)}>{n} hands</button>
            ))}
          </div>

          <button className="secondary help-inline-btn" onClick={() => setHelpOpen("basic")}><HelpCircle size={17} /> How This Works</button>

        </section>
      )}

      {screen === "basicDrill" && currentHand && (
        <section className="drill">
          <div className="table">
            <div className="dealer-zone">
              <span>Dealer</span>
              <PlayingCard value={currentHand.dealer} />
            </div>

            <div className="player-zone">
              <span>Your hand</span>
              <h2>{handLabel(currentHand)}</h2>
              <div className="cards">
                {currentHand.player.map((c, i) => <PlayingCard key={`${c}-${i}`} value={c} />)}
              </div>
            </div>
          </div>

          <div className="timer"><Clock size={18} /> {elapsed.toFixed(2)}s</div>

          <div className="moves">
            {(["H", "S", "D", "P", "R"] as Move[]).map((m) => (
              <button key={m} className={`move ${m}`} onClick={() => chooseMove(m)}>
                {moveNames[m]}<span>{m}</span>
              </button>
            ))}
          </div>

          <button className="floating-help" onClick={() => setHelpOpen("basic")}><HelpCircle size={18} /> Tip</button>
        </section>
      )}

      {screen === "basicResults" && (
        <section className="panel">
          <span className="eyebrow">Action Plan</span>
          <h1>{accuracy >= 90 ? "Strong round." : "Good reps."}</h1>

          <div className="stats">
            <div><strong>{accuracy}%</strong><span>Accuracy</span></div>
            <div><strong>{correct}/{roundSize}</strong><span>Correct</span></div>
            <div><strong>{avgTime.toFixed(2)}s</strong><span>Avg time</span></div>
          </div>

          <div className="action-plan">
            <p>• Under 90%? Run another 10-hand drill before moving on.</p>
            <p>• Review any missed hands below and compare your choice to the correct Basic Strategy play.</p>
            <p>• Tap Strategy Card anytime to study the full chart.</p>
          </div>

          <div className="result-actions">
            <button className="primary" onClick={startBasic}><RotateCcw size={18} /> Run Again</button>
            <button className="secondary" onClick={() => setShowBasicReview((value) => !value)}>
              {showBasicReview ? "Hide Answer Review" : "Show Answer Review"}
            </button>
          </div>

          {showBasicReview && (
            <div className="answer-review">
              {results.map((result, index) => {
                const isCorrect = result.choice === result.hand.answer;

                return (
                  <div key={`${result.hand.player.join("-")}-${result.hand.dealer}-${index}`} className={isCorrect ? "review-card correct" : "review-card wrong"}>
                    <div className="review-top">
                      <strong>Hand {index + 1}</strong>
                      <span>{isCorrect ? "Correct" : "Wrong"}</span>
                    </div>

                    <p>
                      You had <b>{result.hand.player.join(" ")}</b> against dealer <b>{result.hand.dealer}</b>.
                    </p>

                    <div className="review-grid">
                      <div>
                        <small>Your play</small>
                        <strong>{moveNames[result.choice]}</strong>
                      </div>

                      <div>
                        <small>Basic Strategy</small>
                        <strong>{moveNames[result.hand.answer]}</strong>
                      </div>

                      <div>
                        <small>Time</small>
                        <strong>{result.seconds.toFixed(2)}s</strong>
                      </div>
                    </div>

                    {!isCorrect && (
                      <p className="review-note">
                        Basic Strategy says to <b>{moveNames[result.hand.answer]}</b> on this exact hand.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {screen === "counting" && (
        <section className="panel">
          <span className="eyebrow">Card Counting</span>
          <h1>Train Hi-Lo.</h1>
          <p>Start with the basics or jump straight into card recognition.</p>

          <button className="primary" onClick={startCounting}>Start Swipe Drill</button>
          <button className="secondary" onClick={() => setScreen("countLearn")}>Learn the Basics</button>

          <div className="selector">
            {[10, 20, 40, 60].map((n) => (
              <button key={n} className={countCards === n ? "selected" : ""} onClick={() => setCountCards(n)}>{n} cards</button>
            ))}
          </div>

          <div className="cc-deck-block">
            <span className="mini-label">Decks in shoe</span>
            <div className="selector cc-deck-selector">
              {[1, 2, 4, 6].map((n) => (
                <button key={n} className={countDecks === n ? "selected" : ""} onClick={() => setCountDecks(n)}>
                  {n} Deck{n > 1 ? "s" : ""}
                </button>
              ))}
            </div>
          </div>

          <label className="toggle">
            <input type="checkbox" checked={guided} onChange={(e) => setGuided(e.target.checked)} /> Guided mode: show running count
          </label>

          <button className="secondary help-inline-btn" onClick={() => setHelpOpen("counting")}><HelpCircle size={17} /> Counting Help</button>
        </section>
      )}

      {screen === "countLearn" && (
        <section className="panel learn-panel">
          <span className="eyebrow">Counting Basics</span>
          <h1>You are tracking the shoe.</h1>
          <p className="text">Card counting is not memorizing every card. You are keeping a simple score that estimates whether the remaining deck is rich in high cards or low cards.</p>

          <div className="lesson-stack">
            <div className="lesson-card plus">
              <strong>Low cards leaving is good.</strong>
              <span>2 • 3 • 4 • 5 • 6</span>
              <em>+1</em>
              <p>When low cards leave the shoe, more 10s and Aces remain. That helps blackjacks, doubles, and dealer busts.</p>
            </div>

            <div className="lesson-card neutral">
              <strong>Middle cards are neutral.</strong>
              <span>7 • 8 • 9</span>
              <em>0</em>
              <p>These cards do not strongly shift the shoe in either direction.</p>
            </div>

            <div className="lesson-card minus">
              <strong>High cards leaving is bad.</strong>
              <span>10 • J • Q • K • A</span>
              <em>-1</em>
              <p>When high cards leave the shoe, fewer premium cards remain for the player.</p>
            </div>
          </div>

          <div className="action-plan">
            <p><strong>Running count:</strong> the live total as cards are seen.</p>
            <p><strong>True count:</strong> running count divided by decks remaining.</p>
            <p><strong>Goal:</strong> keep the count in your head while cards move quickly.</p>
          </div>

          <button className="primary" onClick={startCounting}>Start Swipe Drill</button>
        </section>
      )}

      {screen === "countDrill" && (
        <section className="drill">
          <div className="stats">
            <div><strong>{dealt.length}/{countCards}</strong><span>Cards</span></div>
            <div><strong>{dealt.length ? Math.round((countCorrect / dealt.length) * 100) : 0}%</strong><span>Recognition</span></div>
            <div><strong>{(avg(swipeTimes) / 1000).toFixed(2)}s</strong><span>Avg speed</span></div>
          </div>

          {guided && countCard && <div className="running">Running Count: <strong>{finalRunning >= 0 ? "+" : ""}{finalRunning}</strong></div>}

          <div className="count-table">
            {countCard ? <PlayingCard value={countCard} /> : <div className="complete">Drill Complete</div>}
            <div className="hint-row"><span>← -1</span><span>↑ 0</span><span>+1 →</span></div>
          </div>

          {countCard ? (
            <div className="swipe-buttons">
              <button onClick={() => chooseCount(-1)}><ChevronLeft /> -1</button>
              <button onClick={() => chooseCount(0)}>↑ 0</button>
              <button onClick={() => chooseCount(1)}>+1 <ChevronRight /></button>
            </div>
          ) : (
            <div className="panel compact final-count-panel">
              <h2>Final count quiz</h2>
              <p>{countDecks}-deck shoe • Decks remaining: {decksRemaining.toFixed(1)}</p>
              <p className="text">Enter your running count and true count before revealing the answer.</p>

              <input
                placeholder="Running count"
                value={runningGuess}
                onChange={(e) => setRunningGuess(e.target.value)}
              />

              <input
                placeholder="True count"
                value={trueGuess}
                onChange={(e) => setTrueGuess(e.target.value)}
              />

              <button className="primary" onClick={() => setCountSubmitted(true)}>
                Check My Count
              </button>

              {countSubmitted && (
                <div className="count-grade">
                  <div className={runningGuessIsCorrect ? "grade-card correct" : "grade-card wrong"}>
                    <small>Running Count</small>
                    <strong>{runningGuessIsCorrect ? "Correct" : "Wrong"}</strong>
                    <span>Your answer: {runningGuess || "blank"}</span>
                    <span>Actual: {finalRunning >= 0 ? "+" : ""}{finalRunning}</span>
                  </div>

                  <div className={trueGuessIsCorrect ? "grade-card correct" : "grade-card wrong"}>
                    <small>True Count</small>
                    <strong>{trueGuessIsCorrect ? "Correct" : "Wrong"}</strong>
                    <span>Your answer: {trueGuess || "blank"}</span>
                    <span>Actual: {finalTrue >= 0 ? "+" : ""}{finalTrue.toFixed(1)}</span>
                  </div>
                </div>
              )}

              <div className="count-complete-actions">
                <button className="primary" onClick={reDrillSameCountingCards}>Re-Drill Same Cards</button>
                <button className="secondary" onClick={() => setScreen("counting")}>Change Drill Settings</button>
              </div>
            </div>
          )}

          <button className="floating-help" onClick={() => setHelpOpen("counting")}><HelpCircle size={18} /> Help</button>
        </section>
      )}

      {screen === "play" && (
        <section className="drill play-screen">
          <div className="play-topbar">
            <button className="play-exit-button" onClick={() => setExitConfirmOpen(true)}>Exit</button>
            <div className="play-hud money-hud">
              <div className="bankroll-box"><strong>${bankroll.toLocaleString()}</strong><span>Bankroll</span></div>
              <div className="cards-left-box">
                <strong>{playShoe.length.toLocaleString()}/{(playDecks * 52).toLocaleString()}</strong>
                <span>Cards Remaining</span>
              </div>
              <div className="bet-box"><strong>${(totalSeatBet || bet).toLocaleString()}</strong><span>Total Bet</span></div>
            </div>
          </div>

          <div className="table play-table luxury-casino-table">
            <div className="luxury-table-rail top-rail" />
            <div className="luxury-table-rail bottom-rail" />

            <div className="table-brand-watermark">
              <strong>BLACKJACK</strong>
              <span>EDGE</span>
            </div>

            <div className="luxury-shoe">
              <div className="shoe-lid">BLACKJACK<br />EDGE</div>
              <div className="shoe-cards" />
            </div>

            <div className="dealer-chip-rack" aria-hidden="true">
              {[10, 25, 50, 100, 500].map((rackChip) => (
                <span key={rackChip} className={`rack-chip rack-${rackChip}`}></span>
              ))}
            </div>

            <aside className="table-rules-card">
              <strong>TABLE RULES</strong>
              <span>MIN BET: $5</span>
              <span>MAX BET: $5,000</span>
              <span>BLACKJACK PAYS 3:2</span>
              <span>DEALER HITS SOFT 17</span>
            </aside>

            <div className="felt-insurance-arc">
              <span>BLACKJACK PAYS 3 TO 2</span>
              <strong>INSURANCE PAYS 2 TO 1</strong>
            </div>

            <button
              className={`side-seat side-seat-left ${seatBets[0] > 0 ? "has-bet" : ""}`}
              type="button"
              onClick={() => placeSeatBet(0)}
              disabled={playPhase !== "betting" && playPhase !== "roundOver"}
              aria-label="Place bet on left hand"
            >
              <span>+</span>
              <strong>{seatBets[0] > 0 ? `$${seatBets[0].toLocaleString()}` : "PLACE\nBET"}</strong>
            </button>

            <button
              className={`side-seat side-seat-right ${seatBets[2] > 0 ? "has-bet" : ""}`}
              type="button"
              onClick={() => placeSeatBet(2)}
              disabled={playPhase !== "betting" && playPhase !== "roundOver"}
              aria-label="Place bet on right hand"
            >
              <span>+</span>
              <strong>{seatBets[2] > 0 ? `$${seatBets[2].toLocaleString()}` : "PLACE\nBET"}</strong>
            </button>

            <div className="dealer-zone">
              <span>Dealer</span>
              <div className="cards">
                {dealerHand.length ? (
                  <>
                    {dealerVisibleHand.map((card, i) => <PlayingCard key={`${card}-${i}`} value={card} />)}
                    {playPhase === "player" && dealerHand[1] && <PlayingCard value="back" faceDown />}
                  </>
                ) : <PlayingCard value="back" faceDown />}
              </div>
              {showPlayTotals && (
                <h2>{dealerHand.length ? (playPhase === "player" ? handValue([dealerHand[0]]).total : handValue(dealerHand).total) : ""}</h2>
              )}
            </div>

            <div className="player-zone play-player-zone">
              <div className="split-hands">
                {playerHands.length ? playerHands.map((hand, index) => {
                  const seatIndex = hand.seatIndex ?? index;
                  const isActive = index === activeHand && playPhase === "player";
                  const seatName = seatIndex === 2 ? "Right" : seatIndex === 1 ? "Center" : "Left";

                  return (
                    <div
                      key={`${seatIndex}-${index}`}
                      className={`split-hand seat-hand seat-hand-${seatIndex} ${isActive ? "active" : ""}`}
                    >
                      <small className="hand-bet-pill">{isActive ? "ACTIVE" : seatName}</small>
                      <div className="cards">
                        {hand.cards.map((card, i) => <PlayingCard key={`${card}-${i}`} value={card} />)}
                      </div>
                      {showPlayTotals && <strong>{handValue(hand.cards).total}</strong>}
                      {hand.result && <em>{hand.result}</em>}
                    </div>
                  );
                }) : (
                  <button
                    className={`bet-circle luxury-bet-circle center-seat ${seatBets[1] > 0 ? "has-bet" : ""}`}
                    type="button"
                    onClick={() => placeSeatBet(1)}
                    disabled={playPhase !== "betting" && playPhase !== "roundOver"}
                    aria-label="Place bet on center hand"
                  >
                    <span>{seatBets[1] > 0 ? "Center Bet" : "Tap To Bet"}</span>
                    <strong>{seatBets[1] > 0 ? `$${seatBets[1].toLocaleString()}` : premiumChips[selectedChip].label}</strong>
                  </button>
                )}
              </div>
            </div>

            {roundBanner && playPhase === "roundOver" && (
              <div className={`round-banner table-result-banner ${roundBanner.type}`}>
                <div className="banner-shine" />
                <strong>{roundBanner.title}</strong>
                <span>{roundBanner.subtitle}</span>
              </div>
            )}
          </div>

          <div className={`chip-tray ${playPhase !== "betting" && playPhase !== "roundOver" ? "chip-tray-locked" : ""}`}>
            <div className="selected-chip-label">Selected {premiumChips[selectedChip].label}</div>
            {chipValues.map((chip) => (
              <button
                key={chip}
                className={`chip premium-chip chip-${chip} ${selectedChip === chip ? "selected-chip" : ""}`}
                onClick={() => addChip(chip)}
                disabled={playPhase !== "betting" && playPhase !== "roundOver"}
                aria-label={`Add ${premiumChips[chip].label} chip`}
              >
                <img src={premiumChips[chip].image} alt="" />
                <span>{premiumChips[chip].label}</span>
              </button>
            ))}
            <button
              className="secondary clear-bet-button"
              onClick={clearBet}
              disabled={playPhase !== "betting" && playPhase !== "roundOver"}
            >
              Clear Bet
            </button>
            <button
              className="primary deal-button"
              onClick={dealBlackjack}
              disabled={playPhase !== "betting" && playPhase !== "roundOver"}
            >
              Deal
            </button>
          </div>

          {canAct && (
            <div className="play-actions luxury-action-bar">
              <button className="move P" disabled={!canSplit} onClick={splitPlayHand}>Split</button>
              <button className="move D" disabled={!canDouble} onClick={doublePlayHand}>Double</button>
              <button className="move S" onClick={standPlayHand}>Stand</button>
              <button className="move H" onClick={hitPlayHand}>Hit</button>
            </div>
          )}

          <div className="play-bottom-bar casino-utility-bar">
            <button onClick={() => setTipOpen((v) => !v)} className="tip-button"><Lightbulb size={18} /> Tip</button>
            <button onClick={() => setShowPlayTotals((value) => !value)} className="tip-button">
              {showPlayTotals ? "Hide Totals" : "Totals"}
            </button>
            <button onClick={() => setHudOpen(true)} className="tip-button"><Settings2 size={18} /> HUD</button>
            <button onClick={() => setHelpOpen("play")} className="tip-button"><HelpCircle size={18} /> Rules</button>
          </div>

          {bankrollAlert && (
            <div className="money-alert-overlay" role="dialog" aria-modal="true">
              <div className="money-alert-card">
                <span className="eyebrow">Blackjack Edge</span>
                <h2>{bankrollAlert.title}</h2>
                <p>{bankrollAlert.message}</p>
                <div className="money-alert-actions">
                  <button className="secondary" onClick={() => setBankrollAlert(null)}>Got it</button>
                  <button
                    className="primary"
                    onClick={() => {
                      setBankroll((value) => value + 500);
                      setBankrollAlert(null);
                      setPlayMessage("Added $500 bankroll. Place your bet and deal.");
                    }}
                  >
                    Add $500
                  </button>
                </div>
              </div>
            </div>
          )}

          {tipOpen && (
            <div className="tip-panel">
              <strong>Basic Strategy Tip</strong>
              {tipMove && activePlayHand && dealerUpcard ? (
                <p>Against dealer {dealerUpcard}, this hand says: <b>{formatMove(tipMove)}</b>.</p>
              ) : (
                <p>Deal a hand first and the tip will show the recommended basic strategy play.</p>
              )}
              <button className="secondary" onClick={() => setStrategyOpen(true)}>Open Strategy Card</button>
            </div>
          )}

          <div className="play-message-pill">{playMessage}</div>
        </section>
      )}

      {exitConfirmOpen && (
        <div className="overlay exit-confirm-overlay">
          <div className="exit-confirm-card">
            <span className="eyebrow">Leave Table?</span>
            <h2>Exit Play Blackjack?</h2>
            <p>Your bankroll and shoe are saved on this device, but the table view will close.</p>
            <div className="exit-confirm-actions">
              <button className="secondary" onClick={() => setExitConfirmOpen(false)}>Stay</button>
              <button
                className="primary"
                onClick={() => {
                  setExitConfirmOpen(false);
                  setTipOpen(false);
                  setHudOpen(false);
                  setHelpOpen(null);
                  setScreen("home");
                }}
              >
                Exit
              </button>
            </div>
          </div>
        </div>
      )}

      {hudOpen && (
        <div className="overlay hud-overlay">
          <div className="hud-sheet">
            <div className="sheet-header luxury-sheet-header">
              <div>
                <span className="eyebrow">Training HUD</span>
                <h2>Live Shoe Data</h2>
                <p>Counts use visible cards only. The shoe no longer resets until empty or manually shuffled.</p>
              </div>
              <button className="icon-button" onClick={() => setHudOpen(false)}><XIcon /></button>
            </div>

            <div className="hud-grid">
              <div><strong>{playRunning >= 0 ? "+" : ""}{playRunning}</strong><span>Running Count</span></div>
              <div><strong>{playTrue >= 0 ? "+" : ""}{playTrue.toFixed(1)}</strong><span>True Count</span></div>
              <div><strong>{playDecksRemaining.toFixed(1)}</strong><span>Decks Remaining</span></div>
              <div><strong>{penetration}%</strong><span>Penetration</span></div>
            </div>

            <div className="selector deck-selector">
              {[1, 2, 6, 8].map((n) => (
                <button
                  key={n}
                  className={playDecks === n ? "selected" : ""}
                  onClick={() => {
                    if (playPhase === "betting" || playPhase === "roundOver") {
                      setPlayDecks(n);
                      resetShoe(n);
                    } else {
                      setPlayMessage("Change decks after the round ends.");
                    }
                  }}
                >
                  {n} Deck{n > 1 ? "s" : ""}
                </button>
              ))}
            </div>

            <div className="hud-actions">
              <button className="secondary" onClick={() => setBankroll((b) => b + 500)}>Add $500</button>
              <button className="secondary" onClick={() => { setBankroll(1000); setBet(0); }}>Reset Bankroll</button>
              <button className="secondary reset-session-button" onClick={resetSavedSession}>Reset Saved Session</button>
              <button className="primary" onClick={() => resetShoe(playDecks)}>Shuffle New Shoe</button>
            </div>
          </div>
        </div>
      )}

      {helpOpen && (
        <div className="overlay help-overlay">
          <div className="help-sheet">
            <div className="sheet-header luxury-sheet-header">
              <div>
                <span className="eyebrow">Blackjack Edge Help</span>
                <h2>
                  {helpOpen === "play" ? "Play Blackjack" : helpOpen === "counting" ? "Card Counting" : helpOpen === "strategy" ? "Strategy Card" : "Basic Strategy"}
                </h2>
              </div>
              <button className="icon-button" onClick={() => setHelpOpen(null)}><XIcon /></button>
            </div>

            {helpOpen === "play" && (
              <div className="help-copy">
                <p>Play like a real shoe: the deck is shuffled, cards are dealt in order, and the dealer hole card is hidden until revealed.</p>
                <p>Use the HUD for shoe data, bankroll tools, and deck settings. Use Show Totals only when you want help checking the math.</p>
              </div>
            )}

            {helpOpen === "basic" && (
              <div className="help-copy">
                <p>Pick the mathematically correct move for the hand shown. The goal is to build instant recognition.</p>
                <p>Use the Strategy Card when studying, then hide it and drill until the decisions feel automatic.</p>
              </div>
            )}

            {helpOpen === "counting" && (
              <div className="help-copy">
                <p>Hi-Lo values: 2–6 are +1, 7–9 are 0, and 10 through Ace are -1.</p>
                <p>After the drill, enter your running count and true count. You can re-drill the same sequence or change the setup.</p>
              </div>
            )}

            {helpOpen === "strategy" && (
              <div className="help-copy">
                <p>Use Hard, Soft, and Pairs to quickly reference the correct move against the dealer upcard.</p>
                <p>The v0.4 layout keeps the card compact so it works better in both portrait and landscape.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {strategyOpen && <StrategyCardOverlay onClose={() => setStrategyOpen(false)} />}
    </main>
  );
}

function XIcon() {
  return <span style={{ fontSize: 20, lineHeight: 1 }}>×</span>;
}
