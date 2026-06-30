import React, { useState } from "react";
import { HelpCircle, X } from "lucide-react";
import {
  cardRank,
  cardSuit,
  dealerRanks,
  hardChart,
  hardRows,
  moveNames,
  pairChart,
  pairRows,
  softChart,
  softRows,
  type Move,
} from "@/lib/blackjack";

type StrategyTab = "hard" | "soft" | "pairs";

function premiumSuitMeta(suit: string) {
  if (suit === "♥") return { symbol: "♥", red: true };
  if (suit === "♦") return { symbol: "♦", red: true };
  if (suit === "♣") return { symbol: "♣", red: false };
  return { symbol: "♠", red: false };
}

const premiumPipRows: Record<string, number[]> = {
  A: [1],
  "2": [1, 1],
  "3": [1, 1, 1],
  "4": [2, 2],
  "5": [2, 1, 2],
  "6": [2, 2, 2],
  "7": [2, 1, 2, 2],
  "8": [2, 2, 2, 2],
  "9": [2, 2, 1, 2, 2],
  "10": [2, 2, 2, 2, 2],
};

function PremiumCorner({
  rank,
  suit,
  red,
  flipped = false,
}: {
  rank: string;
  suit: string;
  red: boolean;
  flipped?: boolean;
}) {
  return (
    <div className={`premium-corner-mark ${flipped ? "flipped" : ""}`}>
      <strong>{rank}</strong>
      <span className={red ? "red" : "black"}>{suit}</span>
    </div>
  );
}

function PremiumCardCenter({
  rank,
  suit,
  red,
}: {
  rank: string;
  suit: string;
  red: boolean;
}) {
  if (rank === "A") {
    return (
      <div className="premium-card-center ace-center">
        <span className={red ? "red" : "black"}>{suit}</span>
      </div>
    );
  }

  if (["J", "Q", "K"].includes(rank)) {
    return (
      <div className="premium-card-center face-center">
        <div className={`premium-face-badge ${red ? "red" : "black"}`}>
          <em>BLACKJACK EDGE</em>
          <strong>{rank}</strong>
          <span>{suit}</span>
        </div>
      </div>
    );
  }

  const rows = premiumPipRows[rank] ?? [1];

  return (
    <div className="premium-pip-grid">
      {rows.map((count, rowIndex) => (
        <div key={`${rank}-${rowIndex}`} className={`premium-pip-row count-${count}`}>
          {Array.from({ length: count }).map((_, pipIndex) => (
            <span key={`${rank}-${rowIndex}-${pipIndex}`} className={red ? "red" : "black"}>
              {suit}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

export function PlayingCard({
  value,
  mini = false,
  faceDown = false,
}: {
  value: string;
  mini?: boolean;
  faceDown?: boolean;
}) {
  if (faceDown) {
    return (
      <div className={`${mini ? "mini-card" : "playing-card"} premium-live-card premium-card-back`}>
        <div className="premium-card-shell">
          <div className="premium-card-back-inner">
            <img src="/blackjack-edge-logo.jpg" alt="" />
          </div>
        </div>
      </div>
    );
  }

  const rank = cardRank(value);
  const suit = cardSuit(value);
  const meta = premiumSuitMeta(suit);

  return (
    <div className={`${mini ? "mini-card" : "playing-card"} premium-live-card ${meta.red ? "premium-red-card" : "premium-black-card"}`}>
      <div className="premium-card-shell">
        <PremiumCorner rank={rank} suit={meta.symbol} red={meta.red} />
        <PremiumCardCenter rank={rank} suit={meta.symbol} red={meta.red} />
        <PremiumCorner rank={rank} suit={meta.symbol} red={meta.red} flipped />
      </div>
    </div>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "brand-logo compact-logo" : "brand-logo"}>
      <img src="/blackjack-edge-logo.jpg" alt="Blackjack Edge logo" />
    </div>
  );
}

export function Coach({ children }: { children: React.ReactNode }) {
  return (
    <div className="coach">
      <div className="coach-chip">♠</div>
      <p>{children}</p>
    </div>
  );
}

export function StrategyCardOverlay({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<StrategyTab>("hard");

  const active =
    tab === "hard"
      ? { title: "Hard Totals", rows: hardRows, chart: hardChart }
      : tab === "soft"
        ? { title: "Soft Totals", rows: softRows, chart: softChart }
        : { title: "Pairs", rows: pairRows, chart: pairChart };

  return (
    <div className="overlay">
      <div className="strategy-sheet luxury-strategy-card">
        <div className="sheet-header luxury-sheet-header">
          <div>
            <span className="eyebrow">Blackjack Edge Reference</span>
            <h2>Basic Strategy Card</h2>
            <p>6-deck • 3:2 • H17 • DAS • Late Surrender</p>
          </div>

          <button className="icon-button" onClick={onClose} aria-label="Close strategy card">
            <X />
          </button>
        </div>

        <div className="strategy-tabs">
          <button className={tab === "hard" ? "active" : ""} onClick={() => setTab("hard")}>Hard</button>
          <button className={tab === "soft" ? "active" : ""} onClick={() => setTab("soft")}>Soft</button>
          <button className={tab === "pairs" ? "active" : ""} onClick={() => setTab("pairs")}>Pairs</button>
        </div>

        <div className="strategy-legend">
          <span className="legend-pill H">H Hit</span>
          <span className="legend-pill S">S Stand</span>
          <span className="legend-pill D">D Double</span>
          <span className="legend-pill P">P Split</span>
          <span className="legend-pill R">R Surrender</span>
        </div>

        <StrategyMatrix title={active.title} rows={active.rows} chart={active.chart} />
      </div>
    </div>
  );
}

function StrategyMatrix({
  title,
  rows,
  chart,
}: {
  title: string;
  rows: string[];
  chart: Record<string, Move[]>;
}) {
  return (
    <div className="premium-matrix-card">
      <div className="premium-matrix-title">
        <span>{title}</span>
        <small>Dealer up card</small>
      </div>

      <div className="premium-matrix">
        <div className="premium-head player-hand-label">You</div>

        {dealerRanks.map((dealer) => (
          <div key={dealer} className="premium-head dealer-card">
            {dealer}
          </div>
        ))}

        {rows.map((row) => (
          <React.Fragment key={row}>
            <div className="premium-row-label">{row}</div>

            {chart[row].map((move, index) => (
              <div
                key={`${row}-${index}`}
                className={`premium-cell ${move}`}
                title={moveNames[move]}
              >
                {move}
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
