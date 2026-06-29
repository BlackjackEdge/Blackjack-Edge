"use client";

import { useEffect, useState } from "react";
import { Brain, ChevronLeft, ChevronRight, Clock, RotateCcw, Sparkles, PlayCircle } from "lucide-react";
import {
  buildShoe,
  generateTrainingHand,
  handLabel,
  hiLo,
  moveNames,
  type Move,
  type TrainingHand,
  handValue,
  isBust,
  isBlackjack,
  isPair,
  shouldDealerHit,
} from "@/lib/blackjack";
import { Coach, Logo, PlayingCard, StrategyCardOverlay } from "@/components/ui";

type Screen =
  | "home"
  | "basic"
  | "basicDrill"
  | "basicResults"
  | "counting"
  | "countLearn"
  | "countDrill"
  | "play";

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
  const [bankroll, setBankroll] = useState(500);
  const [bet, setBet] = useState(5);
  const [dealerHand, setDealerHand] = useState<string[]>([]);
  const [playerHands, setPlayerHands] = useState<PlayerHand[]>([]);
  const [activeHand, setActiveHand] = useState(0);
  const [playPhase, setPlayPhase] = useState<PlayPhase>("betting");
  const [playMessage, setPlayMessage] = useState("Choose your bet and deal.");

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
    let working = shoeList.length < 52 ? buildShoe(playDecks) : [...shoeList];
    const drawn: string[] = [];
    for (let i = 0; i < count; i++) {
      if (!working.length) working = buildShoe(playDecks);
      drawn.push(working.pop()!);
    }
    return { drawn, nextShoe: working };
  }

  function openPlay() {
    setScreen("play");
    if (!playShoe.length) setPlayShoe(buildShoe(playDecks));
  }

  function changeBet(amount: number) {
    if (playPhase !== "betting" && playPhase !== "roundOver") return;
    const nextBet = Math.max(5, Math.min(bankroll, bet + amount));
    setBet(nextBet);
  }

  function dealBlackjack() {
    if (bankroll < bet) {
      setPlayMessage("Bankroll is too low for that bet.");
      return;
    }

    const { drawn, nextShoe } = drawFromPlayShoe(playShoe, 4);
    const player = [drawn[0], drawn[2]];
    const dealer = [drawn[1], drawn[3]];

    setPlayShoe(nextShoe);
    setBankroll((b) => b - bet);
    setDealerHand(dealer);
    setPlayerHands([{ cards: player, bet }]);
    setActiveHand(0);

    const playerBJ = isBlackjack(player);
    const dealerBJ = isBlackjack(dealer);

    if (playerBJ || dealerBJ) {
      let payout = 0;
      let result = "";

      if (playerBJ && dealerBJ) {
        payout = bet;
        result = "Push. Both blackjack.";
      } else if (playerBJ) {
        payout = bet + bet * 1.5;
        result = "Blackjack pays 3:2.";
      } else {
        payout = 0;
        result = "Dealer blackjack.";
      }

      setBankroll((b) => b + payout);
      setPlayerHands([{ cards: player, bet, result, payout }]);
      setPlayPhase("roundOver");
      setPlayMessage(result);
      return;
    }

    setPlayPhase("player");
    setPlayMessage("Your move.");
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

    if (isBust(hand.cards)) {
      hand.busted = true;
      hand.stood = true;
      hand.result = "Bust";
      setPlayMessage("Bust. Moving to next hand.");
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
    if (playPhase !== "player") return;

    const hand = playerHands[activeHand];
    if (hand.cards.length !== 2) {
      setPlayMessage("Double is only available on your first two cards.");
      return;
    }
    if (bankroll < hand.bet) {
      setPlayMessage("Not enough bankroll to double.");
      return;
    }

    const { drawn, nextShoe } = drawFromPlayShoe(playShoe, 1);
    const updated = [...playerHands];
    updated[activeHand] = {
      ...hand,
      cards: [...hand.cards, drawn[0]],
      bet: hand.bet * 2,
      doubled: true,
      stood: true,
    };

    if (isBust(updated[activeHand].cards)) {
      updated[activeHand].busted = true;
      updated[activeHand].result = "Bust";
    }

    setBankroll((b) => b - hand.bet);
    setPlayShoe(nextShoe);
    finishHand(updated);
  }

  function splitPlayHand() {
    if (playPhase !== "player") return;

    const hand = playerHands[activeHand];
    if (!isPair(hand.cards)) {
      setPlayMessage("You can only split matching pairs.");
      return;
    }
    if (bankroll < hand.bet) {
      setPlayMessage("Not enough bankroll to split.");
      return;
    }

    const { drawn, nextShoe } = drawFromPlayShoe(playShoe, 2);
    const first: PlayerHand = { cards: [hand.cards[0], drawn[0]], bet: hand.bet };
    const second: PlayerHand = { cards: [hand.cards[1], drawn[1]], bet: hand.bet };
    const updated = [...playerHands];
    updated.splice(activeHand, 1, first, second);

    setBankroll((b) => b - hand.bet);
    setPlayShoe(nextShoe);
    setPlayerHands(updated);
    setPlayMessage("Split. Playing first hand.");
  }

  function runDealerAndSettle(hands: PlayerHand[]) {
    setPlayPhase("dealer");

    let dealer = [...dealerHand];
    let workingShoe = [...playShoe];

    const anyLiveHand = hands.some((h) => !isBust(h.cards));
    if (anyLiveHand) {
      while (shouldDealerHit(dealer, true)) {
        const draw = drawFromPlayShoe(workingShoe, 1);
        dealer = [...dealer, draw.drawn[0]];
        workingShoe = draw.nextShoe;
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
        payout = 0;
      } else if (dealerBust) {
        result = "Win";
        payout = hand.bet * 2;
      } else if (playerTotal > dealerTotal) {
        result = "Win";
        payout = hand.bet * 2;
      } else if (playerTotal < dealerTotal) {
        result = "Lose";
        payout = 0;
      } else {
        result = "Push";
        payout = hand.bet;
      }

      totalReturn += payout;
      return { ...hand, result, payout };
    });

    setDealerHand(dealer);
    setPlayShoe(workingShoe);
    setPlayerHands(settled);
    setBankroll((b) => b + totalReturn);
    setPlayPhase("roundOver");

    const net = totalReturn - hands.reduce((sum, h) => sum + h.bet, 0);
    setPlayMessage(net > 0 ? `You won $${net}.` : net < 0 ? `You lost $${Math.abs(net)}.` : "Push round.");
  }

  const activePlayHand = playerHands[activeHand];
  const canAct = playPhase === "player" && activePlayHand && !activePlayHand.stood && !activePlayHand.busted;
  const canSplit = canAct && isPair(activePlayHand.cards) && bankroll >= activePlayHand.bet;
  const canDouble = canAct && activePlayHand.cards.length === 2 && bankroll >= activePlayHand.bet;

  return (
    <main className="app">
      <div className="bg" />

      <header className="top">
        <button onClick={() => setScreen("home")} className="brand">
          <span className="brand-spade">♠</span>
          Blackjack Edge
        </button>

        {screen.startsWith("basic") && (
          <button onClick={() => setStrategyOpen(true)} className="small-btn">
            Strategy Card
          </button>
        )}
      </header>

      {screen === "home" && (
        <section className="home">
          <div className="hero-frame">
            <Logo />
            <span className="eyebrow">Private table training</span>
            <h1>Master the Game.</h1>
            <p>Perfect basic strategy. Train the count. Then sit down and play the shoe.</p>
          </div>

          <div className="home-actions home-actions-three">
            <button onClick={() => setScreen("basic")} className="big-card">
              <Sparkles />
              <strong>Basic Strategy</strong>
              <span>Train perfect decisions and reference the full strategy card anytime.</span>
            </button>

            <button onClick={() => setScreen("counting")} className="big-card">
              <Brain />
              <strong>Card Counting</strong>
              <span>Learn Hi-Lo and build one-card recognition speed.</span>
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
              <button key={n} className={roundSize === n ? "selected" : ""} onClick={() => setRoundSize(n)}>
                {n} hands
              </button>
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
                {currentHand.player.map((c, i) => (
                  <PlayingCard key={`${c}-${i}`} value={c} />
                ))}
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
              <button key={n} className={countCards === n ? "selected" : ""} onClick={() => setCountCards(n)}>
                {n} cards
              </button>
            ))}
          </div>

          <label className="toggle">
            <input type="checkbox" checked={guided} onChange={(e) => setGuided(e.target.checked)} /> Guided mode: show running count
          </label>
        </section>
      )}

      {screen === "countLearn" && (
        <section className="panel">
          <span className="eyebrow">Counting Basics</span>
          <h1>You are not memorizing cards.</h1>
          <p className="text">You're tracking whether the remaining shoe is becoming better or worse for the player.</p>

          <div className="count-guide"><strong>2-6</strong><span>+1</span><p>Low cards leaving the shoe are good for the player.</p></div>
          <div className="count-guide"><strong>7-9</strong><span>0</span><p>Neutral cards.</p></div>
          <div className="count-guide"><strong>10-A</strong><span>-1</span><p>High cards leaving the shoe lower the count.</p></div>

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
        <section className="drill">
          <div className="play-hud">
            <div><strong>${bankroll.toFixed(0)}</strong><span>Bankroll</span></div>
            <div><strong>${bet}</strong><span>Bet</span></div>
            <div><strong>{playShoe.length}</strong><span>Cards left</span></div>
          </div>

          <div className="play-controls-top">
            <div className="selector deck-selector">
              {[1, 2, 6, 8].map((n) => (
                <button
                  key={n}
                  className={playDecks === n ? "selected" : ""}
                  onClick={() => {
                    if (playPhase === "betting" || playPhase === "roundOver") {
                      setPlayDecks(n);
                      setPlayShoe(buildShoe(n));
                      setPlayMessage(`${n}-deck shoe loaded.`);
                    }
                  }}
                >
                  {n}D
                </button>
              ))}
            </div>
          </div>

          <div className="table play-table">
            <div className="dealer-zone">
              <span>Dealer</span>
              <div className="cards">
                {dealerHand.map((card, i) => (
                  <PlayingCard key={`${card}-${i}`} value={card} />
                ))}
              </div>
              <h2>{dealerHand.length ? handValue(dealerHand).total : ""}</h2>
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
                )) : <p>No hand dealt yet.</p>}
              </div>
            </div>
          </div>

          {(playPhase === "betting" || playPhase === "roundOver") && (
            <div className="bet-panel">
              <button className="secondary" onClick={() => changeBet(-5)}>- $5</button>
              <button className="secondary" onClick={() => changeBet(5)}>+ $5</button>
              <button className="secondary" onClick={() => changeBet(25)}>+ $25</button>
              <button className="primary" onClick={dealBlackjack}>Deal</button>
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

          <Coach>{playMessage}</Coach>
        </section>
      )}

      {strategyOpen && <StrategyCardOverlay onClose={() => setStrategyOpen(false)} />}
    </main>
  );
}
