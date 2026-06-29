"use client";

import { useEffect, useState } from "react";
import { Brain, ChevronLeft, ChevronRight, Clock, RotateCcw, Sparkles } from "lucide-react";
import {
  buildShoe,
  generateTrainingHand,
  handLabel,
  hiLo,
  moveNames,
  type Move,
  type TrainingHand
} from "@/lib/blackjack";
import { Coach, Logo, PlayingCard, StrategyCardOverlay } from "@/components/ui";

type Screen = "home" | "basic" | "basicDrill" | "basicResults" | "counting" | "countLearn" | "countDrill";
type HandResult = { hand: TrainingHand; choice: Move; seconds: number };
type SwipeValue = -1 | 0 | 1;

const avg = (values: number[]) => values.length ? values.reduce((a,b)=>a+b,0) / values.length : 0;
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
  const [feedback, setFeedback] = useState("Pick the correct play.");

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
  const [countFeedback, setCountFeedback] = useState("Swipe/tap: left -1, up 0, right +1.");

  useEffect(() => {
    const i = window.setInterval(() => setNow(Date.now()), 50);
    return () => window.clearInterval(i);
  }, []);

  const elapsed = start ? (now - start) / 1000 : 0;
  const accuracy = handIndex ? Math.round((correct / handIndex) * 100) : 0;
  const avgTime = avg(results.map(r => r.seconds));
  const finalRunning = dealt.reduce((sum, c) => sum + hiLo(c), 0);
  const decksRemaining = Math.max(shoe.length / 52, 0.1);
  const finalTrue = finalRunning / decksRemaining;

  function startBasic() {
    setResults([]);
    setHandIndex(0);
    setCorrect(0);
    setFeedback("Pick the correct play.");
    setCurrentHand(generateTrainingHand());
    setStart(Date.now());
    setScreen("basicDrill");
  }

  function chooseMove(move: Move) {
    if (!currentHand) return;
    const seconds = (Date.now() - start) / 1000;
    const ok = move === currentHand.answer;
    setResults(prev => [...prev, { hand: currentHand, choice: move, seconds }]);
    setCorrect(prev => prev + (ok ? 1 : 0));
    setFeedback(ok ? `Correct: ${moveNames[move]}` : `Wrong. Correct play: ${moveNames[currentHand.answer]}`);
    const next = handIndex + 1;
    setHandIndex(next);

    window.setTimeout(() => {
      if (next >= roundSize) setScreen("basicResults");
      else {
        setCurrentHand(generateTrainingHand());
        setStart(Date.now());
        setFeedback("Next hand.");
      }
    }, ok ? 600 : 1100);
  }

  function startCounting() {
    const fresh = buildShoe(6);
    const first = fresh.pop()!;
    setShoe(fresh);
    setCountCard(first);
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
    setSwipeTimes(prev => [...prev, ms]);
    if (expected === value) setCountCorrect(prev => prev + 1);
    setCountFeedback(expected === value ? `Correct: ${countCard} is ${expected}.` : `Careful: ${countCard} is ${expected}.`);

    if (nextDealt.length >= countCards || shoe.length === 0) {
      setCountCard(null);
      return;
    }

    const nextShoe = [...shoe];
    const nextCard = nextShoe.pop()!;
    window.setTimeout(() => {
      setShoe(nextShoe);
      setCountCard(nextCard);
      setCardStart(Date.now());
    }, 250);
  }

  return (
    <main className="app">
      <div className="bg" />

      <header className="top">
        <button onClick={() => setScreen("home")} className="brand">♠ Blackjack Edge</button>
        {screen.startsWith("basic") && <button onClick={() => setStrategyOpen(true)} className="small-btn">Strategy Card</button>}
      </header>

      {screen === "home" && (
        <section className="home">
          <Logo />
          <h1>Blackjack Edge</h1>
          <p>Master basic strategy and card counting. Simple first. Powerful later.</p>
          <div className="home-actions">
            <button onClick={() => setScreen("basic")} className="big-card">
              <Sparkles />
              <strong>Basic Strategy</strong>
              <span>Drill every hand and reference the full strategy card.</span>
            </button>
            <button onClick={() => setScreen("counting")} className="big-card">
              <Brain />
              <strong>Card Counting</strong>
              <span>Learn Hi-Lo and practice one-card swipe recognition.</span>
            </button>
          </div>
        </section>
      )}

      {screen === "basic" && (
        <section className="panel">
          <span className="eyebrow">Basic Strategy</span>
          <h1>Learn the right play.</h1>
          <button className="primary" onClick={startBasic}>Start Drill</button>
          <button className="secondary" onClick={() => setStrategyOpen(true)}>Open Strategy Card</button>
          <div className="selector">
            {[10,25,50].map(n => <button key={n} className={roundSize === n ? "selected" : ""} onClick={() => setRoundSize(n)}>{n} hands</button>)}
          </div>
          <Coach>Strategy card is always available from the top-right while drilling.</Coach>
        </section>
      )}

      {screen === "basicDrill" && currentHand && (
        <section className="drill">
          <div className="stats">
            <div><strong>{Math.min(handIndex + 1, roundSize)}/{roundSize}</strong><span>Hand</span></div>
            <div><strong>{accuracy}%</strong><span>Accuracy</span></div>
            <div><strong>{avgTime.toFixed(2)}s</strong><span>Avg time</span></div>
          </div>
          <div className="table">
            <div><span>Dealer</span><PlayingCard value={currentHand.dealer} /></div>
            <div><span>Your hand</span><h2>{handLabel(currentHand)}</h2><div className="cards">{currentHand.player.map((c,i) => <PlayingCard key={`${c}-${i}`} value={c} />)}</div></div>
          </div>
          <div className="timer"><Clock size={18} /> {elapsed.toFixed(2)}s</div>
          <div className="moves">
            {(["H","S","D","P","R"] as Move[]).map(m => <button key={m} className={`move ${m}`} onClick={() => chooseMove(m)}>{moveNames[m]}<span>{m}</span></button>)}
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
            <p>• If accuracy is under 90%, run another 10-hand drill.</p>
            <p>• If you missed soft hands or pairs, open the Strategy Card and review those sections.</p>
            <p>• Next version will track your exact weakest hands automatically.</p>
          </div>
          <button className="primary" onClick={startBasic}><RotateCcw size={18} /> Run Again</button>
        </section>
      )}

      {screen === "counting" && (
        <section className="panel">
          <span className="eyebrow">Card Counting</span>
          <h1>Hi-Lo training.</h1>
          <button className="primary" onClick={() => setScreen("countLearn")}>Learn the Basics</button>
          <button className="secondary" onClick={startCounting}>Start Swipe Drill</button>
          <div className="selector">
            {[10,20,40,60].map(n => <button key={n} className={countCards === n ? "selected" : ""} onClick={() => setCountCards(n)}>{n} cards</button>)}
          </div>
          <label className="toggle"><input type="checkbox" checked={guided} onChange={e => setGuided(e.target.checked)} /> Guided mode: show running count</label>
        </section>
      )}

      {screen === "countLearn" && (
        <section className="panel">
          <span className="eyebrow">Counting basics</span>
          <h1>You are not memorizing cards.</h1>
          <p className="text">You're tracking whether the remaining shoe is better or worse for the player.</p>
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
              <input placeholder="Running count" value={runningGuess} onChange={e => setRunningGuess(e.target.value)} />
              <input placeholder="True count" value={trueGuess} onChange={e => setTrueGuess(e.target.value)} />
              <Coach>Actual running count: {finalRunning >= 0 ? "+" : ""}{finalRunning}. Actual true count: {finalTrue.toFixed(1)}.</Coach>
            </div>
          )}
          <Coach>{countFeedback}</Coach>
        </section>
      )}

      {strategyOpen && <StrategyCardOverlay onClose={() => setStrategyOpen(false)} />}
    </main>
  );
}
