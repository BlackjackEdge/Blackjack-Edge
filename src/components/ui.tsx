import React, { useState } from "react";
import { X } from "lucide-react";
import {
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

export function PlayingCard({ value, mini = false }: { value: string; mini?: boolean }) {
  return (
    <div className={mini ? "mini-card real-card" : "playing-card real-card"}>
      <div className="card-corner top-left"><strong>{value}</strong><span>♠</span></div>
      <div className="card-center"><strong>{value}</strong><span>♠</span></div>
      <div className="card-corner bottom-right"><strong>{value}</strong><span>♠</span></div>
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
            <p>6-deck • 3:2 • S17 • DAS • Late Surrender</p>
          </div>

          <button className="icon-button" onClick={onClose} aria-label="Close strategy card">
            <X />
          </button>
        </div>

        <div className="strategy-tabs">
          <button className={tab === "hard" ? "active" : ""} onClick={() => setTab("hard")}>Hard Totals</button>
          <button className={tab === "soft" ? "active" : ""} onClick={() => setTab("soft")}>Soft Totals</button>
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
        <div className="premium-head player-hand-label">Your Hand</div>

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