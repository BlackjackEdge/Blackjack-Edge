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
  type Move
} from "@/lib/blackjack";

export function PlayingCard({ value, mini = false }: { value: string; mini?: boolean }) {
  return (
    <div className={mini ? "mini-card" : "playing-card"}>
      <span className="corner top">{value}♠</span>
      <strong>{value}</strong>
      <span>♠</span>
      <span className="corner bottom">{value}♠</span>
    </div>
  );
}

export function Logo() {
  return (
    <div className="logo-lockup">
      <img src="/blackjack-edge-logo.png" alt="Blackjack Edge logo" />
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
  return (
    <div className="overlay">
      <div className="strategy-sheet">
        <div className="sheet-header">
          <div>
            <span className="eyebrow">Reference</span>
            <h2>Basic Strategy Card</h2>
            <p>6-deck, 3:2, S17, DAS, late surrender.</p>
          </div>
          <button className="icon-button" onClick={onClose}><X /></button>
        </div>

        <div className="legend">
          <span className="cell H">H Hit</span>
          <span className="cell S">S Stand</span>
          <span className="cell D">D Double</span>
          <span className="cell P">P Split</span>
          <span className="cell R">R Surrender</span>
        </div>

        <StrategyMatrix title="Hard totals" rows={hardRows} chart={hardChart} />
        <StrategyMatrix title="Soft totals" rows={softRows} chart={softChart} />
        <StrategyMatrix title="Pairs" rows={pairRows} chart={pairChart} />
      </div>
    </div>
  );
}

function StrategyMatrix({ title, rows, chart }: { title: string; rows: string[]; chart: Record<string, Move[]> }) {
  return (
    <div className="matrix-card">
      <h3>{title}</h3>
      <div className="matrix">
        <div className="matrix-head">You</div>
        {dealerRanks.map(d => <div className="matrix-head" key={d}>{d}</div>)}
        {rows.map(row => (
          <>
            <div className="matrix-row-label" key={`${row}-label`}>{row}</div>
            {chart[row].map((move, i) => (
              <div className={`matrix-cell ${move}`} title={moveNames[move]} key={`${row}-${i}`}>{move}</div>
            ))}
          </>
        ))}
      </div>
    </div>
  );
}
