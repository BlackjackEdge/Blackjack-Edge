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
      <div className={mini ? "mini-card card-back" : "playing-card card-back"}>
        <div className="card-back-inner">
          <img src="/blackjack-edge-logo.jpg" alt="" />
        </div>
      </div>
    );
  }

  const rank = cardRank(value);
  const suit = cardSuit(value);
  const red = suit === "♥" || suit === "♦";
  const pipCount = getPipCount(rank);
  const isFace = ["J", "Q", "K"].includes(rank);

  return (
    <div className={`${mini ? "mini-card" : "playing-card"} casino-card ${red ? "red-card" : ""}`}>
      <div className="card-corner top-left">
        <strong>{rank}</strong>
        <span>{suit}</span>
      </div>

      {isFace ? (
        <div className="royal-face-card">
          <div className="royal-row top">
            <span>{suit}</span>
            <em>{rank}</em>
            <span>{suit}</span>
          </div>
          <div className="royal-center">
            <span>{suit}</span>
            <strong>{rank}</strong>
            <span>{suit}</span>
          </div>
          <div className="royal-row bottom">
            <span>{suit}</span>
            <em>{rank}</em>
            <span>{suit}</span>
          </div>
        </div>
      ) : rank === "A" ? (
        <div className="ace-field">
          <span>{suit}</span>
        </div>
      ) : (
        <div className={`pip-layout pip-${pipCount}`}>
          {Array.from({ length: pipCount }).map((_, index) => (
            <span key={index}>{suit}</span>
          ))}
        </div>
      )}

      <div className="card-corner bottom-right">
        <strong>{rank}</strong>
        <span>{suit}</span>
      </div>
    </div>
  );
}

function getPipCount(rank: string) {
  if (rank === "A") return 1;
  if (["J", "Q", "K"].includes(rank)) return 0;
  return Number(rank) || 0;
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
