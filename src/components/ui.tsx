import React, { useState } from "react";
import { X } from "lucide-react";
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

type PipPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "upper-left"
  | "upper-center"
  | "upper-right"
  | "center-left"
  | "center"
  | "center-right"
  | "lower-left"
  | "lower-center"
  | "lower-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

const PIP_LAYOUTS: Record<string, PipPosition[]> = {
  A: ["center"],
  "2": ["top-center", "bottom-center"],
  "3": ["top-center", "center", "bottom-center"],
  "4": ["top-left", "top-right", "bottom-left", "bottom-right"],
  "5": ["top-left", "top-right", "center", "bottom-left", "bottom-right"],
  "6": ["top-left", "top-right", "center-left", "center-right", "bottom-left", "bottom-right"],
  "7": ["top-left", "top-right", "upper-center", "center-left", "center-right", "bottom-left", "bottom-right"],
  "8": ["top-left", "top-right", "upper-center", "center-left", "center-right", "lower-center", "bottom-left", "bottom-right"],
  "9": ["top-left", "top-right", "upper-center", "center-left", "center", "center-right", "lower-center", "bottom-left", "bottom-right"],
  "10": ["top-left", "top-right", "upper-left", "upper-right", "center-left", "center-right", "lower-left", "lower-right", "bottom-left", "bottom-right"],
};

const MIRRORED_POSITIONS = new Set<PipPosition>([
  "lower-left",
  "lower-center",
  "lower-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
]);

function suitClass(suit: string) {
  return suit === "♥" || suit === "♦" ? "suit-red" : "suit-black";
}

function isFaceRank(rank: string) {
  return rank === "J" || rank === "Q" || rank === "K";
}

function faceLabel(rank: string) {
  if (rank === "J") return "Jack";
  if (rank === "Q") return "Queen";
  if (rank === "K") return "King";
  return rank;
}

function renderPips(rank: string, suit: string) {
  const positions = PIP_LAYOUTS[rank] || [];
  return positions.map((position, index) => (
    <span
      key={`${rank}-${position}-${index}`}
      className={`luxury-pip ${position} ${MIRRORED_POSITIONS.has(position) ? "mirrored" : ""}`}
      aria-hidden="true"
    >
      {suit}
    </span>
  ));
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
      <div className={`${mini ? "mini-card" : "playing-card"} luxury-white-card luxury-card-back`}>
        <div className="luxury-card-inner">
          <div className="luxury-card-back-border" />
          <div className="luxury-card-back-core">
            <div className="luxury-card-back-ring" />
            <img src="/blackjack-edge-logo.jpg" alt="" draggable={false} />
          </div>
        </div>
      </div>
    );
  }

  const rank = cardRank(value);
  const suit = cardSuit(value);
  const theme = suitClass(suit);
  const face = isFaceRank(rank);

  return (
    <div className={`${mini ? "mini-card" : "playing-card"} luxury-white-card ${theme}`}>
      <div className="luxury-card-inner">
        <div className="luxury-card-border" />
        <div className="luxury-card-corner top-left">
          <strong>{rank}</strong>
          <span>{suit}</span>
        </div>

        <div className="luxury-card-corner bottom-right">
          <strong>{rank}</strong>
          <span>{suit}</span>
        </div>

        <div className={`luxury-card-center-field rank-${rank.toLowerCase()}`}>
          {rank === "A" ? (
            <div className="luxury-ace-field" aria-hidden="true">
              <span className="ace-suit">{suit}</span>
            </div>
          ) : face ? (
            <div className="luxury-face-field" aria-hidden="true">
              <div className="luxury-face-crown">✦</div>
              <div className="luxury-face-rank">{rank}</div>
              <div className="luxury-face-suit">{suit}</div>
              <div className="luxury-face-name">{faceLabel(rank)}</div>
              <div className="luxury-face-crown mirrored">✦</div>
            </div>
          ) : (
            <div className={`luxury-pip-layout rank-${rank.toLowerCase()}`}>
              {renderPips(rank, suit)}
            </div>
          )}
        </div>
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
