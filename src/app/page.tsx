"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  HelpCircle,
  RotateCcw,
  Settings2,
  X,
} from "lucide-react";
import {
  buildShoe,
  cardRank,
  correctAction,
  formatMove,
  generateTrainingHand,
  handLabel,
  handValue,
  hiLo,
  isBlackjack,
  isBust,
  isPair,
  calcTotalProfitLoss,
  DEFAULT_BANKROLL,
  formatProfitLoss,
  migrateBankrollStats,
  MAX_BET,
  MIN_BET,
  moveNames,
  recommendedTrainingBet,
  shouldDealerHit,
  type Move,
  type TrainingHand,
} from "@/lib/blackjack";
import {
  ActionButtons,
  AppScreen,
  BetChipStack,
  BottomNav,
  ChipTray,
  chipLabel,
  DialogCard,
  FeatureCard,
  HomeHeader,
  HOME_ICON_MAP,
  LogoBadge,
  MainScreen,
  OverlaySheet,
  PlayingCard,
  SeatId,
  StrategyCardOverlay,
  VaultBettingContent,
  VaultCard,
  VaultCountingContent,
  VaultMistakesContent,
  VaultPanel,
  VaultRulesContent,
  VaultSection,
  VaultStrategyContent,
  VaultWeaknessContent,
} from "@/components/ui";

/* ─── Types & Constants ─── */

type HandResult = { hand: TrainingHand; choice: Move; seconds: number };
type SwipeValue = -1 | 0 | 1;
type PlayPhase = "betting" | "player" | "dealer" | "roundOver";
type SeatBets = Record<SeatId, number>;
type SeatLastChips = Record<SeatId, number | null>;
type VaultView = VaultSection | null;

type PlayerHand = {
  cards: string[];
  bet: number;
  seatId: SeatId;
  doubled?: boolean;
  stood?: boolean;
  busted?: boolean;
  result?: string;
  payout?: number;
};

type GameStats = {
  roundsPlayed: number;
  wins: number;
  losses: number;
  pushes: number;
  blackjacks: number;
  basicDrills: number;
  basicAccuracySum: number;
  countDrills: number;
  peakBankroll: number;
  startingBankroll: number;
  bankrollAdded: number;
  biggestWin: number;
  biggestLoss: number;
};

type AppSettings = {
  soundEffects: boolean;
  music: boolean;
  haptics: boolean;
  animations: boolean;
  tableGlow: boolean;
  showTutorials: boolean;
};

type PlaySettings = {
  showHandTotals: boolean;
  showBasicStrategyTips: boolean;
  showRecommendedBet: boolean;
  autoOpenHudAfterRound: boolean;
  dealerSpeed: "slow" | "normal" | "fast";
  soundEffects: boolean;
  music: boolean;
  haptics: boolean;
  animations: boolean;
  tableGlow: boolean;
  cardStyle: "classic" | "premium";
};

const SEAT_ORDER: SeatId[] = ["right", "center", "left"];
const DISPLAY_SEATS: SeatId[] = ["left", "center", "right"];
const STORAGE_KEY = "blackjack-edge-v040-session";
const STATS_KEY = "blackjack-edge-v040-stats";
const APP_SETTINGS_KEY = "blackjack-edge-app-settings";
const PLAY_SETTINGS_KEY = "blackjack-edge-play-settings";

const defaultAppSettings = (): AppSettings => ({
  soundEffects: true,
  music: false,
  haptics: true,
  animations: false,
  tableGlow: true,
  showTutorials: true,
});

const defaultPlaySettings = (): PlaySettings => ({
  showHandTotals: false,
  showBasicStrategyTips: true,
  showRecommendedBet: true,
  autoOpenHudAfterRound: false,
  dealerSpeed: "normal",
  soundEffects: true,
  music: false,
  haptics: true,
  animations: false,
  tableGlow: true,
  cardStyle: "premium",
});

const defaultSeatBets = (): SeatBets => ({ left: 0, center: 0, right: 0 });
const defaultSeatLastChips = (): SeatLastChips => ({ left: null, center: null, right: null });

function sanitizeSeatLastChips(bets: SeatBets, chips: SeatLastChips): SeatLastChips {
  const sanitized = { ...defaultSeatLastChips(), ...chips };
  for (const seat of SEAT_ORDER) {
    if (bets[seat] <= 0) sanitized[seat] = null;
  }
  return sanitized;
}

function sumSeatBets(bets: SeatBets) {
  return bets.left + bets.center + bets.right;
}
const MAX_BET_MSG = "Maximum bet is $250,000 per hand.";
const BANKROLL_ADD_OPTIONS = [500, 5000, 25000, 100000, 250000] as const;
const defaultStats = (bankroll = DEFAULT_BANKROLL): GameStats => ({
  roundsPlayed: 0,
  wins: 0,
  losses: 0,
  pushes: 0,
  blackjacks: 0,
  basicDrills: 0,
  basicAccuracySum: 0,
  countDrills: 0,
  peakBankroll: bankroll,
  startingBankroll: DEFAULT_BANKROLL,
  bankrollAdded: 0,
  biggestWin: 0,
  biggestLoss: 0,
});

const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
const swipeValue = (card: string): SwipeValue => (hiLo(card) === 1 ? 1 : hiLo(card) === -1 ? -1 : 0);
const seatLabel = (s: SeatId) => (s === "left" ? "Left" : s === "center" ? "Center" : "Right");
const handResultLabel = (result?: string) => {
  if (!result) return null;
  const map: Record<string, string> = {
    Blackjack: "BLACKJACK",
    Win: "WIN",
    Lose: "LOSE",
    Push: "PUSH",
    Bust: "BUST",
    "Dealer Blackjack": "DEALER BLACKJACK",
  };
  return map[result] ?? result.toUpperCase();
};
const handResultClass = (result?: string) => {
  if (!result) return "";
  return result.toLowerCase().replace(/\s+/g, "-");
};
const isHandComplete = (hand: PlayerHand) => Boolean(hand.stood || hand.busted || hand.result);
const findNextActiveHandIndex = (hands: PlayerHand[], fromIndex = 0) => {
  for (let i = fromIndex; i < hands.length; i++) {
    if (!isHandComplete(hands[i])) return i;
  }
  return -1;
};
const dealerUpcardLabel = (card?: string) => {
  if (!card) return "";
  const rank = cardRank(card);
  if (rank === "J" || rank === "Q" || rank === "K" || rank === "10") return "10";
  return rank;
};

/* ─── App ─── */

export default function App() {
  const [screen, setScreen] = useState<AppScreen>("home");
  const [now, setNow] = useState(Date.now());

  // Overlays
  const [strategyOpen, setStrategyOpen] = useState(false);
  const [playTipOpen, setPlayTipOpen] = useState(false);
  const [basicDrillTipOpen, setBasicDrillTipOpen] = useState(false);
  const [countHowItWorksOpen, setCountHowItWorksOpen] = useState(false);
  const [drillExitOpen, setDrillExitOpen] = useState<"basic" | "count" | null>(null);
  const [helpOpen, setHelpOpen] = useState<"basic" | "counting" | "play" | "rules" | null>(null);
  const [appSettingsOpen, setAppSettingsOpen] = useState(false);
  const [playSettingsOpen, setPlaySettingsOpen] = useState(false);
  const [hudOpen, setHudOpen] = useState(false);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [vaultView, setVaultView] = useState<VaultView>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>(defaultAppSettings);
  const [playSettings, setPlaySettings] = useState<PlaySettings>(defaultPlaySettings);

  // Basic strategy
  const [roundSize, setRoundSize] = useState(10);
  const [currentHand, setCurrentHand] = useState<TrainingHand | null>(null);
  const [handIndex, setHandIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [start, setStart] = useState(0);
  const [results, setResults] = useState<HandResult[]>([]);
  const [feedback, setFeedback] = useState("The table is ready. Pick the correct play.");
  const [showBasicReview, setShowBasicReview] = useState(false);

  // Counting
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
  const [countSubmitted, setCountSubmitted] = useState(false);

  // Play
  const [playDecks, setPlayDecks] = useState(6);
  const [playShoe, setPlayShoe] = useState<string[]>([]);
  const [seenCards, setSeenCards] = useState<string[]>([]);
  const [bankroll, setBankroll] = useState(DEFAULT_BANKROLL);
  const [seatBets, setSeatBets] = useState<SeatBets>(defaultSeatBets());
  const [seatLastChip, setSeatLastChip] = useState<SeatLastChips>(defaultSeatLastChips());
  const [selectedChip, setSelectedChip] = useState(5);
  const [dealerHand, setDealerHand] = useState<string[]>([]);
  const [playerHands, setPlayerHands] = useState<PlayerHand[]>([]);
  const [activeHand, setActiveHand] = useState(0);
  const [playPhase, setPlayPhase] = useState<PlayPhase>("betting");
  const [playMessage, setPlayMessage] = useState("Select a chip, then tap a betting spot.");
  const [bankrollAlert, setBankrollAlert] = useState<{ title: string; message: string } | null>(null);
  const [roundBanner, setRoundBanner] = useState<{ type: "win" | "lose" | "push" | "blackjack"; title: string; subtitle: string } | null>(null);
  const [hasLoadedSession, setHasLoadedSession] = useState(false);
  const [stats, setStats] = useState<GameStats>(defaultStats());

  const totalBet = useMemo(() => {
    if (playPhase === "player" || playPhase === "dealer") {
      return playerHands.reduce((sum, h) => sum + h.bet, 0);
    }
    return sumSeatBets(seatBets);
  }, [playPhase, playerHands, seatBets]);

  /* ─── Effects ─── */

  useEffect(() => {
    const i = window.setInterval(() => setNow(Date.now()), 50);
    return () => window.clearInterval(i);
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const statsRaw = window.localStorage.getItem(STATS_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      const sessionBankroll =
        typeof saved?.bankroll === "number" ? saved.bankroll : DEFAULT_BANKROLL;
      const parsed = statsRaw ? JSON.parse(statsRaw) : {};
      const sessionBankrollFields = saved
        ? {
            ...(typeof saved.startingBankroll === "number"
              ? { startingBankroll: saved.startingBankroll }
              : {}),
            ...(typeof saved.bankrollAdded === "number" ? { bankrollAdded: saved.bankrollAdded } : {}),
          }
        : {};
      setStats({
        ...defaultStats(sessionBankroll),
        ...parsed,
        ...sessionBankrollFields,
        ...migrateBankrollStats({ ...parsed, ...sessionBankrollFields }, sessionBankroll),
      });

      if (!raw) {
        setHasLoadedSession(true);
        return;
      }

      if (typeof saved.bankroll === "number") setBankroll(saved.bankroll);
      const loadedSeatBets = saved.seatBets
        ? { ...defaultSeatBets(), ...saved.seatBets }
        : typeof saved.bet === "number" && saved.bet > 0
          ? { left: 0, center: saved.bet, right: 0 }
          : defaultSeatBets();
      setSeatBets(loadedSeatBets);
      const savedChips = saved.seatLastChip ?? saved.seatBetVisuals ?? defaultSeatLastChips();
      setSeatLastChip(sanitizeSeatLastChips(loadedSeatBets, savedChips));
      if (typeof saved.playDecks === "number") setPlayDecks(saved.playDecks);
      if (Array.isArray(saved.playShoe)) setPlayShoe(saved.playShoe);
      if (Array.isArray(saved.seenCards)) setSeenCards(saved.seenCards);
      if (Array.isArray(saved.dealerHand)) setDealerHand(saved.dealerHand);
      if (Array.isArray(saved.playerHands)) setPlayerHands(saved.playerHands);
      if (typeof saved.activeHand === "number") setActiveHand(saved.activeHand);
      if (["betting", "player", "dealer", "roundOver"].includes(saved.playPhase)) setPlayPhase(saved.playPhase);
      if (typeof saved.playMessage === "string") setPlayMessage(saved.playMessage);
      if (saved.roundBanner === null || typeof saved.roundBanner === "object") setRoundBanner(saved.roundBanner);
      if (typeof saved.countDecks === "number") setCountDecks(saved.countDecks);
      if (typeof saved.countCards === "number") setCountCards(saved.countCards);
      if (typeof saved.guided === "boolean") setGuided(saved.guided);
      if (typeof saved.screen === "string") {
        if (saved.screen === "counting") setScreen("countLearn");
        else if (["home", "play", "trainer", "stats", "vault"].includes(saved.screen)) {
          setScreen(saved.screen as AppScreen);
        }
      }

      const appRaw = window.localStorage.getItem(APP_SETTINGS_KEY);
      if (appRaw) setAppSettings({ ...defaultAppSettings(), ...JSON.parse(appRaw) });

      const playRaw = window.localStorage.getItem(PLAY_SETTINGS_KEY);
      if (playRaw) {
        const parsed = JSON.parse(playRaw);
        setPlaySettings({ ...defaultPlaySettings(), ...parsed });
      } else if (typeof saved.showPlayTotals === "boolean") {
        setPlaySettings((prev) => ({ ...prev, showHandTotals: saved.showPlayTotals }));
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setHasLoadedSession(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedSession) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          bankroll,
          startingBankroll: stats.startingBankroll,
          bankrollAdded: stats.bankrollAdded,
          seatBets,
          seatLastChip,
          playDecks,
          playShoe,
          seenCards,
          dealerHand,
          playerHands,
          activeHand,
          playPhase,
          playMessage,
          roundBanner,
          countDecks,
          countCards,
          guided,
          screen: ["home", "play", "trainer", "stats", "vault"].includes(screen) ? screen : "home",
          savedAt: Date.now(),
        })
      );
    } catch { /* storage full */ }
  }, [
    hasLoadedSession, bankroll, stats.startingBankroll, stats.bankrollAdded, seatBets, seatLastChip, playDecks, playShoe, seenCards, dealerHand,
    playerHands, activeHand, playPhase, playMessage, roundBanner,
    countDecks, countCards, guided, screen,
  ]);

  useEffect(() => {
    if (!hasLoadedSession) return;
    try {
      window.localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(appSettings));
    } catch { /* */ }
  }, [hasLoadedSession, appSettings]);

  useEffect(() => {
    if (!hasLoadedSession) return;
    try {
      window.localStorage.setItem(PLAY_SETTINGS_KEY, JSON.stringify(playSettings));
    } catch { /* */ }
  }, [hasLoadedSession, playSettings]);

  useEffect(() => {
    if (!hasLoadedSession) return;
    try {
      window.localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch { /* */ }
  }, [hasLoadedSession, stats]);

  useEffect(() => {
    setPlayTipOpen(false);
    setBasicDrillTipOpen(false);
    setStrategyOpen(false);
    setCountHowItWorksOpen(false);
  }, [screen]);

  useEffect(() => {
    if (!hasLoadedSession) return;
    if (!playShoe.length) setPlayShoe(buildShoe(playDecks));
  }, [hasLoadedSession, playDecks, playShoe.length]);

  useEffect(() => {
    setStats((s) => ({ ...s, peakBankroll: Math.max(s.peakBankroll, bankroll) }));
  }, [bankroll]);

  /* ─── Derived ─── */

  const elapsed = start ? (now - start) / 1000 : 0;
  const accuracy = handIndex ? Math.round((correct / handIndex) * 100) : 0;
  const avgTime = avg(results.map((r) => r.seconds));
  const finalRunning = dealt.reduce((sum, c) => sum + hiLo(c), 0);
  const decksRemaining = Math.max(shoe.length / 52, 0.1);
  const finalTrue = finalRunning / decksRemaining;
  const runningGuessIsCorrect = countSubmitted && Number.isFinite(Number(runningGuess)) && Number(runningGuess) === finalRunning;
  const trueGuessIsCorrect = countSubmitted && Number.isFinite(Number(trueGuess)) && Math.abs(Number(trueGuess) - Number(finalTrue.toFixed(1))) <= 0.1;

  const playRunning = seenCards.reduce((sum, c) => sum + hiLo(c), 0);
  const playDecksRemaining = Math.max(playShoe.length / 52, 0.1);
  const playTrue = playRunning / playDecksRemaining;
  const penetration = Math.round(((playDecks * 52 - playShoe.length) / (playDecks * 52)) * 100);

  const activePlayHand = playerHands[activeHand];
  const dealerUpcard = dealerHand[0];
  const activeHandTotal = activePlayHand ? handValue(activePlayHand.cards).total : 0;
  const canAct = Boolean(
    playPhase === "player" &&
    activePlayHand &&
    !activePlayHand.stood &&
    !activePlayHand.busted &&
    !activePlayHand.result &&
    activeHandTotal < 21
  );
  const canHit = Boolean(canAct && activeHandTotal < 21);
  const canSplit = Boolean(canAct && activePlayHand && isPair(activePlayHand.cards) && bankroll >= activePlayHand.bet);
  const canDouble = Boolean(canAct && activePlayHand && activePlayHand.cards.length === 2 && bankroll >= activePlayHand.bet);
  const tipMove = activePlayHand && dealerUpcard && activePlayHand.cards.length >= 2 ? correctAction(activePlayHand.cards, dealerUpcard) : null;
  const dealerVisibleHand = playPhase === "player" && dealerHand.length > 1 ? [dealerHand[0]] : dealerHand;
  const canBet = playPhase === "betting" || playPhase === "roundOver";

  const handsBySeat = useMemo(() => {
    const map: Record<SeatId, PlayerHand[]> = { left: [], center: [], right: [] };
    playerHands.forEach((h) => map[h.seatId]?.push(h));
    return map;
  }, [playerHands]);

  const activeSeatId = activePlayHand?.seatId;
  const showPlayTotals = playSettings.showHandTotals;
  const recBet = recommendedTrainingBet(playTrue, bankroll, MIN_BET, MAX_BET);
  const totalProfitLoss = calcTotalProfitLoss(bankroll, stats.startingBankroll, stats.bankrollAdded);
  const showPlayStrategyTip = playTipOpen && playSettings.showBasicStrategyTips;
  const hasActivePlayableHand = Boolean(
    playPhase === "player" &&
    activePlayHand &&
    !isHandComplete(activePlayHand)
  );
  const showBasicDrillTip = basicDrillTipOpen && currentHand && Boolean(currentHand.answer);
  const basicDrillTipMove = currentHand?.answer ?? null;

  function maybeOpenHudAfterRound() {
    if (playSettings.autoOpenHudAfterRound) setHudOpen(true);
  }

  /* ─── Stats helpers ─── */

  function recordRoundResult(type: "win" | "lose" | "push" | "blackjack") {
    setStats((s) => ({
      ...s,
      roundsPlayed: s.roundsPlayed + 1,
      wins: s.wins + (type === "win" || type === "blackjack" ? 1 : 0),
      losses: s.losses + (type === "lose" ? 1 : 0),
      pushes: s.pushes + (type === "push" ? 1 : 0),
      blackjacks: s.blackjacks + (type === "blackjack" ? 1 : 0),
    }));
  }

  function recordRoundNet(net: number) {
    if (net <= 0) return;
    setStats((s) => ({ ...s, biggestWin: Math.max(s.biggestWin, net) }));
  }

  function recordRoundNetLoss(net: number) {
    if (net >= 0) return;
    setStats((s) => ({ ...s, biggestLoss: Math.max(s.biggestLoss, Math.abs(net)) }));
  }

  function recordRoundProfitLoss(net: number) {
    recordRoundNet(net);
    recordRoundNetLoss(net);
  }

  function resetStatsTracking() {
    setStats({
      ...defaultStats(bankroll),
      startingBankroll: bankroll,
      bankrollAdded: 0,
      peakBankroll: bankroll,
    });
  }

  function resetBankrollTracking() {
    setBankroll(DEFAULT_BANKROLL);
    setSeatBets(defaultSeatBets());
    setSeatLastChip(defaultSeatLastChips());
    setStats((s) => ({
      ...s,
      startingBankroll: DEFAULT_BANKROLL,
      bankrollAdded: 0,
      peakBankroll: DEFAULT_BANKROLL,
    }));
  }

  /* ─── Training ─── */

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
    const seconds = (now - start) / 1000;
    const ok = move === currentHand.answer;
    setResults((prev) => [...prev, { hand: currentHand, choice: move, seconds }]);
    setCorrect((prev) => prev + (ok ? 1 : 0));
    setFeedback(ok ? `Perfect. ${moveNames[move]} is the play.` : `Close. Correct play: ${moveNames[currentHand.answer]}.`);
    const next = handIndex + 1;
    setHandIndex(next);
    window.setTimeout(() => {
      if (next >= roundSize) {
        const acc = Math.round(((correct + (ok ? 1 : 0)) / roundSize) * 100);
        setStats((s) => ({ ...s, basicDrills: s.basicDrills + 1, basicAccuracySum: s.basicAccuracySum + acc }));
        setScreen("basicResults");
      } else {
        setCurrentHand(generateTrainingHand());
        setStart(Date.now());
        setFeedback("Next hand. Stay sharp.");
      }
    }, ok ? 650 : 1150);
  }

  function getNextDifferentCard(current: string | null, shoeList: string[]) {
    if (!shoeList.length) return { nextCard: null as string | null, nextShoe: shoeList };
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
    if (!dealt.length) { startCounting(); return; }
    const repeatCards = [...dealt];
    setShoe(repeatCards.slice(1).reverse());
    setCountCard(repeatCards[0]);
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
      setStats((s) => ({ ...s, countDrills: s.countDrills + 1 }));
      return;
    }
    const { nextCard, nextShoe } = getNextDifferentCard(countCard, shoe);
    window.setTimeout(() => {
      setShoe(nextShoe);
      setCountCard(nextCard);
      setCardStart(Date.now());
    }, 250);
  }

  /* ─── Play logic ─── */

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
    if (reshuffled) setPlayMessage("Shoe finished. New shoe shuffled.");
    return { drawn, nextShoe: working };
  }

  function showBankrollAlert(title: string, message: string) {
    setBankrollAlert({ title, message });
    setPlayMessage(message);
  }

  function addBankroll(amount: number) {
    setBankroll((b) => b + amount);
    setStats((s) => ({ ...s, bankrollAdded: s.bankrollAdded + amount }));
    setBankrollAlert(null);
    setPlayMessage(`Added $${amount.toLocaleString()} bankroll.`);
  }

  function resetBankrollToDefault() {
    resetBankrollTracking();
    setPlayMessage("Bankroll reset to $1,000.");
  }

  function renderBankrollActions() {
    return (
      <div className="hud-actions bankroll-actions">
        <button type="button" className="btn-secondary bankroll-action-wide" onClick={resetBankrollToDefault}>Reset Bankroll</button>
        {BANKROLL_ADD_OPTIONS.map((amount) => (
          <button key={amount} type="button" className="btn-secondary" onClick={() => addBankroll(amount)}>
            Add ${amount.toLocaleString()}
          </button>
        ))}
        <button type="button" className="btn-secondary bankroll-action-wide" onClick={() => resetShoe(playDecks)}>Shuffle New Shoe</button>
        <button type="button" className="btn-secondary bankroll-action-wide" onClick={resetSavedSession}>Reset Saved Session</button>
      </div>
    );
  }

  function placeBetOnSeat(seat: SeatId) {
    if (!canBet) return;
    const amount = selectedChip;
    const current = seatBets[seat];
    const newAmount = current + amount;
    const otherBets = totalBet - current;
    const available = bankroll - otherBets;

    if (newAmount > MAX_BET) {
      showBankrollAlert("Table Limit", MAX_BET_MSG);
      return;
    }
    if (available < amount || otherBets + newAmount > bankroll) {
      showBankrollAlert("Not Enough Bankroll", `Not enough bankroll for a ${chipLabel(amount)} chip.`);
      return;
    }
    setBankrollAlert(null);
    setSeatBets((prev) => ({ ...prev, [seat]: newAmount }));
    setSeatLastChip((prev) => ({ ...prev, [seat]: amount }));
    setPlayMessage(`$${amount.toLocaleString()} on ${seatLabel(seat)}. Total bet: $${(otherBets + newAmount).toLocaleString()}.`);
  }

  function clearBet() {
    if (!canBet) return;
    setSeatBets(defaultSeatBets());
    setSeatLastChip(defaultSeatLastChips());
    setBankrollAlert(null);
    setRoundBanner(null);
    if (playPhase === "roundOver") {
      setPlayerHands([]);
      setDealerHand([]);
      setActiveHand(0);
      setPlayPhase("betting");
    }
    setPlayMessage("Bets cleared. Select a chip, then tap a betting spot.");
  }

  function resetShoe(decks = playDecks) {
    setPlayShoe(buildShoe(decks));
    setSeenCards([]);
    setPlayMessage(`${decks}-deck shoe loaded.`);
  }

  function patchPlaySettings(patch: Partial<PlaySettings>) {
    setPlaySettings((prev) => ({ ...prev, ...patch }));
  }

  function patchAppSettings(patch: Partial<AppSettings>) {
    setAppSettings((prev) => ({ ...prev, ...patch }));
  }

  function resetAppData() {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(STATS_KEY);
    window.localStorage.removeItem(APP_SETTINGS_KEY);
    window.localStorage.removeItem(PLAY_SETTINGS_KEY);
    setAppSettings(defaultAppSettings());
    setPlaySettings(defaultPlaySettings());
    resetBankrollTracking();
    setStats(defaultStats(DEFAULT_BANKROLL));
    resetSavedSessionPlayState();
    setAppSettingsOpen(false);
  }

  function resetSavedSessionPlayState() {
    const freshDecks = 6;
    setPlayDecks(freshDecks);
    setPlayShoe(buildShoe(freshDecks));
    setSeenCards([]);
    setDealerHand([]);
    setPlayerHands([]);
    setActiveHand(0);
    setPlayPhase("betting");
    setRoundBanner(null);
    setBankrollAlert(null);
    setHudOpen(false);
    setCountDecks(6);
    setCountCards(20);
    setGuided(true);
    setPlayMessage("Session reset. Select a chip and tap a betting spot.");
  }

  function resetSavedSession() {
    window.localStorage.removeItem(STORAGE_KEY);
    resetBankrollTracking();
    resetSavedSessionPlayState();
  }

  function dealBlackjack() {
    if (!canBet) return;

    const activeSeats = SEAT_ORDER.filter((s) => seatBets[s] >= MIN_BET);
    if (!activeSeats.length) {
      showBankrollAlert("Place a Bet", `Minimum bet is $${MIN_BET} per hand. Tap a chip, then a betting spot.`);
      return;
    }
    for (const s of activeSeats) {
      if (seatBets[s] > MAX_BET) {
        showBankrollAlert("Table Limit", MAX_BET_MSG);
        return;
      }
    }
    if (totalBet > bankroll) {
      showBankrollAlert("Not Enough Bankroll", "Lower your bets or add bankroll.");
      return;
    }

    setBankrollAlert(null);
    setRoundBanner(null);
    setHudOpen(false);

    const cardsNeeded = activeSeats.length * 2 + 2;
    const { drawn, nextShoe } = drawFromPlayShoe(playShoe, cardsNeeded);
    let idx = 0;

    const hands: PlayerHand[] = activeSeats.map((seat) => ({
      cards: [],
      bet: seatBets[seat],
      seatId: seat,
    }));

    // Round 1: first card to each seat, then dealer up
    for (const hand of hands) hand.cards.push(drawn[idx++]);
    const dealer: string[] = [drawn[idx++]];

    // Round 2: second card to each seat, then dealer hole
    for (const hand of hands) hand.cards.push(drawn[idx++]);
    dealer.push(drawn[idx++]);

    const visibleNow = [...hands.flatMap((h) => h.cards), dealer[0]];
    setPlayShoe(nextShoe);
    setSeenCards((prev) => [...prev, ...visibleNow]);
    setBankroll((b) => b - totalBet);
    setDealerHand(dealer);
    setPlayerHands(hands);
    setActiveHand(0);

    const dealerBJ = isBlackjack(dealer);

    if (dealerBJ) {
      const reveal = dealer[1];
      setSeenCards((prev) => [...prev, reveal]);

      let totalReturn = 0;
      const settled = hands.map((hand) => {
        const playerBJ = isBlackjack(hand.cards);
        let payout = 0;
        let result = "";
        if (playerBJ) {
          payout = hand.bet;
          result = "Push";
        } else {
          payout = 0;
          result = "Dealer Blackjack";
        }
        totalReturn += payout;
        return { ...hand, stood: true, result, payout };
      });

      setBankroll((b) => b + totalReturn);
      setPlayerHands(settled);
      setPlayPhase("roundOver");

      const net = totalReturn - totalBet;
      recordRoundProfitLoss(net);
      if (net > 0) recordRoundResult("win");
      else if (net < 0) recordRoundResult("lose");
      else recordRoundResult("push");
      setPlayMessage(net > 0 ? `You won $${net}.` : net < 0 ? `You lost $${Math.abs(net)}.` : "Push round.");
      maybeOpenHudAfterRound();
      return;
    }

    let immediateReturn = 0;
    const handsAfterDeal = hands.map((hand) => {
      if (isBlackjack(hand.cards)) {
        const payout = hand.bet + hand.bet * 1.5;
        immediateReturn += payout;
        return { ...hand, stood: true, result: "Blackjack", payout };
      }
      return hand;
    });

    if (immediateReturn > 0) {
      setBankroll((b) => b + immediateReturn);
    }

    const firstPlayable = handsAfterDeal.findIndex((h) => !h.result);
    if (firstPlayable === -1) {
      setPlayerHands(handsAfterDeal);
      setPlayPhase("roundOver");
      const net = immediateReturn - totalBet;
      recordRoundProfitLoss(net);
      recordRoundResult("blackjack");
      setPlayMessage(`Blackjack! +$${net.toFixed(0)} (3:2).`);
      maybeOpenHudAfterRound();
      return;
    }

    setPlayerHands(handsAfterDeal);
    setActiveHand(firstPlayable);
    setPlayPhase("player");
    setPlayMessage(`Playing ${seatLabel(handsAfterDeal[firstPlayable].seatId)} hand. Your move.`);
  }

  function finishHand(updatedHands: PlayerHand[], nextIndex = activeHand + 1) {
    let idx = nextIndex;
    while (idx < updatedHands.length) {
      const h = updatedHands[idx];
      if (!h.stood && !h.busted && !h.result) break;
      idx++;
    }
    if (idx < updatedHands.length) {
      setPlayerHands(updatedHands);
      setActiveHand(idx);
      setPlayMessage(`Playing ${seatLabel(updatedHands[idx].seatId)} hand.`);
      return;
    }
    runDealerAndSettle(updatedHands);
  }

  function hitPlayHand() {
    if (playPhase !== "player") return;
    const { drawn, nextShoe } = drawFromPlayShoe(playShoe, 1);
    const updated = playerHands.map((h, i) => (i === activeHand ? { ...h, cards: [...h.cards, drawn[0]] } : h));
    const hand = updated[activeHand];
    setPlayShoe(nextShoe);
    setSeenCards((prev) => [...prev, drawn[0]]);
    if (isBust(hand.cards)) {
      hand.busted = true;
      hand.stood = true;
      hand.result = "Bust";
      setPlayMessage("Bust. Next hand.");
      finishHand(updated);
      return;
    }
    if (handValue(hand.cards).total === 21) {
      hand.stood = true;
      setPlayMessage("21. Standing.");
      finishHand(updated);
      return;
    }
    setPlayerHands(updated);
  }

  function standPlayHand() {
    if (playPhase !== "player") return;
    const updated = playerHands.map((h, i) => (i === activeHand ? { ...h, stood: true } : h));
    finishHand(updated);
  }

  function doublePlayHand() {
    if (playPhase !== "player" || !activePlayHand) return;
    if (activePlayHand.cards.length !== 2) { setPlayMessage("Double on first two cards only."); return; }
    if (bankroll < activePlayHand.bet) { setPlayMessage("Not enough bankroll to double."); return; }
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
    if (!isPair(activePlayHand.cards)) { setPlayMessage("Split matching pairs only."); return; }
    if (bankroll < activePlayHand.bet) { setPlayMessage("Not enough bankroll to split."); return; }
    const { drawn, nextShoe } = drawFromPlayShoe(playShoe, 2);
    let first: PlayerHand = { cards: [activePlayHand.cards[0], drawn[0]], bet: activePlayHand.bet, seatId: activePlayHand.seatId };
    let second: PlayerHand = { cards: [activePlayHand.cards[1], drawn[1]], bet: activePlayHand.bet, seatId: activePlayHand.seatId };
    if (handValue(first.cards).total === 21 && !isBlackjack(first.cards)) first = { ...first, stood: true };
    if (handValue(second.cards).total === 21 && !isBlackjack(second.cards)) second = { ...second, stood: true };
    const updated = [...playerHands];
    updated.splice(activeHand, 1, first, second);
    setBankroll((b) => b - activePlayHand.bet);
    setPlayShoe(nextShoe);
    setSeenCards((prev) => [...prev, ...drawn]);
    if (first.stood && !first.busted) {
      finishHand(updated);
      return;
    }
    setPlayerHands(updated);
    setPlayMessage("Split. Playing first hand.");
  }

  function runDealerAndSettle(hands: PlayerHand[]) {
    setPlayPhase("dealer");
    let dealer = [...dealerHand];
    let workingShoe = [...playShoe];
    const newlySeen: string[] = [];
    if (dealer[1]) newlySeen.push(dealer[1]);
    const needsDealerPlay = hands.some((h) => !h.result && !isBust(h.cards));
    if (needsDealerPlay) {
      while (shouldDealerHit(dealer, true)) {
        const draw = drawFromPlayShoe(workingShoe, 1);
        dealer = [...dealer, draw.drawn[0]];
        workingShoe = draw.nextShoe;
        newlySeen.push(draw.drawn[0]);
      }
    }
    const dealerTotal = handValue(dealer).total;
    const dealerBust = isBust(dealer);
    let additionalReturn = 0;
    const settled = hands.map((hand) => {
      if (hand.result === "Blackjack") return hand;
      let result = hand.result || "";
      let payout = hand.payout ?? 0;
      if (hand.result === "Bust" || isBust(hand.cards)) {
        return { ...hand, result: "Bust", payout: 0 };
      }
      if (dealerBust) { result = "Win"; payout = hand.bet * 2; }
      else if (handValue(hand.cards).total > dealerTotal) { result = "Win"; payout = hand.bet * 2; }
      else if (handValue(hand.cards).total < dealerTotal) { result = "Lose"; payout = 0; }
      else { result = "Push"; payout = hand.bet; }
      additionalReturn += payout;
      return { ...hand, result, payout };
    });
    setDealerHand(dealer);
    setPlayShoe(workingShoe);
    setSeenCards((prev) => [...prev, ...newlySeen]);
    setPlayerHands(settled);
    setBankroll((b) => b + additionalReturn);
    setPlayPhase("roundOver");
    const totalBetRound = hands.reduce((sum, h) => sum + h.bet, 0);
    const totalReturn = settled.reduce((sum, h) => sum + (h.payout || 0), 0);
    const net = totalReturn - totalBetRound;
    recordRoundProfitLoss(net);
    if (net > 0) recordRoundResult("win");
    else if (net < 0) recordRoundResult("lose");
    else recordRoundResult("push");
    setPlayMessage(net > 0 ? `You won $${net}.` : net < 0 ? `You lost $${Math.abs(net)}.` : "Push round.");
    maybeOpenHudAfterRound();
  }

  function navigate(s: MainScreen) {
    if (s === "play" && !playShoe.length) setPlayShoe(buildShoe(playDecks));
    setScreen(s);
  }

  function goToScreen(s: AppScreen) {
    setScreen(s);
  }

  function renderBetSpot(seat: SeatId) {
    const seatHands = handsBySeat[seat];
    const hasCards = seatHands.length > 0;
    const inActiveRound = playPhase === "player" || playPhase === "dealer";
    const seatHandBet = hasCards ? seatHands.reduce((sum, h) => sum + h.bet, 0) : 0;
    const bet = inActiveRound ? seatHandBet : seatBets[seat];
    const chipValue = bet > 0 ? seatLastChip[seat] : null;
    const isActive = playPhase === "player" && activeSeatId === seat;

    return (
      <div
        key={seat}
        className={`bet-spot ${bet > 0 ? "has-bet" : ""} ${isActive ? "active-seat" : ""}`}
        onClick={() => canBet && placeBetOnSeat(seat)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && canBet && placeBetOnSeat(seat)}
      >
        <div className="bet-spot-cards">
          {hasCards ? (
            <div className={`seat-split-hands ${seatHands.length > 1 ? "is-split" : ""}`}>
              {seatHands.map((hand, hi) => {
                const globalIdx = playerHands.indexOf(hand);
                const isHandActive = playPhase === "player" && globalIdx === activeHand;
                const popupLabel = handResultLabel(hand.result);
                const isNaturalBJ = hand.result === "Blackjack";
                return (
                  <div
                    key={`${seat}-${hi}-${globalIdx}`}
                    className={`split-hand ${isHandActive ? "player-hand-active" : ""} ${isNaturalBJ ? "hand-blackjack-glow" : ""}`}
                  >
                    {popupLabel && playPhase !== "betting" && hand.result !== "Dealer Blackjack" && (
                      <div className={`hand-result-popup ${handResultClass(hand.result)}`}>
                        {popupLabel}
                      </div>
                    )}
                    <div className="cards-fan" style={{ ["--card-count" as string]: hand.cards.length }}>
                      {hand.cards.map((c, ci) => (
                        <div key={`${c}-${ci}`} className="cards-fan-card" style={{ ["--card-index" as string]: ci }}>
                          <PlayingCard value={c} mini cardStyle={playSettings.cardStyle} />
                        </div>
                      ))}
                    </div>
                    {showPlayTotals && <span className="bet-spot-amount">{handValue(hand.cards).total}</span>}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
        <div className={`bet-spot-circle ${bet > 0 ? "has-chip" : ""}`}>
          {bet > 0 && <BetChipStack amount={bet} chipValue={chipValue} />}
        </div>
      </div>
    );
  }

  /* ─── JSX ─── */

  return (
    <main className={`app ${screen === "play" ? "app-play" : ""}`}>
      <div className="app-bg" />

      {/* HOME */}
      {screen === "home" && (
        <section className="screen home-screen">
          <HomeHeader onSettings={() => setAppSettingsOpen(true)} />
          <div className="home-hero">
            <LogoBadge />
            <p className="home-tagline">Play. Train. Count.</p>
            <p className="home-subtext">
              Master blackjack strategy, card counting, and live shoe play in one premium casino trainer.
            </p>
          </div>
          <div className="home-features">
            <FeatureCard iconSrc={HOME_ICON_MAP.play} title="Play Blackjack" subtitle="Live shoe practice with multi-hand betting, splits, doubles, and 3:2 blackjack." action="Enter Table" variant="play" onClick={() => navigate("play")} />
            <FeatureCard iconSrc={HOME_ICON_MAP.trainer} title="Trainer" subtitle="Basic strategy drills and Hi-Lo card counting academy." action="Start Training" variant="trainer" onClick={() => navigate("trainer")} />
            <FeatureCard iconSrc={HOME_ICON_MAP.stats} title="Stats" subtitle="Track your sessions, accuracy, and bankroll performance." action="View Stats" variant="stats" onClick={() => navigate("stats")} />
            <FeatureCard iconSrc={HOME_ICON_MAP.vault} title="Vault" subtitle="Strategy cards, rules guides, and premium references." action="Open Vault" variant="vault" onClick={() => navigate("vault")} />
          </div>
        </section>
      )}

      {/* PLAY */}
      {screen === "play" && (
        <section className={`screen screen-play ${playSettings.cardStyle === "classic" ? "card-style-classic" : ""}`}>
          <div className="play-landscape-stage">
          <div className="play-layout">
            <header className="play-top-bar">
              <button className="btn-ghost play-hud-exit" onClick={() => setExitConfirmOpen(true)}>Exit</button>
              <div className="play-hud-stats">
                <div className="hud-stat hud-stat-accent">
                  <strong className="hud-stat-value">${bankroll.toLocaleString()}</strong>
                  <span>Bankroll</span>
                </div>
                <div className="hud-stat">
                  <strong className="hud-stat-value">${totalBet.toLocaleString()}</strong>
                  <span>Total Bet</span>
                </div>
                <div className="hud-stat play-hud-stat-cards" aria-label="Cards remaining">
                  <strong className="hud-stat-value">{playShoe.length.toLocaleString()}</strong>
                  <span>Cards Left</span>
                </div>
              </div>
              <button className="btn-ghost play-hud-settings" onClick={() => setPlaySettingsOpen(true)} aria-label="Table Settings"><Settings2 size={14} /></button>
            </header>

            <div className="play-stage">
            <div className="play-table-wrap">
              <div className={`casino-table ${playSettings.tableGlow ? "table-glow-on" : "table-glow-off"}`}>
                <div className="table-rules" aria-label="Table rules">
                  <span>H17</span>
                  <span className="table-rules-sep">·</span>
                  <span>3:2</span>
                  <span className="table-rules-sep">·</span>
                  <span>DAS</span>
                  <span className="table-rules-sep">·</span>
                  <span>MIN ${MIN_BET}</span>
                  <span className="table-rules-sep">·</span>
                  <span>MAX $250K</span>
                </div>
                <div className="cards-remaining-box" aria-label="Cards remaining">
                  <span className="cards-remaining-label">CARDS REMAINING</span>
                  <strong className="cards-remaining-count">{playShoe.length}</strong>
                </div>

                <div className="dealer-zone">
                  <span className="zone-label">Dealer</span>
                  {playPhase === "roundOver" && dealerHand.length >= 2 && isBlackjack(dealerHand) && (
                    <div className="dealer-result-banner dealer-blackjack">Dealer Blackjack</div>
                  )}
                  <div className="cards-fan dealer-cards-fan" style={{ ["--card-count" as string]: dealerVisibleHand.length + (playPhase === "player" && dealerHand[1] ? 1 : 0) }}>
                    {dealerHand.length ? (
                      <>
                        {dealerVisibleHand.map((c, i) => (
                          <div key={`${c}-${i}`} className="cards-fan-card" style={{ ["--card-index" as string]: i }}>
                            <PlayingCard value={c} cardStyle={playSettings.cardStyle} />
                          </div>
                        ))}
                        {playPhase === "player" && dealerHand[1] && (
                          <div className="cards-fan-card" style={{ ["--card-index" as string]: dealerVisibleHand.length }}>
                            <PlayingCard value="back" faceDown cardStyle={playSettings.cardStyle} />
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="cards-fan-card" style={{ ["--card-index" as string]: 0 }}>
                        <PlayingCard value="back" faceDown cardStyle={playSettings.cardStyle} />
                      </div>
                    )}
                  </div>
                  {showPlayTotals && dealerHand.length > 0 && (
                    <span className="hand-total">
                      {playPhase === "player" ? handValue([dealerHand[0]]).total : handValue(dealerHand).total}
                    </span>
                  )}
                </div>

                <div className="betting-spots">
                  {DISPLAY_SEATS.map(renderBetSpot)}
                </div>

                <div className="table-gold-rail" />
              </div>
            </div>
            </div>

            <footer className="play-controls">
              <div className="play-controls-row">
                <div className="play-chip-section">
                  <ChipTray selectedChip={selectedChip} onSelectChip={setSelectedChip} disabled={!canBet} />
                </div>
                <div className="play-bet-section">
                  <div className="bet-actions">
                    <button className="btn-secondary" onClick={clearBet} disabled={!canBet}>Clear Bet</button>
                    <button className="btn-primary" onClick={dealBlackjack} disabled={!canBet}>Deal</button>
                  </div>
                </div>
                <div className="play-action-section">
                  <ActionButtons
                    canHit={canHit}
                    canStand={canAct}
                    canDouble={canDouble}
                    canSplit={canSplit}
                    canSurrender={false}
                    onHit={hitPlayHand}
                    onStand={standPlayHand}
                    onDouble={doublePlayHand}
                    onSplit={splitPlayHand}
                  />
                </div>
              </div>
              <p className="play-message">{playMessage}</p>
              <div className="play-hud-utilities">
                <button className="btn-ghost play-util-strategy" onClick={() => setStrategyOpen(true)} aria-label="Strategy card">Strategy</button>
                {playSettings.showBasicStrategyTips && (
                  <button className={`btn-ghost play-util-tip ${playTipOpen ? "active" : ""}`} onClick={() => setPlayTipOpen((v) => !v)} aria-label="Basic strategy tip">Tip</button>
                )}
                <button className="btn-ghost play-util-hud" onClick={() => setHudOpen(true)} aria-label="Open HUD">HUD</button>
              </div>
            </footer>
          </div>
          </div>
        </section>
      )}

      {/* TRAINER HUB */}
      {screen === "trainer" && (
        <section className="screen panel-screen">
          <div className="panel-header">
            <span className="eyebrow">Training Academy</span>
            <h1>Sharpen Your Edge</h1>
            <p className="text-muted">Build instinct through structured drills and guided lessons.</p>
          </div>
          <div className="trainer-grid trainer-grid-two">
            <button className="trainer-card" onClick={() => goToScreen("basic")}>
              <strong>Basic Strategy Academy</strong>
              <span>Hard, soft, and pair decisions against every dealer upcard.</span>
              <em>Enter Academy</em>
            </button>
            <button className="trainer-card" onClick={() => goToScreen("countLearn")}>
              <strong>Card Counting Academy</strong>
              <span>Hi-Lo values, running/true count, and deck estimation drills.</span>
              <em>Enter Academy</em>
            </button>
          </div>
        </section>
      )}

      {/* BASIC ACADEMY */}
      {screen === "basic" && (
        <section className="screen panel-screen">
          <button className="back-link" onClick={() => setScreen("trainer")}>← Trainer</button>
          <div className="panel-header">
            <span className="eyebrow">Basic Strategy Academy</span>
            <h1>Perfect Decisions</h1>
            <p className="text-muted">Train until the correct play is automatic.</p>
          </div>
          <div className="action-plan">
            <p><strong>Hard totals:</strong> Stand, hit, double, or surrender based on your total vs dealer upcard.</p>
            <p><strong>Soft totals:</strong> Hands with an Ace counted as 11 — often double or stand.</p>
            <p><strong>Pairs:</strong> Split matching ranks when the math favors two hands.</p>
            <p><strong>Dealer upcards:</strong> 2 through Ace drive every decision on the strategy card.</p>
            <p><strong>Actions:</strong> Hit, Stand, Double, Split, Surrender when allowed.</p>
          </div>
          <div className="academy-actions">
            <button className="btn-primary" onClick={startBasic}>Start Drill</button>
            <button className="btn-secondary" onClick={() => setStrategyOpen(true)}>Strategy Card</button>
          </div>
          <div className="selector">
            {[10, 25, 50].map((n) => (
              <button key={n} className={roundSize === n ? "selected" : ""} onClick={() => setRoundSize(n)}>{n} hands</button>
            ))}
          </div>
          <button className="btn-secondary" onClick={() => setHelpOpen("basic")}><HelpCircle size={16} /> How This Works</button>
        </section>
      )}

      {/* BASIC DRILL */}
      {screen === "basicDrill" && currentHand && (
        <section className="screen drill-screen">
          <div className="drill-header">
            <button className="drill-exit-btn" onClick={() => setDrillExitOpen("basic")}>Exit</button>
            <div className="drill-header-actions">
              <button className="btn-ghost" onClick={() => setBasicDrillTipOpen((v) => !v)}>Tip</button>
              <button className="btn-ghost" onClick={() => setStrategyOpen(true)}>Strategy Card</button>
            </div>
          </div>
          <div className="drill-table">
            <div>
              <span className="zone-label">Dealer</span>
              <PlayingCard value={currentHand.dealer} />
            </div>
            <div>
              <span className="zone-label">Your Hand</span>
              <h2>{handLabel(currentHand)}</h2>
              <div className="cards-row">
                {currentHand.player.map((c, i) => <PlayingCard key={`${c}-${i}`} value={c} />)}
              </div>
            </div>
          </div>
          <div className="timer-bar"><Clock size={16} /> {elapsed.toFixed(2)}s</div>
          <div className="drill-moves">
            {(["R", "P", "D", "S", "H"] as Move[]).map((m) => (
              <button key={m} className={`action-btn ${m === "H" ? "hit" : m === "S" ? "stand" : m === "D" ? "double" : m === "P" ? "split" : "surrender"}`} onClick={() => chooseMove(m)}>
                {moveNames[m]}
              </button>
            ))}
          </div>
          <div className="feedback-bar">{feedback}</div>
        </section>
      )}

      {/* BASIC RESULTS */}
      {screen === "basicResults" && (
        <section className="screen panel-screen">
          <div className="panel-header">
            <span className="eyebrow">Drill Complete</span>
            <h1>{accuracy >= 90 ? "Strong Round" : "Good Reps"}</h1>
          </div>
          <div className="drill-stats">
            <div><strong>{accuracy}%</strong><span>Accuracy</span></div>
            <div><strong>{correct}/{roundSize}</strong><span>Correct</span></div>
            <div><strong>{avgTime.toFixed(2)}s</strong><span>Avg Time</span></div>
          </div>
          <div className="action-plan">
            <p>• Under 90%? Run another drill before moving on.</p>
            <p>• Review missed hands below.</p>
            <p>• Open the Strategy Card anytime to study.</p>
          </div>
          <div className="result-actions">
            <button className="btn-primary" onClick={startBasic}><RotateCcw size={16} /> Run Again</button>
            <button className="btn-secondary" onClick={() => setShowBasicReview((v) => !v)}>
              {showBasicReview ? "Hide Review" : "Show Review"}
            </button>
          </div>
          {showBasicReview && (
            <div className="answer-review">
              {results.map((r, i) => {
                const ok = r.choice === r.hand.answer;
                return (
                  <div key={i} className={`review-card ${ok ? "correct" : "wrong"}`}>
                    <div className="review-top"><strong>Hand {i + 1}</strong><span>{ok ? "Correct" : "Wrong"}</span></div>
                    <p>You had <b>{r.hand.player.join(" ")}</b> vs dealer <b>{r.hand.dealer}</b></p>
                    <div className="review-grid">
                      <div><small>Your Play</small><strong>{moveNames[r.choice]}</strong></div>
                      <div><small>Correct</small><strong>{moveNames[r.hand.answer]}</strong></div>
                      <div><small>Time</small><strong>{r.seconds.toFixed(2)}s</strong></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <button className="btn-secondary" onClick={() => setScreen("trainer")}>Back to Trainer</button>
        </section>
      )}

      {/* COUNTING ACADEMY */}
      {screen === "countLearn" && (
        <section className="screen panel-screen">
          <button className="back-link" onClick={() => setScreen("trainer")}>← Trainer</button>
          <div className="panel-header">
            <span className="eyebrow">Card Counting Academy</span>
            <h1>Track the Shoe</h1>
            <p className="text-muted">Hi-Lo assigns a value to every card. Keep a running total.</p>
          </div>
          <div className="academy-actions">
            <button className="btn-primary" onClick={startCounting}>Start Drill</button>
            <button className="btn-secondary" onClick={() => setCountHowItWorksOpen(true)}><HelpCircle size={16} /> How It Works</button>
          </div>
          <div className="selector">
            {[10, 20, 40, 60].map((n) => (
              <button key={n} className={countCards === n ? "selected" : ""} onClick={() => setCountCards(n)}>{n} cards</button>
            ))}
          </div>
          <div className="selector">
            {[1, 2, 4, 6].map((n) => (
              <button key={n} className={countDecks === n ? "selected" : ""} onClick={() => setCountDecks(n)}>{n} Deck{n > 1 ? "s" : ""}</button>
            ))}
          </div>
          <label className="toggle">
            <input type="checkbox" checked={guided} onChange={(e) => setGuided(e.target.checked)} />
            Guided mode: show running count
          </label>
        </section>
      )}

      {/* COUNT DRILL */}
      {screen === "countDrill" && (
        <section className="screen drill-screen">
          <div className="drill-header">
            <button className="drill-exit-btn" onClick={() => setDrillExitOpen("count")}>Exit</button>
          </div>
          <div className="drill-stats">
            <div><strong>{dealt.length}/{countCards}</strong><span>Cards</span></div>
            <div><strong>{dealt.length ? Math.round((countCorrect / dealt.length) * 100) : 0}%</strong><span>Recognition</span></div>
            <div><strong>{(avg(swipeTimes) / 1000).toFixed(2)}s</strong><span>Avg Speed</span></div>
          </div>
          {guided && countCard && (
            <div className="running-count">Running Count: <strong>{finalRunning >= 0 ? "+" : ""}{finalRunning}</strong></div>
          )}
          <div className="drill-table">
            {countCard ? <PlayingCard value={countCard} /> : <strong style={{ color: "var(--gold)", fontSize: 24 }}>Drill Complete</strong>}
            {countCard && <div className="count-hint"><span>← -1</span><span>0</span><span>+1 →</span></div>}
          </div>
          {countCard ? (
            <div className="swipe-buttons">
              <button onClick={() => chooseCount(-1)}><ChevronLeft size={16} /> -1</button>
              <button onClick={() => chooseCount(0)}>0</button>
              <button onClick={() => chooseCount(1)}>+1 <ChevronRight size={16} /></button>
            </div>
          ) : (
            <div className="glass-panel" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              <h2>Final Count Quiz</h2>
              <p className="text-muted">{countDecks}-deck shoe • Decks remaining: {decksRemaining.toFixed(1)}</p>
              <input className="form-input" placeholder="Running count" value={runningGuess} onChange={(e) => setRunningGuess(e.target.value)} />
              <input className="form-input" placeholder="True count" value={trueGuess} onChange={(e) => setTrueGuess(e.target.value)} />
              <button className="btn-primary" onClick={() => setCountSubmitted(true)}>Check My Count</button>
              {countSubmitted && (
                <div className="count-grade">
                  <div className={`grade-card ${runningGuessIsCorrect ? "correct" : "wrong"}`}>
                    <small>Running Count</small><strong>{runningGuessIsCorrect ? "Correct" : "Wrong"}</strong>
                    <span>Yours: {runningGuess || "—"}</span><span>Actual: {finalRunning >= 0 ? "+" : ""}{finalRunning}</span>
                  </div>
                  <div className={`grade-card ${trueGuessIsCorrect ? "correct" : "wrong"}`}>
                    <small>True Count</small><strong>{trueGuessIsCorrect ? "Correct" : "Wrong"}</strong>
                    <span>Yours: {trueGuess || "—"}</span><span>Actual: {finalTrue >= 0 ? "+" : ""}{finalTrue.toFixed(1)}</span>
                  </div>
                </div>
              )}
              <button className="btn-primary" onClick={reDrillSameCountingCards}>Re-Drill Same Cards</button>
              <button className="btn-secondary" onClick={() => setScreen("countLearn")}>Back to Academy</button>
            </div>
          )}
          <div className="feedback-bar">{countFeedback}</div>
        </section>
      )}

      {/* STATS */}
      {screen === "stats" && (
        <section className="screen panel-screen">
          <div className="panel-header">
            <span className="eyebrow">Performance</span>
            <h1>Your Stats</h1>
            <p className="text-muted">Tracked locally on this device.</p>
          </div>
          <div className="stats-grid">
            <div className="stat-card"><strong>{stats.roundsPlayed}</strong><span>Rounds Played</span></div>
            <div className="stat-card"><strong>{stats.wins}</strong><span>Wins</span></div>
            <div className="stat-card"><strong>{stats.losses}</strong><span>Losses</span></div>
            <div className="stat-card"><strong>{stats.pushes}</strong><span>Pushes</span></div>
            <div className="stat-card"><strong>{stats.blackjacks}</strong><span>Blackjacks</span></div>
            <div className="stat-card"><strong>{stats.roundsPlayed ? Math.round((stats.wins / stats.roundsPlayed) * 100) : 0}%</strong><span>Win Rate</span></div>
            <div className="stat-card"><strong>{stats.basicDrills}</strong><span>BS Drills</span></div>
            <div className="stat-card"><strong>{stats.basicDrills ? Math.round(stats.basicAccuracySum / stats.basicDrills) : 0}%</strong><span>Avg BS Accuracy</span></div>
            <div className="stat-card"><strong>{stats.countDrills}</strong><span>Count Drills</span></div>
            <div className="stat-card wide"><strong>{formatProfitLoss(totalProfitLoss)}</strong><span>Net Profit / Loss</span></div>
            <div className="stat-card wide"><strong>${stats.bankrollAdded.toLocaleString()}</strong><span>Total Bankroll Added</span></div>
            <div className="stat-card wide"><strong>${stats.peakBankroll.toLocaleString()}</strong><span>Peak Bankroll</span></div>
            <div className="stat-card wide"><strong>${bankroll.toLocaleString()}</strong><span>Current Bankroll</span></div>
            <div className="stat-card"><strong>{stats.biggestWin > 0 ? `+$${stats.biggestWin.toLocaleString()}` : "$0"}</strong><span>Biggest Win</span></div>
            <div className="stat-card"><strong>{stats.biggestLoss > 0 ? `-$${stats.biggestLoss.toLocaleString()}` : "$0"}</strong><span>Biggest Loss</span></div>
          </div>
          <button className="btn-secondary" onClick={resetStatsTracking}>
            Reset Stats
          </button>
        </section>
      )}

      {/* VAULT */}
      {screen === "vault" && !vaultView && (
        <section className="screen panel-screen vault-screen">
          <div className="panel-header">
            <h1>Vault</h1>
            <p className="text-muted">Fast blackjack knowledge, strategy references, counting tools, and review guides.</p>
          </div>
          <div className="vault-features">
            <VaultCard
              title="Basic Strategy Card"
              subtitle="The full reference for hard totals, soft totals, pairs, and dealer upcards."
              action="Open Full Strategy Card"
              onClick={() => setVaultView("strategy")}
            />
            <VaultCard
              title="Table Rules"
              subtitle="Know the rules before you play the shoe."
              action="View Rules"
              onClick={() => setVaultView("rules")}
            />
            <VaultCard
              title="Hi-Lo Counting Guide"
              subtitle="Track the shoe and learn when the deck favors the player."
              action="Study Counting"
              onClick={() => setVaultView("counting")}
            />
            <VaultCard
              title="True Count Betting Guide"
              subtitle="Learn when the count justifies a bigger bet."
              action="Learn Betting"
              onClick={() => setVaultView("betting")}
            />
            <VaultCard
              title="Common Mistakes"
              subtitle="Avoid the plays that cost beginners the most money."
              action="Review Mistakes"
              onClick={() => setVaultView("mistakes")}
            />
            <VaultCard
              title="Weakness Review"
              subtitle="Review the hands and skills that need the most work."
              action="View Weaknesses"
              onClick={() => setVaultView("weaknesses")}
            />
          </div>
        </section>
      )}

      {screen === "vault" && vaultView === "strategy" && (
        <VaultPanel
          title="Basic Strategy Card"
          subtitle="The full reference for hard totals, soft totals, pairs, and dealer upcards."
          onBack={() => setVaultView(null)}
        >
          <VaultStrategyContent onOpenStrategyCard={() => setStrategyOpen(true)} />
        </VaultPanel>
      )}

      {screen === "vault" && vaultView === "rules" && (
        <VaultPanel title="Table Rules" subtitle="Know the rules before you play the shoe." onBack={() => setVaultView(null)}>
          <VaultRulesContent />
        </VaultPanel>
      )}

      {screen === "vault" && vaultView === "counting" && (
        <VaultPanel
          title="Hi-Lo Counting Guide"
          subtitle="Track the shoe and learn when the deck favors the player."
          onBack={() => setVaultView(null)}
        >
          <VaultCountingContent />
        </VaultPanel>
      )}

      {screen === "vault" && vaultView === "betting" && (
        <VaultPanel
          title="True Count Betting Guide"
          subtitle="Learn when the count justifies a bigger bet."
          onBack={() => setVaultView(null)}
        >
          <VaultBettingContent />
        </VaultPanel>
      )}

      {screen === "vault" && vaultView === "mistakes" && (
        <VaultPanel
          title="Common Mistakes"
          subtitle="Avoid the plays that cost beginners the most money."
          onBack={() => setVaultView(null)}
        >
          <VaultMistakesContent />
        </VaultPanel>
      )}

      {screen === "vault" && vaultView === "weaknesses" && (
        <VaultPanel
          title="Weakness Review"
          subtitle="Review the hands and skills that need the most work."
          onBack={() => setVaultView(null)}
        >
          <VaultWeaknessContent
            stats={{
              basicDrills: stats.basicDrills,
              basicAccuracySum: stats.basicAccuracySum,
              countDrills: stats.countDrills,
              roundsPlayed: stats.roundsPlayed,
              wins: stats.wins,
              peakBankroll: stats.peakBankroll,
              bankroll,
            }}
            onReDrillBasic={() => { setVaultView(null); goToScreen("basic"); }}
            onReDrillCounting={() => { setVaultView(null); goToScreen("countLearn"); }}
            onOpenStrategyCard={() => setStrategyOpen(true)}
            onStartPlay={() => { setVaultView(null); navigate("play"); }}
          />
        </VaultPanel>
      )}

      {/* Bottom Nav */}
      {(["home", "trainer", "stats", "vault"] as MainScreen[]).includes(screen as MainScreen) && (
        <BottomNav active={screen as MainScreen} onNavigate={navigate} />
      )}

      {/* Overlays */}
      {strategyOpen && <StrategyCardOverlay onClose={() => setStrategyOpen(false)} />}

      {hudOpen && (
        <OverlaySheet title="Live Shoe Data" eyebrow="Training HUD" description="Card counting data from visible cards only." onClose={() => setHudOpen(false)}>
          <div className="hud-grid hud-grid-live">
            <div><strong>{playRunning >= 0 ? "+" : ""}{playRunning}</strong><span>Running Count</span></div>
            <div><strong>{playTrue >= 0 ? "+" : ""}{playTrue.toFixed(1)}</strong><span>True Count</span></div>
            <div><strong>{playDecksRemaining.toFixed(1)}</strong><span>Decks Remaining</span></div>
            <div><strong>{penetration}%</strong><span>Penetration</span></div>
            <div><strong>{playShoe.length}</strong><span>Cards Remaining</span></div>
          </div>
          {playSettings.showRecommendedBet && (
            <div className="recommended-bet-panel recommended-bet-panel-hud glass-panel">
              <span className="eyebrow">Recommended Training Bet</span>
              <div className="recommended-bet-stats">
                <div><strong>${recBet.amount}</strong><span>Recommended Bet</span></div>
                <div><strong>{recBet.units}</strong><span>Units</span></div>
                <div><strong>{recBet.reason}</strong><span>Reason</span></div>
              </div>
              <p className="text-muted recommended-bet-note">
                Educational only — based on ${MIN_BET} units (TC 0/+1=$5, +2=$10, +3=$20, +4=$30, +5+=$40). Capped at table max and bankroll. Does not place bets.
              </p>
            </div>
          )}
          <div className="settings-section hud-bankroll-section">
            <span className="eyebrow">Bankroll</span>
            <p className="text-muted recommended-bet-note">Current bankroll: <strong>${bankroll.toLocaleString()}</strong></p>
            {renderBankrollActions()}
          </div>
        </OverlaySheet>
      )}

      {playSettingsOpen && (
        <OverlaySheet title="Table Settings" eyebrow="Play Blackjack" description="Gameplay preferences for the live table." onClose={() => setPlaySettingsOpen(false)}>
          <div className="settings-section">
            <span className="eyebrow">Gameplay</span>
            <label className="toggle"><input type="checkbox" checked={playSettings.showHandTotals} onChange={(e) => patchPlaySettings({ showHandTotals: e.target.checked })} />Show hand totals</label>
            <label className="toggle"><input type="checkbox" checked={playSettings.showBasicStrategyTips} onChange={(e) => patchPlaySettings({ showBasicStrategyTips: e.target.checked })} />Show basic strategy tips</label>
            <label className="toggle"><input type="checkbox" checked={playSettings.showRecommendedBet} onChange={(e) => patchPlaySettings({ showRecommendedBet: e.target.checked })} />Show recommended bet in HUD</label>
            <label className="toggle"><input type="checkbox" checked={playSettings.autoOpenHudAfterRound} onChange={(e) => patchPlaySettings({ autoOpenHudAfterRound: e.target.checked })} />Auto-open HUD after round</label>
            <div className="settings-row">
              <span>Dealer speed</span>
              <div className="selector selector-inline">
                {(["slow", "normal", "fast"] as const).map((speed) => (
                  <button key={speed} className={playSettings.dealerSpeed === speed ? "selected" : ""} onClick={() => patchPlaySettings({ dealerSpeed: speed })}>{speed}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="settings-section">
            <span className="eyebrow">Audio (placeholders)</span>
            <label className="toggle"><input type="checkbox" checked={playSettings.soundEffects} onChange={(e) => patchPlaySettings({ soundEffects: e.target.checked })} />Sound effects</label>
            <label className="toggle"><input type="checkbox" checked={playSettings.music} onChange={(e) => patchPlaySettings({ music: e.target.checked })} />Music</label>
            <label className="toggle"><input type="checkbox" checked={playSettings.haptics} onChange={(e) => patchPlaySettings({ haptics: e.target.checked })} />Haptics</label>
          </div>
          <div className="settings-section">
            <span className="eyebrow">Visual</span>
            <label className="toggle"><input type="checkbox" checked={playSettings.animations} onChange={(e) => patchPlaySettings({ animations: e.target.checked })} />Animations</label>
            <label className="toggle"><input type="checkbox" checked={playSettings.tableGlow} onChange={(e) => patchPlaySettings({ tableGlow: e.target.checked })} />Table glow</label>
            <div className="settings-row">
              <span>Card style</span>
              <div className="selector selector-inline">
                {(["classic", "premium"] as const).map((style) => (
                  <button key={style} className={playSettings.cardStyle === style ? "selected" : ""} onClick={() => patchPlaySettings({ cardStyle: style })}>{style}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="settings-section">
            <span className="eyebrow">Shoe</span>
            <div className="selector">
              {[1, 2, 6, 8].map((n) => (
                <button key={n} className={playDecks === n ? "selected" : ""} onClick={() => { if (canBet) { setPlayDecks(n); resetShoe(n); } else setPlayMessage("Change decks after the round ends."); }}>
                  {n} Deck{n > 1 ? "s" : ""}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-section">
            <span className="eyebrow">Session</span>
            {renderBankrollActions()}
          </div>
        </OverlaySheet>
      )}

      {appSettingsOpen && (
        <OverlaySheet title="App Settings" eyebrow="Blackjack Edge" description="General preferences across the app." onClose={() => setAppSettingsOpen(false)}>
          <div className="settings-section">
            <span className="eyebrow">Audio</span>
            <label className="toggle"><input type="checkbox" checked={appSettings.soundEffects} onChange={(e) => patchAppSettings({ soundEffects: e.target.checked })} />Sound effects</label>
            <label className="toggle"><input type="checkbox" checked={appSettings.music} onChange={(e) => patchAppSettings({ music: e.target.checked })} />Music</label>
            <label className="toggle"><input type="checkbox" checked={appSettings.haptics} onChange={(e) => patchAppSettings({ haptics: e.target.checked })} />Haptics</label>
          </div>
          <div className="settings-section">
            <span className="eyebrow">Visual</span>
            <label className="toggle"><input type="checkbox" checked={appSettings.animations} onChange={(e) => patchAppSettings({ animations: e.target.checked })} />Animations</label>
            <label className="toggle"><input type="checkbox" checked={appSettings.tableGlow} onChange={(e) => patchAppSettings({ tableGlow: e.target.checked })} />Table glow</label>
          </div>
          <div className="settings-section">
            <span className="eyebrow">Learning</span>
            <label className="toggle"><input type="checkbox" checked={appSettings.showTutorials} onChange={(e) => patchAppSettings({ showTutorials: e.target.checked })} />Show tutorials</label>
          </div>
          <div className="settings-section">
            <span className="eyebrow">Data</span>
            <div className="hud-actions">
              <button className="btn-secondary" onClick={resetSavedSession}>Reset play session</button>
              <button className="btn-secondary" onClick={resetStatsTracking}>Reset stats</button>
              <button className="btn-primary" onClick={resetAppData}>Reset all app data</button>
            </div>
          </div>
        </OverlaySheet>
      )}

      {helpOpen && (
        <OverlaySheet
          title={helpOpen === "play" ? "Play Blackjack" : helpOpen === "counting" ? "Card Counting" : helpOpen === "rules" ? "Table Rules" : "Basic Strategy"}
          eyebrow="Help"
          onClose={() => setHelpOpen(null)}
        >
          <div className="help-copy">
            {helpOpen === "play" && (
              <>
                <p>Select a chip, then tap left/center/right betting spots. Deal plays hands right to left.</p>
                <p>Use HUD for shoe data. Hole card hidden until dealer plays.</p>
              </>
            )}
            {helpOpen === "basic" && (
              <>
                <p>Pick the mathematically correct move. Build instant recognition.</p>
                <p>Open the Strategy Card when studying.</p>
              </>
            )}
            {helpOpen === "counting" && (
              <>
                <p>Hi-Lo: 2–6 = +1, 7–9 = 0, 10–A = -1.</p>
                <p>Enter running and true count after the drill.</p>
              </>
            )}
            {helpOpen === "rules" && (
              <>
                <p>H17 dealer, 3:2 blackjack, double after split.</p>
                <p>Min ${MIN_BET}, max ${MAX_BET.toLocaleString()} per hand. Up to 3 hands.</p>
              </>
            )}
          </div>
        </OverlaySheet>
      )}

      {exitConfirmOpen && (
        <DialogCard
          eyebrow="Leave Table?"
          title="Exit Play?"
          message="Your session is saved on this device."
          cancelLabel="Stay"
          confirmLabel="Exit"
          onCancel={() => setExitConfirmOpen(false)}
          onConfirm={() => { setExitConfirmOpen(false); setScreen("home"); }}
        />
      )}

      {bankrollAlert && (
        <DialogCard
          eyebrow="Blackjack Edge"
          title={bankrollAlert.title}
          message={bankrollAlert.message}
          cancelLabel="Got it"
          confirmLabel="Add $500"
          onCancel={() => setBankrollAlert(null)}
          onConfirm={() => addBankroll(500)}
        />
      )}

      {showPlayStrategyTip && (
        <div className="tip-panel">
          <div className="tip-panel-header">
            <strong>Basic Strategy Tip</strong>
            <button className="btn-icon tip-close" onClick={() => setPlayTipOpen(false)} aria-label="Close tip"><X size={14} /></button>
          </div>
          {!hasActivePlayableHand ? (
            <p>Place a bet and deal a hand first. Then Tip will show the best Basic Strategy play for your current hand.</p>
          ) : !dealerUpcard ? (
            <p>Tip available once the dealer upcard is shown.</p>
          ) : activePlayHand!.cards.length < 2 ? (
            <p>Tip available once the dealer upcard is shown.</p>
          ) : tipMove ? (
            <p>Against dealer {dealerUpcardLabel(dealerUpcard)}, play: <b>{formatMove(tipMove)}</b>.</p>
          ) : (
            <p>Place a bet and deal a hand first. Then Tip will show the best Basic Strategy play for your current hand.</p>
          )}
        </div>
      )}

      {showBasicDrillTip && currentHand && (
        <div className="tip-panel tip-panel-drill">
          <div className="tip-panel-header">
            <strong>Basic Strategy Tip</strong>
            <button className="btn-icon tip-close" onClick={() => setBasicDrillTipOpen(false)} aria-label="Close tip"><X size={14} /></button>
          </div>
          {basicDrillTipMove ? (
            <p>Against dealer {currentHand.dealer}, play: <b>{formatMove(basicDrillTipMove)}</b>.</p>
          ) : (
            <p>Review the strategy card for this spot.</p>
          )}
        </div>
      )}

      {countHowItWorksOpen && (
        <OverlaySheet title="How It Works" eyebrow="Card Counting Academy" description="Hi-Lo card values and count mechanics." onClose={() => setCountHowItWorksOpen(false)}>
          <div className="lesson-stack">
            <div className="lesson-card plus"><strong>Low cards leaving = good</strong><span>2 • 3 • 4 • 5 • 6</span><em>+1</em><p>When low cards leave the shoe, more high cards remain — shifting the edge toward the player.</p></div>
            <div className="lesson-card neutral"><strong>Middle cards = neutral</strong><span>7 • 8 • 9</span><em>0</em><p>Middle cards do not significantly change the count or player advantage.</p></div>
            <div className="lesson-card minus"><strong>High cards leaving = bad</strong><span>10 • J • Q • K • A</span><em>-1</em><p>When high cards leave, fewer blackjacks and strong doubles remain for the player.</p></div>
          </div>
          <div className="action-plan">
            <p><strong>Running count:</strong> The live Hi-Lo total as each card is seen. Add +1 for low cards, subtract -1 for high cards, and ignore middle cards.</p>
            <p><strong>True count:</strong> Running count divided by estimated decks remaining. This normalizes the count for bet sizing and strategy decisions.</p>
            <p><strong>Deck estimation:</strong> Divide cards remaining in the shoe by 52 to estimate how many decks are left. Use this to convert running count into true count.</p>
          </div>
        </OverlaySheet>
      )}

      {drillExitOpen && (
        <div className="overlay overlay-center" onClick={() => setDrillExitOpen(null)}>
          <div className="dialog-card glass-panel glass-panel-gold" onClick={(e) => e.stopPropagation()}>
            <span className="eyebrow">Exit Drill</span>
            <h2>Leave this drill?</h2>
            <p className="text-muted">Choose where to return.</p>
            <div className="dialog-actions drill-exit-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setDrillExitOpen(null);
                  setBasicDrillTipOpen(false);
                  setScreen(drillExitOpen === "basic" ? "basic" : "countLearn");
                }}
              >
                {drillExitOpen === "basic" ? "Basic Strategy Academy" : "Card Counting Academy"}
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  setDrillExitOpen(null);
                  setBasicDrillTipOpen(false);
                  setScreen("trainer");
                }}
              >
                Trainer
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
