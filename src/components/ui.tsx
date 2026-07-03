import React, { useRef, useState } from "react";
import { X, Home, GraduationCap, BarChart3, Vault, ChevronLeft, ChevronRight } from "lucide-react";
import {
  cardRank,
  cardSuit,
  dealerRanks,
  hardChart,
  hardRows,
  isKnownCard,
  moveNames,
  pairChart,
  pairRows,
  softChart,
  softRows,
  type Move,
} from "@/lib/blackjack";

type StrategyTab = "hard" | "soft" | "pairs";

export type MainScreen = "home" | "trainer" | "play" | "stats" | "vault";
export type AppScreen =
  | MainScreen
  | "basic"
  | "basicDrill"
  | "basicResults"
  | "countLearn"
  | "counting"
  | "countDrill";
export type SeatId = "left" | "center" | "right";

type PipPosition =
  | "top-left" | "top-center" | "top-right"
  | "upper-left" | "upper-center" | "upper-right"
  | "center-left" | "center" | "center-right"
  | "lower-left" | "lower-center" | "lower-right"
  | "bottom-left" | "bottom-center" | "bottom-right";

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

const MIRRORED = new Set<PipPosition>([
  "lower-left", "lower-center", "lower-right",
  "bottom-left", "bottom-center", "bottom-right",
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
  return (PIP_LAYOUTS[rank] || []).map((position, index) => (
    <span
      key={`${rank}-${position}-${index}`}
      className={`luxury-pip ${position} ${MIRRORED.has(position) ? "mirrored" : ""}`}
      aria-hidden="true"
    >
      {suit}
    </span>
  ));
}

function navHighlight(screen: MainScreen | AppScreen): MainScreen {
  if (["basic", "basicDrill", "basicResults", "countLearn", "counting", "countDrill"].includes(screen)) {
    return "trainer";
  }
  return screen as MainScreen;
}

export function PlayingCard({
  value,
  mini = false,
  faceDown = false,
  cardStyle = "premium",
}: {
  value: string;
  mini?: boolean;
  faceDown?: boolean;
  cardStyle?: "classic" | "premium";
}) {
  const styleClass = cardStyle === "classic" ? "card-classic" : "card-premium";

  if (faceDown || value === "back") {
    return (
      <div className={`${mini ? "mini-card" : "playing-card"} luxury-card-back ${styleClass}`}>
        <div className="luxury-card-inner">
          <div className="luxury-card-back-core">
            <div className="luxury-card-back-ring" />
            <span className="luxury-card-back-fallback">♠</span>
          </div>
        </div>
      </div>
    );
  }

  if (!value || !isKnownCard(value)) {
    return (
      <div className={`${mini ? "mini-card" : "playing-card"} suit-black luxury-card-fallback-wrap`}>
        <div className="luxury-card-inner">
          <span className="luxury-card-fallback-text">{value || "?"}</span>
        </div>
      </div>
    );
  }

  const rank = cardRank(value);
  const suit = cardSuit(value);
  const theme = suitClass(suit);
  const face = isFaceRank(rank);

  return (
    <div className={`${mini ? "mini-card" : "playing-card"} ${theme} ${styleClass}`}>
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

export function LogoBadge() {
  return (
    <div className="home-logo">
      <img
        src="/blackjack-edge-logo-transparent.png"
        alt="Blackjack Edge"
        className="home-logo-img"
        draggable={false}
      />
    </div>
  );
}

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  return (
    <div className={`home-logo home-logo-${size}`}>
      <img
        src="/blackjack-edge-logo-transparent.png"
        alt="Blackjack Edge"
        className="home-logo-img"
        draggable={false}
      />
    </div>
  );
}

export function SuitRow() {
  return (
    <div className="suit-row">
      <span className="suit-spade">♠</span>
      <span className="suit-heart">♥</span>
      <span className="suit-diamond">♦</span>
      <span className="suit-club">♣</span>
    </div>
  );
}

export function HomeHeader({
  onSettings,
}: {
  onSettings: () => void;
}) {
  return (
    <header className="home-header">
      <div className="home-header-spacer" />
      <button className="btn-icon" onClick={onSettings} aria-label="App Settings">
        <SettingsIcon />
      </button>
    </header>
  );
}

export function HudStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className={`hud-stat ${accent ? "hud-stat-accent" : ""}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

function RulesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" />
    </svg>
  );
}

export function FeatureCard({
  icon,
  iconSrc,
  title,
  subtitle,
  action,
  cta,
  variant,
  onClick,
}: {
  icon?: React.ReactNode;
  iconSrc?: string;
  title: string;
  subtitle: string;
  action?: string;
  cta?: string;
  variant?: "play" | "trainer" | "stats" | "vault";
  onClick: () => void;
}) {
  const label = action || cta || "Open";
  return (
    <button className={`feature-card ${variant === "play" ? "play-card" : variant ? `feature-${variant}` : ""}`} onClick={onClick}>
      <div className="feature-card-icon" aria-hidden="true">
        {iconSrc ? (
          <img src={iconSrc} alt="" className="feature-card-icon-img" draggable={false} />
        ) : (
          icon || "♠"
        )}
      </div>
      <div className="feature-card-content">
        <div className="feature-card-body">
          <strong className="feature-card-title">{title}</strong>
          <span>{subtitle}</span>
        </div>
        <span className="feature-card-action">{label}</span>
      </div>
    </button>
  );
}

export function BottomNav({
  active,
  screen,
  onNavigate,
}: {
  active?: MainScreen;
  screen?: AppScreen | MainScreen;
  onNavigate: (screen: MainScreen) => void;
}) {
  const highlight = active ?? (screen ? navHighlight(screen) : "home");

  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      <div className="bottom-nav-inner">
        <button className={`nav-item ${highlight === "home" ? "active" : ""}`} onClick={() => onNavigate("home")}>
          <Home />
          <span>Home</span>
        </button>
        <button className={`nav-item ${highlight === "trainer" ? "active" : ""}`} onClick={() => onNavigate("trainer")}>
          <GraduationCap />
          <span>Trainer</span>
        </button>
        <button className={`nav-item ${highlight === "stats" ? "active" : ""}`} onClick={() => onNavigate("stats")}>
          <BarChart3 />
          <span>Stats</span>
        </button>
        <button className={`nav-item ${highlight === "vault" ? "active" : ""}`} onClick={() => onNavigate("vault")}>
          <Vault />
          <span>Vault</span>
        </button>
      </div>
    </nav>
  );
}

export const CHIP_VALUES = [5, 25, 50, 100, 250, 500, 1000, 5000, 10000, 25000] as const;

export const CHIP_IMAGE_MAP: Record<number, string> = {
  5: "/chips/chip-5.png",
  25: "/chips/chip-25.png",
  50: "/chips/chip-50.png",
  100: "/chips/chip-100.png",
  250: "/chips/chip-250.png",
  500: "/chips/chip-500.png",
  1000: "/chips/chip-1000.png",
  5000: "/chips/chip-5000.png",
  10000: "/chips/chip-10000.png",
  25000: "/chips/chip-25000.png",
};

export const HOME_ICON_MAP = {
  play: "/home-icons/play-blackjack-icon.png",
  trainer: "/home-icons/trainer-icon.png",
  stats: "/home-icons/stats-icon.png",
  vault: "/home-icons/vault-icon.png",
} as const;

const CHIP_DENOM_ORDER = [25000, 10000, 5000, 1000, 500, 250, 100, 50, 25, 5] as const;

export function chipLabel(value: number) {
  return value >= 1000 ? `$${value / 1000}K` : `$${value}`;
}

export function chipImageSrc(value: number): string | undefined {
  return CHIP_IMAGE_MAP[value];
}

export function representativeChipForBet(bet: number): number {
  for (const value of CHIP_DENOM_ORDER) {
    if (bet >= value) return value;
  }
  return 5;
}

function ChipFace({
  value,
  selected,
  className = "",
}: {
  value: number;
  selected?: boolean;
  className?: string;
}) {
  const src = chipImageSrc(value);
  const label = chipLabel(value);

  if (src) {
    return (
      <span className={`chip-face ${selected ? "selected" : ""} ${className}`.trim()}>
        <img src={src} alt="" aria-hidden="true" draggable={false} />
      </span>
    );
  }

  return (
    <span className={`chip-face chip-face-fallback chip-${value} ${selected ? "selected" : ""} ${className}`.trim()}>
      {label}
    </span>
  );
}

export function BetChipStack({ amount, chipValue }: { amount: number; chipValue?: number | null }) {
  if (amount <= 0) return null;

  const displayChip =
    amount > 0 && chipValue && chipValue > 0 ? chipValue : representativeChipForBet(amount);
  return (
    <div className="bet-chip-stack">
      <ChipFace value={displayChip} className="bet-chip-stack-chip" />
      <span className="bet-chip-stack-amount">${amount.toLocaleString()}</span>
    </div>
  );
}

export function ChipTray({
  selectedChip,
  onSelectChip,
  disabled,
}: {
  selectedChip: number;
  onSelectChip: (value: number) => void;
  disabled?: boolean;
}) {
  const trayRef = useRef<HTMLDivElement>(null);

  function scroll(dir: -1 | 1) {
    trayRef.current?.scrollBy({ left: dir * 120, behavior: "smooth" });
  }

  return (
    <div className="chip-rack-row chip-rack-landscape-flat">
      <button type="button" className="chip-scroll-btn chip-scroll-landscape-hide" onClick={() => scroll(-1)} aria-label="Scroll chips left">
        <ChevronLeft size={16} />
      </button>
      <div className="chip-tray chip-tray-landscape-flat" ref={trayRef}>
        {CHIP_VALUES.map((value) => (
            <button
              key={value}
              type="button"
              className={`chip-btn ${chipImageSrc(value) ? "chip-btn-image" : `chip-${value}`} ${selectedChip === value ? "selected" : ""}`}
              onClick={() => onSelectChip(value)}
              disabled={disabled}
              aria-label={`Select ${chipLabel(value)} chip`}
            >
              <ChipFace value={value} selected={selectedChip === value} />
            </button>
        ))}
      </div>
      <button type="button" className="chip-scroll-btn chip-scroll-landscape-hide" onClick={() => scroll(1)} aria-label="Scroll chips right">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

export function ChipButton({
  value,
  selected,
  disabled,
  onClick,
}: {
  value: number;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`chip-btn ${chipImageSrc(value) ? "chip-btn-image" : `chip-${value}`} ${selected ? "selected" : ""}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={`Select ${chipLabel(value)} chip`}
    >
      <ChipFace value={value} selected={selected} />
    </button>
  );
}

export function ActionButtons({
  canHit,
  canStand,
  canDouble,
  canSplit,
  canSurrender = false,
  onHit,
  onStand,
  onDouble,
  onSplit,
  onSurrender,
}: {
  canHit: boolean;
  canStand: boolean;
  canDouble: boolean;
  canSplit: boolean;
  canSurrender?: boolean;
  onHit: () => void;
  onStand: () => void;
  onDouble: () => void;
  onSplit: () => void;
  onSurrender?: () => void;
}) {
  return (
    <div className="action-buttons">
      <button className="action-btn surrender" disabled={!canSurrender} onClick={() => onSurrender?.()}>Surrender</button>
      <button className="action-btn split" disabled={!canSplit} onClick={onSplit}>Split</button>
      <button className="action-btn double" disabled={!canDouble} onClick={onDouble}>Double</button>
      <button className="action-btn stand" disabled={!canStand} onClick={onStand}>Stand</button>
      <button className="action-btn hit" disabled={!canHit} onClick={onHit}>Hit</button>
    </div>
  );
}

export function ActionButton({
  move,
  label,
  disabled,
  onClick,
}: {
  move: Move;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const cls = move === "H" ? "hit" : move === "S" ? "stand" : move === "D" ? "double" : move === "P" ? "split" : "surrender";
  return (
    <button className={`action-btn ${cls}`} disabled={disabled} onClick={onClick}>
      {label}
    </button>
  );
}

export type VaultSection =
  | "strategy"
  | "rules"
  | "counting"
  | "betting"
  | "mistakes"
  | "weaknesses";

export function VaultCard({
  title,
  subtitle,
  action,
  onClick,
}: {
  title: string;
  subtitle: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="vault-feature-card" onClick={onClick}>
      <div className="vault-feature-card-body">
        <strong className="vault-feature-card-title">{title}</strong>
        <span>{subtitle}</span>
      </div>
      <span className="feature-card-action">{action}</span>
    </button>
  );
}

export function VaultPanel({
  title,
  subtitle,
  onBack,
  children,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="screen panel-screen vault-panel-screen">
      <button type="button" className="back-link" onClick={onBack}>← Back to Vault</button>
      <div className="vault-panel-header">
        <h1>{title}</h1>
        {subtitle && <p className="text-muted">{subtitle}</p>}
      </div>
      <div className="vault-panel-scroll">{children}</div>
    </section>
  );
}

function VaultBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="vault-block cream-panel">
      <h3>{title}</h3>
      <div className="vault-block-body">{children}</div>
    </div>
  );
}

function VaultBullets({ items }: { items: string[] }) {
  return (
    <ul className="vault-bullets">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function VaultStrategyContent({ onOpenStrategyCard }: { onOpenStrategyCard: () => void }) {
  return (
    <>
      <VaultBlock title="What Is Basic Strategy?">
        <p>Basic Strategy is the mathematically correct play based on your hand and the dealer&apos;s upcard. It does not guess. It does not follow feelings. It follows the best long-term decision.</p>
      </VaultBlock>
      <VaultBlock title="Hard Totals">
        <VaultBullets items={[
          "Hard total means no usable Ace.",
          "8 or less: usually Hit",
          "9: Double against 3–6, otherwise Hit",
          "10: Double against 2–9, otherwise Hit",
          "11: Double against 2–10, Hit against Ace if rules say so",
          "12: Stand against 4–6, otherwise Hit",
          "13–16: Stand against 2–6, Hit against 7–A",
          "17+: Stand",
        ]} />
      </VaultBlock>
      <VaultBlock title="Soft Totals">
        <VaultBullets items={[
          "Soft total means your hand has a usable Ace.",
          "Soft 13–14: usually Hit, Double against 5–6",
          "Soft 15–16: Hit, Double against 4–6",
          "Soft 17: Hit, Double against 3–6",
          "Soft 18: Stand against 2,7,8; Double against 3–6; Hit against 9–A",
          "Soft 19+: usually Stand",
        ]} />
      </VaultBlock>
      <VaultBlock title="Pairs">
        <VaultBullets items={[
          "Always split Aces",
          "Always split 8s",
          "Never split 10s",
          "Never split 5s, treat as hard 10",
          "Never split 4s unless special rules favor it",
          "Split 2s/3s against 2–7",
          "Split 6s against 2–6",
          "Split 7s against 2–7",
          "Split 9s against 2–6 and 8–9, stand against 7,10,A",
        ]} />
      </VaultBlock>
      <button type="button" className="btn-primary vault-panel-cta" onClick={onOpenStrategyCard}>
        Open Full Strategy Card
      </button>
    </>
  );
}

export function VaultRulesContent() {
  return (
    <>
      <VaultBlock title="Blackjack">
        <VaultBullets items={[
          "Blackjack is an Ace plus a 10-value card.",
          "Blackjack pays 3:2.",
          "A $10 blackjack pays $15 profit.",
        ]} />
      </VaultBlock>
      <VaultBlock title="Hit">
        <VaultBullets items={[
          "Take another card.",
          "Use when your hand is weak or dealer is strong.",
        ]} />
      </VaultBlock>
      <VaultBlock title="Stand">
        <VaultBullets items={[
          "Keep your hand.",
          "Use when your hand is strong or dealer is likely to bust.",
        ]} />
      </VaultBlock>
      <VaultBlock title="Double">
        <VaultBullets items={[
          "Double your bet and receive one card.",
          "Strong doubles are often 10 or 11 against weak dealer cards.",
          "Soft doubles can be powerful against dealer 3–6.",
        ]} />
      </VaultBlock>
      <VaultBlock title="Split">
        <VaultBullets items={[
          "If your first two cards are the same rank, you can split into two hands.",
          "Each hand gets its own bet.",
          "Aces and 8s are usually automatic splits.",
        ]} />
      </VaultBlock>
      <VaultBlock title="Surrender">
        <VaultBullets items={[
          "Give up the hand and lose half your bet.",
          "Useful on some bad 15/16 situations against strong dealer cards.",
        ]} />
      </VaultBlock>
      <VaultBlock title="Dealer Hits Soft 17 (H17)">
        <VaultBullets items={[
          "Dealer must hit Ace-6.",
          "This slightly helps the casino compared to dealer standing on soft 17.",
        ]} />
      </VaultBlock>
      <VaultBlock title="DAS">
        <VaultBullets items={[
          "Double After Split.",
          "Lets you double after splitting.",
          "Better for the player.",
        ]} />
      </VaultBlock>
      <VaultBlock title="Insurance">
        <VaultBullets items={[
          "Offered when dealer shows Ace.",
          "Usually a bad bet unless counting says otherwise.",
          "Pays 2:1 but is not recommended for basic strategy players.",
        ]} />
      </VaultBlock>
      <VaultBlock title="Push">
        <VaultBullets items={["Tie hand.", "Your bet is returned."]} />
      </VaultBlock>
      <VaultBlock title="Bust">
        <VaultBullets items={["Going over 21.", "You lose immediately."]} />
      </VaultBlock>
      <VaultBlock title="Table Limits">
        <VaultBullets items={[
          "Minimum bet: $5",
          "Maximum bet per hand: $250K",
        ]} />
      </VaultBlock>
    </>
  );
}

export function VaultCountingContent() {
  return (
    <>
      <VaultBlock title="Card Values">
        <VaultBullets items={[
          "2, 3, 4, 5, 6 = +1",
          "7, 8, 9 = 0",
          "10, J, Q, K, A = -1",
        ]} />
      </VaultBlock>
      <VaultBlock title="Low Cards Leaving">
        <VaultBullets items={[
          "Good for the player.",
          "More high cards remain.",
          "More blackjacks.",
          "Better doubles.",
          "Dealer busts more often.",
        ]} />
      </VaultBlock>
      <VaultBlock title="High Cards Leaving">
        <VaultBullets items={[
          "Bad for the player.",
          "Fewer 10s and Aces remain.",
          "Less blackjack value.",
          "Less double-down power.",
        ]} />
      </VaultBlock>
      <VaultBlock title="Running Count">
        <VaultBullets items={[
          "The live count as cards are seen.",
          "Add +1, 0, or -1 for every visible card.",
        ]} />
      </VaultBlock>
      <VaultBlock title="True Count">
        <VaultBullets items={[
          "Running count divided by decks remaining.",
          "True count matters more than running count in multi-deck games.",
          "Example: Running count +6 with 3 decks left = true count +2.",
        ]} />
      </VaultBlock>
      <VaultBlock title="Deck Estimation">
        <VaultBullets items={[
          "52 cards = 1 deck",
          "26 cards = 0.5 deck",
          "13 cards = 0.25 deck",
          "Estimate, do not obsess.",
        ]} />
      </VaultBlock>
      <VaultBlock title="Training Goal">
        <VaultBullets items={[
          "Count accurately first.",
          "Speed comes later.",
          "A slow accurate count is better than a fast wrong count.",
        ]} />
      </VaultBlock>
      <VaultBlock title="True Count Meanings">
        <VaultBullets items={[
          "TC 0: neutral",
          "TC +1: slightly better",
          "TC +2: useful advantage starting",
          "TC +3: strong",
          "TC +4 or higher: very favorable",
        ]} />
      </VaultBlock>
    </>
  );
}

export function VaultBettingContent() {
  return (
    <>
      <VaultBlock title="Why True Count Matters">
        <p>The true count estimates how rich the remaining shoe is in high cards. Higher true counts usually mean the player has better chances because more 10s and Aces remain.</p>
      </VaultBlock>
      <VaultBlock title="Training Bet Spread (1 unit = table minimum)">
        <div className="vault-spread-table">
          <div className="vault-spread-row"><span>TC less than +1</span><strong>1 unit</strong></div>
          <div className="vault-spread-row"><span>TC +1</span><strong>1 unit</strong></div>
          <div className="vault-spread-row"><span>TC +2</span><strong>2 units</strong></div>
          <div className="vault-spread-row"><span>TC +3</span><strong>4 units</strong></div>
          <div className="vault-spread-row"><span>TC +4</span><strong>6 units</strong></div>
          <div className="vault-spread-row"><span>TC +5 or higher</span><strong>8 units</strong></div>
        </div>
      </VaultBlock>
      <VaultBlock title="$5 Unit Examples">
        <VaultBullets items={[
          "TC 0 or +1 = $5",
          "TC +2 = $10",
          "TC +3 = $20",
          "TC +4 = $30",
          "TC +5 = $40",
        ]} />
      </VaultBlock>
      <VaultBlock title="Discipline Rules">
        <VaultBullets items={[
          "Do not raise bets just because you feel due.",
          "Raise bets because the count says the shoe is favorable.",
          "Do not overbet your bankroll.",
          "Betting too big during bad counts destroys bankroll.",
          "High count does not guarantee a win.",
          "It only means better long-term odds.",
          "The goal is disciplined bet sizing.",
        ]} />
      </VaultBlock>
      <VaultBlock title="Bankroll Notes">
        <VaultBullets items={[
          "A unit is your base bet.",
          "Conservative players use smaller spreads.",
          "Aggressive spreads swing harder.",
          "Training mode should teach control, not reckless betting.",
        ]} />
      </VaultBlock>
      <p className="vault-disclaimer text-muted">This is for training and education inside Blackjack Edge.</p>
    </>
  );
}

const VAULT_MISTAKES = [
  { title: "Taking insurance too often", why: "Insurance is usually a losing side bet unless the count is high enough." },
  { title: "Splitting 10s", why: "20 is already one of the strongest hands in blackjack." },
  { title: "Not splitting Aces", why: "Two Aces are weak together but powerful when split." },
  { title: "Not splitting 8s", why: "16 is a bad hand. Splitting gives two better chances." },
  { title: "Standing on 12 against 2 or 3 too often", why: "Dealer is not weak enough. Basic Strategy usually hits." },
  { title: "Hitting 12 against 4, 5, or 6", why: "Dealer is likely to bust. Standing is usually better." },
  { title: "Not doubling 11", why: "11 is one of the best double-down hands." },
  { title: "Playing scared after losing hands", why: "Strategy does not change because of the last hand." },
  { title: "Betting bigger without a count advantage", why: "Bigger bets during neutral or bad counts increase losses." },
  { title: "Guessing the true count", why: "Running count alone is not enough in multi-deck blackjack." },
  { title: "Ignoring dealer upcard", why: "Your decision depends heavily on what the dealer shows." },
  { title: "Chasing losses", why: "Blackjack rewards discipline, not emotion." },
] as const;

export function VaultMistakesContent() {
  return (
    <div className="vault-mistakes-grid">
      {VAULT_MISTAKES.map((mistake, i) => (
        <div key={mistake.title} className="vault-mistake-card cream-panel">
          <span className="vault-mistake-num">Mistake {i + 1}</span>
          <strong>{mistake.title}</strong>
          <p><em>Why it hurts:</em> {mistake.why}</p>
        </div>
      ))}
    </div>
  );
}

export type VaultWeaknessStats = {
  basicDrills: number;
  basicAccuracySum: number;
  countDrills: number;
  roundsPlayed: number;
  wins: number;
  peakBankroll: number;
  bankroll: number;
};

export function VaultWeaknessContent({
  stats,
  onReDrillBasic,
  onReDrillCounting,
  onOpenStrategyCard,
  onStartPlay,
}: {
  stats: VaultWeaknessStats;
  onReDrillBasic: () => void;
  onReDrillCounting: () => void;
  onOpenStrategyCard: () => void;
  onStartPlay: () => void;
}) {
  const avgBsAccuracy = stats.basicDrills ? Math.round(stats.basicAccuracySum / stats.basicDrills) : null;
  const winRate = stats.roundsPlayed ? Math.round((stats.wins / stats.roundsPlayed) * 100) : null;

  return (
    <>
      <VaultBlock title="Basic Strategy Weaknesses">
        {stats.basicDrills > 0 ? (
          <VaultBullets items={[
            `Drills completed: ${stats.basicDrills}`,
            `Average accuracy: ${avgBsAccuracy}%`,
            avgBsAccuracy !== null && avgBsAccuracy < 90 ? "Focus: re-drill until 90%+ accuracy" : "Keep drilling to maintain sharp decisions",
            "Most missed hard totals — tracked in future updates",
            "Most missed soft totals — tracked in future updates",
            "Most missed pairs — tracked in future updates",
          ]} />
        ) : (
          <p className="vault-placeholder">Start drilling to unlock your weakest hands.</p>
        )}
      </VaultBlock>
      <VaultBlock title="Card Counting Weaknesses">
        {stats.countDrills > 0 ? (
          <VaultBullets items={[
            `Count drills completed: ${stats.countDrills}`,
            "Missed +1 cards — tracked in future updates",
            "Missed 0 cards — tracked in future updates",
            "Missed -1 cards — tracked in future updates",
            "Running count accuracy — tracked in future updates",
            "True count accuracy — tracked in future updates",
          ]} />
        ) : (
          <p className="vault-placeholder">Complete counting drills to unlock card recognition stats.</p>
        )}
      </VaultBlock>
      <VaultBlock title="Session Review">
        {stats.roundsPlayed > 0 || stats.basicDrills > 0 || stats.countDrills > 0 ? (
          <VaultBullets items={[
            `Hands played: ${stats.roundsPlayed}`,
            `Strategy accuracy: ${avgBsAccuracy !== null ? `${avgBsAccuracy}%` : "—"}`,
            stats.countDrills > 0 ? `Count drills: ${stats.countDrills}` : "Counting accuracy — no drills yet",
            winRate !== null ? `Win rate: ${winRate}%` : "Win rate — play more rounds",
            `Peak bankroll: $${stats.peakBankroll.toLocaleString()}`,
            `Current bankroll: $${stats.bankroll.toLocaleString()}`,
            "Weakest category — drill more to unlock detailed breakdown",
          ]} />
        ) : (
          <p className="vault-placeholder">Play more rounds to build your review profile.</p>
        )}
      </VaultBlock>
      <div className="vault-weakness-actions">
        <button type="button" className="btn-primary" onClick={onReDrillBasic}>Re-drill Basic Strategy</button>
        <button type="button" className="btn-secondary" onClick={onReDrillCounting}>Re-drill Counting</button>
        <button type="button" className="btn-secondary" onClick={onOpenStrategyCard}>Open Strategy Card</button>
        <button type="button" className="btn-secondary" onClick={onStartPlay}>Start Play Blackjack</button>
      </div>
    </>
  );
}

export function OverlaySheet({
  title,
  eyebrow,
  subtitle,
  description,
  onClose,
  children,
  gold = false,
}: {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  gold?: boolean;
}) {
  const sub = subtitle || description;

  return (
    <div className="overlay" onClick={onClose}>
      <div className={`sheet ${gold ? "luxury-strategy-card sheet-strategy" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className={gold ? "luxury-sheet-header strategy-sheet-header sheet-header-sticky" : "sheet-header sheet-header-sticky"}>
          <div className="sheet-header-text">
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2>{title}</h2>
            {sub && <p>{sub}</p>}
          </div>
          <button type="button" className="btn-icon sheet-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function DialogCard({
  eyebrow,
  title,
  message,
  onCancel,
  onConfirm,
  cancelLabel = "Cancel",
  confirmLabel = "Confirm",
}: {
  eyebrow?: string;
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  cancelLabel?: string;
  confirmLabel?: string;
}) {
  return (
    <div className="overlay overlay-center">
      <div className="dialog-card glass-panel glass-panel-gold">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
        <p>{message}</p>
        <div className="dialog-actions">
          <button className="btn-secondary" onClick={onCancel}>{cancelLabel}</button>
          <button className="btn-primary" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
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
    <OverlaySheet
      title="Basic Strategy Card"
      eyebrow="Blackjack Edge Reference"
      subtitle="6-deck • 3:2 • H17 • DAS • Late Surrender"
      onClose={onClose}
      gold
    >
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
    </OverlaySheet>
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
        <div className="premium-head">You</div>
        {dealerRanks.map((dealer) => (
          <div key={dealer} className="premium-head">{dealer}</div>
        ))}
        {rows.map((row) => (
          <React.Fragment key={row}>
            <div className="premium-row-label">{row}</div>
            {chart[row].map((move, index) => (
              <div key={`${row}-${index}`} className={`premium-cell ${move}`} title={moveNames[move]}>
                {move}
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

export const GLOSSARY = [
  { term: "Basic Strategy", def: "The mathematically optimal play for every hand combination against each dealer upcard." },
  { term: "Hi-Lo Count", def: "A card counting system: 2–6 = +1, 7–9 = 0, 10–A = -1." },
  { term: "Running Count", def: "The cumulative Hi-Lo total of all cards seen from the start of the shoe." },
  { term: "True Count", def: "Running count divided by estimated decks remaining." },
  { term: "Penetration", def: "How deep into the shoe has been dealt, as a percentage." },
  { term: "H17", def: "Dealer hits on soft 17." },
  { term: "DAS", def: "Double After Split — you may double down on split hands." },
  { term: "3:2 Blackjack", def: "A natural blackjack pays 1.5× your bet." },
];

export function SettingsToggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`settings-toggle ${disabled ? "disabled" : ""}`}>
      <div className="settings-toggle-text">
        <strong>{label}</strong>
        {description && <span>{description}</span>}
      </div>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

export function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="settings-section">
      <h3 className="settings-section-title">{title}</h3>
      {children}
    </div>
  );
}

export function RecommendedBetPanel({
  amount,
  units,
  unitSize,
  reason,
}: {
  amount: number;
  units: number;
  unitSize: number;
  reason: string;
}) {
  return (
    <div className="recommended-bet-panel glass-panel">
      <span className="eyebrow">Recommended Training Bet</span>
      <div className="recommended-bet-main">
        <strong>${amount.toLocaleString()}</strong>
        <span>{units} unit{units === 1 ? "" : "s"} × ${unitSize}</span>
      </div>
      <p className="recommended-bet-reason">{reason}</p>
      <p className="recommended-bet-note text-muted">
        Educational sizing only — based on true count. Does not place bets for you.
      </p>
    </div>
  );
}
