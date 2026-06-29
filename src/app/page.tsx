"use client";

import { useEffect, useMemo, useState } from "react";
import { Brain, ChevronLeft, ChevronRight, Clock, RotateCcw, Sparkles, PlayCircle, Lightbulb, Gauge, Settings2 } from "lucide-react";
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
  doubled?: boolean;
  stood?: boolean;
  busted?: boolean;
  result?: string;
  payout?: number;
};

type PlayPhase = "betting" | "player" | "dealer" | "roundOver";

const avg = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const swipeValue = (card: string): SwipeValue => hiLo(card) === 1 ? 1 : hiLo(card) === -1 ? -1 : 0;
const chipValues = [5, 25, 50, 100, 250];

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [now, setNow] = useState(Date.now());
  const [strategyOpen, setStrategyOpen] = useState(false);

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
  const [dealerHand, setDealerHand] = useState<string[]>([]);
  const [playerHands, setPlayerHands] = useState<PlayerHand[]>([]);
  const [activeHand, setActiveHand] = useState(0);
  const [playPhase, setPlayPhase] = useState<PlayPhase>("betting");
  const [playMessage, setPlayMessage] = useState("Place your chips and deal.");
  const [hudOpen, setHudOpen] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);

  useEffect(() => {
    const i = window.setInterval(() => setNow(Date.now()), 50);
    return () => window.clearInterval(i);
  }, []);

  const elapsed = start ? (now - start) / 1000 : 0;
  const accuracy = handIndex ? Math.round((correct / handIndex) * 100) : 0;
  const avgTime = avg(results.map((r) => r.seconds));
  const finalRunning = dealt.reduce((sum, c) => sum + hiLo(c), 0);
  const decksRemaining = Math.max(shoe.length / 52, 0.1);
  const finalTrue = finalRunning / decksRemaining;

  const playRunning = seenCards.reduce((sum, c) => sum + hiLo(c), 0);
  const playDecksRemaining = Math.max(playShoe.length / 52, 0.1);
  const playTrue = playRunning / playDecksRemaining;
  const penetration = Math.round(((playDecks * 52 - playShoe.length) / (playDecks * 52)) * 100);

  const activePlayHand = playerHands[activeHand];
  const dealerUpcard = dealerHand[0];
  const canAct = Boolean(playPhase === "player" && activePlayHand && !activePlayHand.stood && !activePlayHand.busted);
  const canSplit = Boolean(canAct && activePlayHand && isPair(activePlayHand.cards) && bankroll >= activePlayHand.bet);
  const canDouble = Boolean(canAct && activePlayHand && activePlayHand.cards.length === 2 && bankroll >= activePlayHand.bet);
  const tipMove = activePlayHand && dealerUpcard && activePlayHand.cards.length >= 2 ? correctAction(activePlayHand.cards, dealerUpcard) : null;

  useEffect(() => {
    if (!playShoe.length) setPlayShoe(buildShoe(playDecks));
  }, []);

  function startBasic() {
    setResults([]);
    setHandIndex(0);
    setCorrect(0);
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
    const fresh = buildShoe(6);
    const { nextCard, nextShoe } = getNextDifferentCard(null, fresh);
    setShoe(nextShoe);
    setCountCard(nextCard);
    setDealt([]);
    setCountCorrect(0);
    setSwipeTimes([]);
    setRunningGuess("");
    setTrueGuess("");
    setCardStart(Date.now());
    setCountFeedback(guided ? "Guided mode: running count shows as you go." : "Hidden mode: keep the running count in your head.");
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

  function addChip(amount: number) {
    if (playPhase !== "betting" && playPhase !== "roundOver") return;
    setBet((current) => Math.max(0, Math.min(5000, Math.min(bankroll, current + amount))));
  }

  function clearBet() {
    if (playPhase !== "betting" && playPhase !== "roundOver") return;
    setBet(0);
  }

  function resetShoe(decks = playDecks) {
    setPlayShoe(buildShoe(decks));
    setSeenCards([]);
    setPlayMessage(`${decks}-deck shoe loaded.`);
  }

  function dealBlackjack() {
    if (bet < 5) {
      setPlayMessage("Minimum bet is $5. Tap a chip to place your bet.");
      return;
    }

    if (bet > 5000) {
      setPlayMessage("Maximum bet is $5,000.");
      return;
    }

    if (bankroll < bet) {
      setPlayMessage("Bankroll is too low for that bet.");
      return;
    }

    const { drawn, nextShoe } = drawFromPlayShoe(playShoe, 4);
    const player = [drawn[0], drawn[2]];
    const dealer = [drawn[1], drawn[3]];
    const visibleNow = [drawn[0], drawn[2], drawn[1]];

    setTipOpen(false);
    setHudOpen(false);
    setActiveHand(0);
    setPlayShoe(nextShoe);
    setSeenCards((prev) => [...prev, ...visibleNow]);
    setBankroll((b) => b - bet);
    setDealerHand(dealer);
    setPlayerHands([{ cards: player, bet }]);
    setActiveHand(0);

    const playerBJ = isBlackjack(player);
    const dealerBJ = isBlackjack(dealer);

    if (playerBJ || dealerBJ) {
      const reveal = dealer[1];
      setSeenCards((prev) => [...prev, reveal]);

      let payout = 0;
      let result = "";

      if (playerBJ && dealerBJ) {
        payout = bet;
        result = "Push. Both you and the dealer have blackjack.";
      } else if (playerBJ) {
        payout = bet + bet * 1.5;
        result = "Blackjack. Paid 3:2.";
      } else {
        payout = 0;
        result = "Dealer blackjack. Hand over.";
      }

      setBankroll((b) => b + payout);
      setPlayerHands([{ cards: player, bet, result, payout }]);
      setPlayPhase("roundOver");
      setPlayMessage(result);
      return;
    }

    setPlayPhase("player");
    setPlayMessage("Dealer has a hole card. Your move.");
  }

  function finishHand(updatedHands: PlayerHand[], nextIndex = activeHand + 1) {
    if (nextIndex < updatedHands.length) {
      setPlayerHands(updatedHands);
      setActiveHand(nextIndex);
      setPlayMessage(`Playing hand ${nextIndex + 1} of ${updatedHands.length}.`);
      return;
    }

    runDealerAndSettle(updatedHands);
  }

  function hitPlayHand() {
    if (playPhase !== "player") return;

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
    const updated = playerHands.map((h, i) => i === activeHand ? { ...h, stood: true } : h);
    finishHand(updated);
  }

  function doublePlayHand() {
    if (playPhase !== "player" || !activePlayHand) return;

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

    if (!isPair(activePlayHand.cards)) {
      setPlayMessage("You can only split matching pairs.");
      return;
    }

    if (bankroll < activePlayHand.bet) {
      setPlayMessage("Not enough bankroll to split.");
      return;
    }

    const { drawn, nextShoe } = drawFromPlayShoe(playShoe, 2);
    const first: PlayerHand = { cards: [activePlayHand.cards[0], drawn[0]], bet: activePlayHand.bet };
    const second: PlayerHand = { cards: [activePlayHand.cards[1], drawn[1]], bet: activePlayHand.bet };
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
    setPlayMessage(net > 0 ? `You won $${net}.` : net < 0 ? `You lost $${Math.abs(net)}.` : "Push round.");
  }

  const dealerVisibleHand = playPhase === "player" && dealerHand.length > 1 ? [dealerHand[0]] : dealerHand;

  return (
    <main className="app">
      <div className="bg" />

      <header className="top">
        <button onClick={() => setScreen("home")} className="brand brand-with-logo">
          <Logo compact />
          <span>Blackjack Edge</span>
        </button>

        {screen.startsWith("basic") && (
          <button onClick={() => setStrategyOpen(true)} className="small-btn">Strategy Card</button>
        )}

        {screen === "play" && (
          <button onClick={() => setHudOpen(true)} className="small-btn"><Gauge size={16} /> HUD</button>
        )}
      </header>

      {screen === "home" && (
        <section className="home compact-home">
          <div className="home-title-block">
            <span className="eyebrow">Blackjack Edge</span>
            <h1>Master the Game.</h1>
            <p>Perfect strategy, professional card counting, and live shoe practice in one premium trainer.</p>
          </div>

          <div className="home-actions home-actions-three">
            <button onClick={() => setScreen("basic")} className="big-card">
              <Sparkles />
              <strong>Basic Strategy</strong>
              <span>Train perfect decisions and reference the strategy card anytime.</span>
            </button>

            <button onClick={() => setScreen("counting")} className="big-card">
              <Brain />
              <strong>Card Counting</strong>
              <span>Learn Hi-Lo, then build one-card recognition speed.</span>
            </button>

            <button onClick={openPlay} className="big-card play-card">
              <PlayCircle />
              <strong>Play Blackjack</strong>
              <span>6-deck shoe, H17, 3:2 blackjack, betting, double, and split.</span>
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

          <Coach>Strategy Card is one tap away while drilling.</Coach>
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

          <Coach>{feedback}</Coach>
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
            <p>• Review soft hands and pairs inside the Strategy Card.</p>
            <p>• Next upgrade will track your exact weakest hands automatically.</p>
          </div>

          <button className="primary" onClick={startBasic}><RotateCcw size={18} /> Run Again</button>
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

          <label className="toggle">
            <input type="checkbox" checked={guided} onChange={(e) => setGuided(e.target.checked)} /> Guided mode: show running count
          </label>
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

          {guided && <div className="running">Running Count: <strong>{finalRunning >= 0 ? "+" : ""}{finalRunning}</strong></div>}

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
            <div className="panel compact">
              <h2>Final count</h2>
              <p>Decks remaining: {decksRemaining.toFixed(1)}</p>
              <input placeholder="Running count" value={runningGuess} onChange={(e) => setRunningGuess(e.target.value)} />
              <input placeholder="True count" value={trueGuess} onChange={(e) => setTrueGuess(e.target.value)} />
              <Coach>Actual running count: {finalRunning >= 0 ? "+" : ""}{finalRunning}. Actual true count: {finalTrue.toFixed(1)}.</Coach>
            </div>
          )}

          <Coach>{countFeedback}</Coach>
        </section>
      )}

      {screen === "play" && (
        <section className="drill play-screen">
          <div className="play-hud">
            <div><strong>${bankroll.toFixed(0)}</strong><span>Bankroll</span></div>
            <div><strong>${bet}</strong><span>Bet</span></div>
            <div><strong>{playShoe.length}</strong><span>Cards left</span></div>
          </div>

          <div className="table play-table">
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
              <h2>{dealerHand.length ? (playPhase === "player" ? handValue([dealerHand[0]]).total : handValue(dealerHand).total) : ""}</h2>
            </div>

            <div className="player-zone">
              <span>Your hands</span>
              <div className="split-hands">
                {playerHands.length ? playerHands.map((hand, index) => (
                  <div key={index} className={index === activeHand && playPhase === "player" ? "split-hand active" : "split-hand"}>
                    <small>Hand {index + 1} • ${hand.bet}</small>
                    <div className="cards">
                      {hand.cards.map((card, i) => <PlayingCard key={`${card}-${i}`} value={card} />)}
                    </div>
                    <strong>{handValue(hand.cards).total}</strong>
                    {hand.result && <em>{hand.result}</em>}
                  </div>
                )) : (
                  <div className="bet-circle">
                    <span>Bet</span>
                    <strong>${bet}</strong>
                  </div>
                )}
              </div>
            </div>
          </div>

          {(playPhase === "betting" || playPhase === "roundOver") && (
            <div className="chip-tray">
              {chipValues.map((chip) => (
                <button key={chip} className={`chip chip-${chip}`} onClick={() => addChip(chip)}>${chip}</button>
              ))}
              <button className="secondary" onClick={clearBet}>Clear</button>
              <button className="secondary" onClick={() => setBankroll((b) => b + 500)}>Add $500</button>
              <button className="secondary" onClick={() => { setBankroll(1000); setBet(0); }}>Reset</button>
              <button className="primary deal-button" onClick={dealBlackjack}>Deal</button>
            </div>
          )}

          {canAct && (
            <div className="play-actions">
              <button className="move H" onClick={hitPlayHand}>Hit</button>
              <button className="move S" onClick={standPlayHand}>Stand</button>
              <button className="move D" disabled={!canDouble} onClick={doublePlayHand}>Double</button>
              <button className="move P" disabled={!canSplit} onClick={splitPlayHand}>Split</button>
            </div>
          )}

          <div className="play-bottom-bar">
            <button onClick={() => setTipOpen((v) => !v)} className="tip-button"><Lightbulb size={18} /> Tip</button>
            <button onClick={() => setHudOpen(true)} className="tip-button"><Settings2 size={18} /> Training HUD</button>
          </div>

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

          <Coach>{playMessage}</Coach>
        </section>
      )}

      {hudOpen && (
        <div className="overlay">
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

            <button className="primary" onClick={() => resetShoe(playDecks)}>Shuffle New Shoe</button>
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
