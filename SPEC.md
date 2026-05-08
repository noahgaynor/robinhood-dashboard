# Robinhood Portfolio & Risk Dashboard — Spec

> Handoff doc for the implementing model (Sonnet). Read this end-to-end before
> writing any code. Every "MUST" is non-negotiable; "SHOULD" is strongly
> preferred but the implementer can deviate with a one-line comment explaining
> why.

---

## 1. Goals

Build a **single-page web app** that turns a Robinhood account-activity CSV
into a portfolio + risk + performance dashboard. Refresh model: the user drops
a new CSV every 1–2 weeks and the dashboard recomputes everything client-side.

Hard requirements:

- Static site, deployable to GitHub Pages with no backend.
- Drag-and-drop CSV; data never leaves the browser. Last upload persists in
  `localStorage` so reloads don't require re-uploading.
- Live mark-to-market via a free quote API.
- Compare portfolio performance to **SPY** and **QQQ**.
- Every risk/portfolio metric is shown alongside a **context line** (a
  benchmark, threshold, or one-sentence interpretation). No naked numbers.
- Visual identity: dark monochrome with a single accent color. Linear/Vercel/
  Stripe register. Desktop-first, mobile usable.

Non-goals (V1):

- Options, crypto, fixed income, multi-account aggregation.
- Tax-lot optimization beyond FIFO realized P&L.
- Wash-sale detection.
- Backtesting or trade recommendations.
- User accounts, auth, sync across devices.

---

## 2. Tech stack (recommended)

| Concern        | Choice                                         | Why |
|----------------|------------------------------------------------|-----|
| Bundler        | **Vite**                                       | Fast, minimal config, first-class GH Pages support |
| Framework      | **React 18 + TypeScript**                      | Component model fits the dashboard, types prevent metric-formula bugs |
| Styling        | **Tailwind CSS** + a tiny custom theme         | Stays minimalist; design system encoded in `tailwind.config.ts` |
| Charts         | **ECharts** (via `echarts-for-react`)          | Best-looking defaults, supports the equity curve + donut + small sparklines we need with one library |
| CSV parsing    | **PapaParse**                                  | Streaming, handles Robinhood's quirks |
| Date math      | **date-fns**                                   | Tree-shakeable, no moment bloat |
| Numeric utils  | **decimal.js** (or `big.js`)                   | Avoid float drift on cost-basis math |
| State          | **Zustand**                                    | Lighter than Redux; one store is plenty |
| Persistence    | `localStorage` (raw CSV + parsed snapshot + cached quotes) |
| Deployment     | **GitHub Pages** via `gh-pages` action         | Per the user's request |

If the implementer prefers **Recharts** over ECharts for tighter React
integration, that's acceptable — but the small-multiples sparklines and the
combined equity-curve+drawdown chart are noticeably nicer in ECharts.

**No** server-side rendering, no API routes, no Node runtime. This is a static
SPA.

---

## 3. Architecture at a glance

```
┌──────────────────────────────────────────────────────────────┐
│  Browser (the entire app)                                    │
│                                                              │
│   ┌────────────┐    ┌────────────────┐    ┌──────────────┐  │
│   │ CSV upload │───▶│ Parser + lot   │───▶│ Portfolio    │  │
│   │ (drop zone)│    │ engine (FIFO)  │    │ state store  │  │
│   └────────────┘    └────────────────┘    └──────┬───────┘  │
│         ▲                                         │          │
│         │            ┌──────────────┐             ▼          │
│         │            │ localStorage │      ┌────────────┐    │
│         └────────────│  (raw CSV +  │◀─────│ Metrics    │    │
│                      │  snapshot)   │      │ engine     │    │
│                      └──────────────┘      └─────┬──────┘    │
│                                                  │           │
│                ┌──────────────┐                  ▼           │
│                │ Quote API    │───▶ Live ──▶ ┌────────────┐  │
│                │ (Finnhub)    │    prices    │ UI (React) │  │
│                └──────────────┘              └────────────┘  │
│                                                              │
│                ┌──────────────┐                              │
│                │ Benchmark API│───▶ SPY/QQQ ──▶ comparisons  │
│                │ (Stooq CSV)  │    history                   │
│                └──────────────┘                              │
└──────────────────────────────────────────────────────────────┘
```

Pure client app. CORS is the only real risk surface — see §6.

---

## 4. Data model

```ts
// The raw row after CSV parse + normalization.
type Transaction = {
  id: string;                  // hash of (date|symbol|code|qty|price|amount)
  activityDate: Date;
  settleDate: Date | null;
  symbol: string | null;       // null for cash transactions
  description: string;
  code: TransCode;             // normalized enum below
  quantity: number;            // signed: + for shares in, - for shares out
  price: number;               // per-share price; 0 for cash events
  amount: number;              // signed cash impact; - = cash out, + = cash in
};

type TransCode =
  | 'BUY' | 'SELL'
  | 'DIV' | 'DIVTAX' | 'DRIP'
  | 'INT' | 'ACH'  | 'WIRE'
  | 'SPLIT' | 'MERGER' | 'SPINOFF'
  | 'FEE'  | 'JNL'   | 'OTHER';

// A position, derived from the lot ledger.
type Position = {
  symbol: string;
  shares: number;
  avgCost: number;             // weighted avg of open lots
  costBasis: number;           // shares * avgCost
  marketPrice: number;         // from quote API
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  pctOfPortfolio: number;
  sector?: string;             // from quote API profile endpoint
  lots: Lot[];                 // open lots only, FIFO ordered
};

type Lot = {
  acquiredAt: Date;
  shares: number;
  costPerShare: number;
};

// A closed trade = one or more lots fully consumed by a SELL.
type ClosedTrade = {
  symbol: string;
  openedAt: Date;
  closedAt: Date;
  shares: number;
  costBasis: number;
  proceeds: number;
  realizedPnl: number;
  realizedPnlPct: number;
  holdDays: number;
  term: 'short' | 'long';      // long if holdDays >= 365
};

type PortfolioSnapshot = {
  asOf: Date;
  positions: Position[];
  closedTrades: ClosedTrade[];
  cash: number;
  totalValue: number;          // cash + sum(marketValue)
  totalCostBasis: number;
  totalDeposits: number;       // sum of ACH/WIRE in
  totalWithdrawals: number;    // sum of ACH/WIRE out
  netInvested: number;         // deposits - withdrawals
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  dividendsReceived: number;
};
```

The full transaction list and the derived snapshot are both kept in the store.
The snapshot is what every UI tile reads from.

---

## 5. CSV ingestion

### 5.1 Format

Robinhood's export ("Account → Reports & Statements → Account Activity, CSV")
has roughly these columns. Header names occasionally drift; **match
case-insensitively and tolerate extra/missing columns**:

```
Activity Date, Process Date, Settle Date, Instrument, Description,
Trans Code, Quantity, Price, Amount
```

Notes for the parser:

- `Price` and `Amount` arrive as strings like `"$123.45"` or `"($123.45)"` for
  negatives. Strip `$`, commas, parentheses; parens → negative.
- `Quantity` may be empty for cash events; treat as 0.
- `Trans Code` values to map: `Buy`→BUY, `Sell`→SELL, `CDIV`/`MDIV`→DIV,
  `DTAX`→DIVTAX, `DRIP`→DRIP, `INT`→INT, `ACH`→ACH (sign-aware),
  `Wire`→WIRE, `MRGR`/`MRGS`→MERGER, `SPLT`/`SOFF`→SPLIT/SPINOFF, anything
  else → OTHER. Unknown codes go in OTHER and are surfaced in a "skipped" log.
- Sort ascending by `Activity Date`, with stable tiebreak on row order — needed
  for FIFO correctness.

### 5.2 Lot engine (FIFO)

1. Walk transactions in chronological order.
2. On `BUY` / `DRIP`: push a new open lot `{date, shares, costPerShare}`.
3. On `SELL`: consume open lots in FIFO order. For each lot consumed (whole or
   partial), emit a `ClosedTrade` row recording proceeds, cost basis, hold days,
   and short/long classification.
4. On `SPLIT`: scale all open lots' `shares` and `costPerShare` by the ratio.
   Robinhood records splits as a quantity-only row; infer the ratio from
   `(new total shares) / (old total shares)` for that symbol.
5. On `MERGER` / `SPINOFF`: out of scope for V1 — log and continue. Display a
   warning banner if any are present so the user knows numbers may be off for
   that symbol.
6. `DIV`, `INT`, `ACH`, `WIRE`: just adjust cash; don't touch lots.

### 5.3 Drag-and-drop UX

- Whole page is a drop target with a subtle ring on `dragenter`.
- Empty state (no CSV ever loaded) shows a centered card with a dashed border,
  "Drop your Robinhood CSV here", and a small "or choose file" link.
- After load: parse → store raw text in `localStorage` → recompute snapshot.
- Header always shows "Last refreshed: <relative time>" + a small "Replace
  CSV" button. Replacing overwrites the saved CSV.
- Show parse summary toast: `"1,247 transactions • 38 symbols • spans
  Mar 2021 – May 2026"`. If anything was skipped, link out to a "Show parser
  log" drawer.

---

## 6. Live quotes & benchmarks

### 6.1 Quote API — Finnhub (free tier)

- Endpoint: `https://finnhub.io/api/v1/quote?symbol=XYZ&token=...`
- Free tier: **60 calls/min**. Plenty for a single-user dashboard.
- Returns current price + day change. Has CORS — works directly from the
  browser. ✅
- Also use `/stock/profile2` once per symbol per session to fetch sector and
  industry. Cache in `localStorage` keyed by symbol — sector doesn't change.

The user enters their Finnhub API key once on first load; store in
`localStorage` (key: `rhd:finnhubKey`). Show a settings affordance to update
or clear it.

**Fallback** if the user can't/won't provide a key: degrade gracefully. Use
the last transaction price per symbol as the mark, show a small badge "Quotes
stale (no API key)" on every position, and disable the daily-move tile.

### 6.2 Benchmark history — Stooq

- For SPY/QQQ daily closes, Stooq exposes free CSV with CORS:
  `https://stooq.com/q/d/l/?s=spy.us&i=d` (and `qqq.us`).
- Fetch once per session, cache in `localStorage` with a 1-day TTL.
- Use to (a) draw the benchmark line on the equity curve, (b) compute beta and
  alpha against SPY, and (c) build the YTD/1Y comparison strip.

### 6.3 Quote refresh policy

- On dashboard load: fetch quotes for all current symbols in parallel (chunk
  to stay under rate limits if >50 symbols).
- Manual "Refresh quotes" button in the header (small, secondary).
- No polling. Markets close, user comes back, prices are stale — fine.

---

## 7. Metrics catalog

> **Every metric below MUST render with a context line beneath it.** The
> context line is shown in a smaller, muted style. Format is shown in
> `«…»` brackets. Implementer fills in the live comparison.

### 7.1 Performance & P&L

| Metric | Formula | Context line |
|---|---|---|
| **Total portfolio value** | `cash + Σ marketValue` | «vs. cost basis $X (+Y%)» |
| **Total return $** | `marketValue + realized + dividends − netInvested` | «over N days since first deposit» |
| **Total return %** | `totalReturn$ / netInvested` | «SPY same period: Z%; QQQ: W%» |
| **Time-weighted return (TWR)** | Geometric link of sub-period returns split at every cash flow | «strips out the effect of deposits — the fairer 'how good is your stock-picking' number» |
| **Money-weighted return (XIRR)** | Newton-Raphson on cashflow series, ending value as final positive flow | «what your dollars actually earned, deposit timing included» |
| **YTD / 1M / 3M / 1Y return** | TWR over the window | «SPY: X% • QQQ: Y%» |
| **Realized P&L** | Σ closed trade pnl | «N closed trades • avg hold M days» |
| **Unrealized P&L** | Σ position unrealized | «across N open positions» |
| **Dividends received** | Σ DIV transactions | «yield on cost: X%» |
| **Today's move $ / %** | Σ (shares · todayChange$) | «SPY today: X%» |
| **Best day / worst day** | Max/min of daily portfolio % change | «SPY worst day same period: Y%» |

### 7.2 Risk metrics

For all rolling/historical risk metrics, build a **daily portfolio value
series** by valuing the held lots at each day's close (use SPY's date scaffold
and forward-fill prices for any symbol Stooq doesn't have — for V1, when a
quote-history endpoint isn't available, derive daily portfolio value only from
realized + cash transactions plus current-marked positions; document the
limitation). If implementer wants more accuracy, add a per-symbol daily close
fetch via Stooq using `s=<symbol>.us`.

| Metric | Formula | Context line |
|---|---|---|
| **Annualized volatility** | `stdev(daily returns) · √252` | «SPY ~15–20%; QQQ ~22–28%; >30% = high vol portfolio» |
| **Sharpe ratio** | `(meanReturn − rf) / stdev`, annualized; `rf` configurable, default 4.5% | «<0 losing to cash • 0–1 suboptimal • 1–2 good • 2+ excellent» |
| **Sortino ratio** | Same as Sharpe but only downside stdev | «like Sharpe but only penalizes losses; >2 is strong» |
| **Max drawdown** | Largest peak-to-trough % decline | «SPY hit −34% in 2020, −25% in 2022 — for reference» |
| **Current drawdown** | `(currentValue / allTimeHigh) − 1` | «0% = at all-time high» |
| **Beta vs SPY** | `cov(rPort, rSpy) / var(rSpy)` over trailing 1Y | «1.0 = moves with market • <1 defensive • >1 amplified» |
| **Alpha vs SPY** | `meanRet − (rf + β·(spyRet − rf))`, annualized | «excess return after adjusting for market exposure» |
| **R² vs SPY** | `corr(rPort, rSpy)²` | «share of variance explained by the market — high R² means you basically own the index» |
| **1-day 95% VaR** | `−1.645 · stdev(daily) · totalValue` (parametric) | «expect to exceed this loss ~1 day in 20» |
| **Tracking error vs SPY** | `stdev(rPort − rSpy) · √252` | «how far your returns wander from SPY; index funds <1%, active 4–8%» |

If trailing 1Y of data isn't available, fall back to "since inception" and
note it in the context line.

### 7.3 Portfolio management metrics

| Metric | Formula | Context line |
|---|---|---|
| **Number of positions** | `count(positions)` | «5–15 is a focused portfolio • 15–30 diversified • 30+ approaches an index fund» |
| **Top position weight** | `max(pctOfPortfolio)` | «>10% = concentrated, >25% = single-name risk» |
| **Top 5 concentration** | `Σ top5 pct` | «<40% diversified • 40–70% concentrated • >70% heavy concentration» |
| **HHI (Herfindahl)** | `Σ wᵢ²` across positions | «<0.10 well-diversified • 0.10–0.25 moderate • >0.25 concentrated» |
| **Effective N** | `1 / HHI` | «equivalent number of equally-weighted positions» |
| **Sector exposure** | `Σ wᵢ` grouped by sector | «vs SPY sector weights — show side-by-side bars» |
| **Cash %** | `cash / totalValue` | «<5% fully invested • 5–20% normal • >20% market-timing exposure» |
| **Average hold time (open)** | mean of (today − lot.acquiredAt) weighted by cost | «long-term capital gains threshold = 365 days» |
| **Average position size** | `totalEquity / nPositions` | «relative to median = how lopsided sizing is» |

### 7.4 Trading-style metrics (closed trades)

| Metric | Formula | Context line |
|---|---|---|
| **Win rate** | `winning closed trades / total closed` | «>50% is good but only meaningful with profit factor» |
| **Profit factor** | `Σ wins / |Σ losses|` | «>1 profitable • >1.5 strong • >2 excellent» |
| **Average win / average loss** | mean P&L per outcome | «ratio >1.5 with 50% win rate is healthy» |
| **Expectancy** | `winRate · avgWin − lossRate · avgLoss` | «average $ per closed trade» |
| **Average hold (closed)** | mean of `closedAt − openedAt` | «<30d = swing • 30–365 = position • >365 = investment» |
| **Short/long-term realized split** | bucket realized P&L by term | «long-term = lower tax rate» |
| **Best / worst trade** | max/min realized P&L | — |

---

## 8. UI / UX

### 8.1 Layout (desktop, 1440px)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  PORTFOLIO            Last refreshed 2m ago · CSV thru May 7, 2026  ⚙   │  ← header
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  $187,432.18                       +$42,318  (+29.2%)   Today +$612    │  ← hero strip
│  Total value                       Total return         (+0.3%)         │
│                                                                         │
│  TWR 24.1% • XIRR 21.8%   SPY 18.4% • QQQ 22.1%  (since 2021-03-14)     │  ← context line
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─ Equity curve ───────────────────────────┐  ┌─ Allocation ─────────┐│
│  │                              ── you      │  │      ◐  donut         ││
│  │                              ── SPY      │  │                       ││
│  │                              ── QQQ      │  │   AAPL    18.2%       ││
│  │   [period: 1M 3M 6M 1Y YTD ALL]          │  │   MSFT    12.4%       ││
│  │                                          │  │   NVDA     9.7%       ││
│  │                                          │  │   …                   ││
│  └──────────────────────────────────────────┘  └───────────────────────┘│
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  RISK                                                                   │
│  ┌────────┬────────┬────────┬────────┬────────┬────────┐               │
│  │ Sharpe │ Sortino│ Vol    │ Beta   │ MaxDD  │ VaR    │  ← metric tiles│
│  │  1.42  │  2.10  │ 23.4%  │  1.18  │ −18.6% │ −$4.2k │               │
│  │ good   │ strong │ above  │ amplif.│ vs SPY │ 1d 95% │  ← context     │
│  │        │        │ market │        │ −34%   │        │               │
│  └────────┴────────┴────────┴────────┴────────┴────────┘               │
│                                                                         │
│  ┌─ Sector exposure ───────────────────────────────────────────────┐   │
│  │  Tech         ████████████████████████  42% (SPY: 28%)          │   │
│  │  Health       ████████  14% (SPY: 13%)                          │   │
│  │  …                                                              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  HOLDINGS                          [search]            [download CSV]  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Symbol  Shares  Avg cost  Price   Mkt val   Unreal P&L   Wt    │   │
│  │ AAPL     120    $147.20   $211.4  $25,368   +$7,704 +44%  18%  │   │
│  │ ...                                                              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  CLOSED TRADES                     [filter: all/winners/losers]        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Symbol  Opened    Closed    Hold    P&L $    P&L %   Term       │   │
│  │ TSLA    2023-04   2024-09   513d    +$2,140  +28%   long       │   │
│  │ ...                                                              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

Vertical rhythm: 6 sections from top to bottom, each separated by a faint
horizontal rule. **No** sidebar nav. Single scroll page. Hash-anchored
section links optional.

### 8.2 Responsive behavior

- **≥1280px**: layout above.
- **768–1279px**: equity curve and allocation stack vertically; risk tiles
  wrap to two rows of three.
- **<768px**: everything stacks into a single column. Holdings + closed
  trades become card lists rather than tables. Hide the sector bar chart
  beneath a "Show details" toggle.

### 8.3 Empty / error states

- No CSV uploaded: full-page drop zone with the brand mark and one line of
  copy. No fake data, no placeholder charts.
- Parse error: keep prior data loaded, surface a non-blocking toast with a
  link to the parser log.
- API key missing: dashboard renders normally, position prices show the
  "stale" badge, and a one-line bar at the top: `"Add a free Finnhub API key
  for live prices →"`.

---

## 9. Design system

### 9.1 Palette (dark monochrome + single accent)

```
Background       --bg          #0A0A0B    near-black
Surface          --surface     #111113    cards / tiles
Surface raised   --surface-2   #17171A    hover, modals
Border           --border      #1F1F23    1px hairlines
Text primary     --text        #ECECEE
Text secondary   --text-2      #9A9AA2
Text muted       --text-3      #5C5C66    context lines, axes

Accent           --accent      #7FE7B6    soft mint — for highlights, focus,
                                          "current" range selectors
Positive         --pos         #4ADE80    P&L gains, up arrows
Negative         --neg         #F87171    P&L losses, down arrows
Warning          --warn        #F5C26B    parse warnings, stale badges
```

Why one accent: the spec calls for monochrome + accent. P&L gets its own
red/green pair because it's semantically required, but **no other UI element
should use red or green**. Buttons, focus rings, range pills, links → mint
accent only. Charts use the accent for "you" and a muted gray for benchmarks.

### 9.2 Type

- **Font**: `Inter Variable` for everything. Tabular figures (`font-feature
  -settings: "tnum"`) on every number.
- Optional: `JetBrains Mono` for the holdings/trades tables — but Inter with
  tabular-nums is enough.
- Scale (rem-based, 1rem=16px):
  - Display 48 / 56 — hero total
  - H1 28 / 36 — section titles ("RISK", "HOLDINGS")
  - H2 18 / 24 — tile titles
  - Body 14 / 22 — default
  - Small 12 / 16 — context lines, axis labels
- All section titles in `font-weight: 500`, `letter-spacing: 0.04em`,
  `text-transform: uppercase`, `--text-2` color.

### 9.3 Spacing & corners

- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64.
- Outer page padding: 32px desktop, 16px mobile.
- Section gap: 48px desktop, 32px mobile.
- Card radius: 12px. Tile radius: 12px. Buttons: 8px.
- Hairline borders only — `1px solid var(--border)`. No drop shadows.

### 9.4 Numbers, signs, color rules

- Always use a non-breaking minus `−` (U+2212) for negative numbers, not `-`.
- Currency uses `$` prefix and grouping commas. Show 2 decimals up to
  $10,000, 0 decimals above.
- Percentages always carry a sign (`+12.4%` / `−3.1%`) where they represent
  a return.
- Color a number red/green only when the sign carries semantic meaning (P&L,
  return). Counts (positions, trades) stay in `--text`.

### 9.5 Charts

- Equity curve: filled area under "you" line in `--accent` at 12% opacity,
  stroke at 100%. SPY/QQQ are 1px gray strokes. Crosshair on hover with a
  small tooltip card pinned to the right gutter.
- Allocation donut: 70% inner radius (it's almost a ring). Slices in
  monochrome shades from `#2A2A2E` to `#ECECEE`, hovered slice fills with
  `--accent`. Legend is a sortable list to the right, not labels on slices.
- Sector bars: horizontal bars, your portfolio in `--accent`, SPY ghost
  bar behind in `--text-3` at 25% opacity for comparison.
- All charts: no gridlines except a single dotted zero line where relevant.
  No legend chrome. Axis labels in `--text-3`, 12px.

---

## 10. Component tree (suggested)

```
src/
  app/
    App.tsx                  // route-less shell
    Header.tsx               // brand, last-refreshed, settings cog
    DropZone.tsx             // page-wide drag handler
    EmptyState.tsx
  sections/
    Hero.tsx                 // total value, total return, today
    PerformanceSection.tsx   // equity curve + period switcher
    AllocationSection.tsx    // donut + legend
    RiskSection.tsx          // 6 metric tiles + sector bars
    HoldingsSection.tsx      // sortable table
    ClosedTradesSection.tsx  // sortable + filterable table
  components/
    MetricTile.tsx           // value + label + context line
    Sparkline.tsx
    Table.tsx                // shared sortable/filterable
    Toast.tsx
    Settings.tsx             // API key, risk-free rate, benchmark toggle
  data/
    csvParser.ts             // PapaParse + normalization
    lotEngine.ts             // FIFO logic
    metrics/
      performance.ts         // total return, TWR, XIRR, period returns
      risk.ts                // sharpe, sortino, beta, vol, dd, var
      portfolio.ts           // concentration, sector, cash
      trades.ts              // win rate, profit factor, expectancy
    quotes.ts                // Finnhub client, cache, batching
    benchmarks.ts            // Stooq client, cache
  store/
    portfolioStore.ts        // Zustand: transactions, snapshot, quotes
    settingsStore.ts         // Zustand: API key, rf rate, benchmarks
  styles/
    tokens.css               // CSS vars from §9.1
  utils/
    money.ts, dates.ts, hash.ts
```

---

## 11. Refresh & persistence

- On CSV drop: write the **raw text** to `localStorage['rhd:csv']` (yes,
  the whole file — even multi-MB CSVs fit comfortably).
- Also persist the **derived snapshot** to `localStorage['rhd:snapshot']`
  so reloads paint instantly without re-parsing. Bust this when a new CSV
  is dropped or when the parser version bumps (track via a `parserVersion`
  string).
- Quotes cached at `localStorage['rhd:quotes']` with per-symbol timestamps;
  re-fetch on dashboard load if older than 15 minutes during market hours,
  else show last cache.
- API key: `localStorage['rhd:finnhubKey']`. Settings panel exposes a
  "Forget key" button.
- A "Replace CSV" button in the header opens the file picker; same as
  drag-drop. A separate "Clear all data" button (destructive style) wipes
  every key under `rhd:`.

---

## 12. Deployment to GitHub Pages

1. `vite.config.ts` → set `base: '/<repo-name>/'`.
2. Add a GitHub Action that runs on push to `main`:
   ```yaml
   # .github/workflows/deploy.yml
   - uses: actions/checkout@v4
   - uses: actions/setup-node@v4
     with: { node-version: 20 }
   - run: npm ci && npm run build
   - uses: peaceiris/actions-gh-pages@v3
     with:
       github_token: ${{ secrets.GITHUB_TOKEN }}
       publish_dir: ./dist
   ```
3. Repo Settings → Pages → Source: `gh-pages` branch.
4. Add a `404.html` that's a copy of `index.html` so deep links and reloads
   work (standard GH Pages SPA workaround).
5. Custom domain optional; not needed for V1.

The repo should contain **no** account data. CSV stays in the user's browser.
Add a `.gitignore` line for `*.csv` defensively.

---

## 13. Edge cases the implementer must handle

- **Symbol changes / mergers**: surface in a banner, don't try to fix
  automatically.
- **Delisted stocks** still in portfolio: quote API returns null → mark
  position as "delisted", show last known price in italics, exclude from
  daily-move calc.
- **Zero deposits** (purely a transfer-in account): TWR/XIRR fall back to
  simple total return; show a tooltip explaining why.
- **Single-day history** (CSV has one trade): suppress Sharpe/Beta/MaxDD —
  show "Need 30+ days of history" copy in those tiles instead of `NaN`.
- **Stocks with >$10k single-day moves**: clamp the daily-move tile so an
  ER day doesn't blow out the layout.
- **CSV has cents-level rounding** that drifts cost basis off by a penny:
  use `decimal.js` for cost-basis math and display rounded.
- **Browser refresh mid-quote-fetch**: store quote-cache writes atomically.

---

## 14. Out of scope (V2 ideas to drop in a `BACKLOG.md` later)

- Options + crypto support.
- Tax-lot optimization picker (HIFO, LIFO toggles).
- Multi-account aggregation (combine Robinhood + Fidelity exports).
- Per-position deep-dive page with daily P&L attribution.
- Theming toggle (light mode).
- Configurable rebalancing target weights with drift alerts.
- Export PDF report.
- Scheduled CSV pickup from email/Drive.

---

## 15. Suggested implementation order for Sonnet

Build in this order — each step yields a working dashboard, just less
complete. Don't try to land it all at once.

1. **Scaffold**: Vite + React + TS + Tailwind + the design tokens from §9.
   Header + empty state with drop zone.
2. **Parser + lot engine**: get to a `PortfolioSnapshot` in the store. Render
   a barebones holdings table from it. (No quotes yet — use last trade
   price.)
3. **Hero + closed trades section**: pure derived data, no API.
4. **Quotes integration**: Finnhub client, settings panel for API key,
   live-mark all positions, today's-move tile.
5. **Benchmarks + equity curve**: Stooq fetch, build daily portfolio value
   series, draw the chart. Period switcher.
6. **Risk section**: Sharpe/Sortino/Vol/MaxDD first (only need portfolio
   series); Beta/Alpha/R²/TE second (need SPY series).
7. **Allocation + sector**: donut, sector bars (sector requires Finnhub
   profile2).
8. **Polish**: empty/error states, mobile breakpoints, parse-log drawer,
   responsive table → card transformation.
9. **Deploy**: GH Action, base path, 404.html.

Each step ships behind a feature flag if helpful, but given there's one user
that's probably overkill — just merge to main.

---

## 16. Acceptance checklist

Before calling V1 done, every item below must be true:

- [ ] Drag a fresh CSV → dashboard updates with no manual intervention.
- [ ] Reload the page → dashboard renders from `localStorage` in <500ms with
      no flash of empty state.
- [ ] Every metric in §7 has a context line; none shows `NaN` or
      `Infinity` for any reasonable input (including a 1-week-old account).
- [ ] Without an API key, the dashboard still loads and is usable.
- [ ] With ~5 years of trades and ~50 symbols, full render is <2s on a
      cold load (after data fetched).
- [ ] All P&L colors only used semantically; rest of UI is monochrome +
      mint accent.
- [ ] Mobile (375px) renders without horizontal scroll and without truncated
      numbers.
- [ ] No data ever leaves the browser except the symbol strings sent to
      Finnhub/Stooq.
- [ ] GitHub Pages URL works for both `/` and a deep reload of any
      hash-anchored section.

— end of spec —
