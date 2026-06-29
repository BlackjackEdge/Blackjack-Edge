import React from "react";
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

export function PlayingCard({
  value,
  mini = false,
}: {
  value: string;
  mini?: boolean;
}) {
  return (
    <div className={mini ? "mini-card real-card" : "playing-card real-card"}>
      <div className="card-corner top-left">
        <strong>{value}</strong>
        <span>♠</span>
      </div>

      <div className="card-center">
        <strong>{value}</strong>
        <span>♠</span>
      </div>

      <div className="card-corner bottom-right">
        <strong>{value}</strong>
        <span>♠</span>
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

export function StrategyCardOverlay({
  onClose,
}: {
  onClose: () => void;
}) {
  return (
    <div className="overlay">
      <div className="strategy-sheet">
        <div className="sheet-header">
          <div>
            <span className="eyebrow">Blackjack Edge Reference</span>
            <h2>Basic Strategy Card</h2>
            <p>6-deck • 3:2 • S17 • DAS • Late Surrender</p>
          </div>

          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close strategy card"
          >
            <X />
          </button>
        </div>

        <div className="legend">
          <span className="cell H">H Hit</span>
          <span className="cell S">S Stand</span>
          <span className="cell D">D Double</span>
          <span className="cell P">P Split</span>
          <span className="cell R">R Surrender</span>
        </div>

        <StrategyMatrix
          title="Hard totals"
          rows={hardRows}
          chart={hardChart}
        />

        <StrategyMatrix
          title="Soft totals"
          rows={softRows}
          chart={softChart}
        />

        <StrategyMatrix
          title="Pairs"
          rows={pairRows}
          chart={pairChart}
        />
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
    <div className="matrix-card">
      <h3>{title}</h3>

      <div className="matrix">
        {/* Header */}
        <div className="matrix-head">You</div>

        {dealerRanks.map((dealer) => (
          <div key={dealer} className="matrix-head">
            {dealer}
          </div>
        ))}

        {/* Rows */}
        {rows.map((row) => (
          <React.Fragment key={row}>
            <div className="matrix-row-label">
              {row}
            </div>

            {chart[row].map((move, index) => (
              <div
                key={`${row}-${index}`}
                className={`matrix-cell ${move}`}
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