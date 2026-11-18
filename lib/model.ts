// Token radar, model radar-2: a comps-calibrated implied value.
//
// The board ranks every pre-token protocol the snapshot carries (the watchlist is the
// floor, never the ceiling). A protocol is pre-token when its record carries no token
// at all: no market cap, no CoinGecko id, no symbol. Live-token protocols are kept
// apart: the board shows the market's own values for them, never a model's.
//
// Implied value follows only from the snapshot's own figures, in four factors:
//
//   multiple   = the category's comparable multiple: the median market-cap / TVL of
//                the live-token protocols in the same category, shrunk toward the
//                whole-market median when the category has few live names, clamped
//                to [0.02, 1.50]. It is computed from the snapshot at run time; no
//                multiple is written in by hand and no protocol name is special-cased.
//   growth     = 1 + clamp(change_7d, -60, 120) / 100 * 0.5
//   maturity   = 0.6 + min(age_days, 1095) / 1095 * 0.4   (age unknown: 365 days)
//   breadth    = 1 + 0.03 * min(chains - 1, 5)            (more chains, wider reach)
//   implied    = max(1, round(tvl_usd * multiple * growth * maturity * breadth))
//
// Why this shape: a token's launch value is what the market already pays for the
// same kind of business. A lending protocol's token trades at a different multiple
// of TVL than a DEX's, so the multiple comes from the category's own live names,
// not one number for the whole market. Growth says whether the TVL is arriving or
// leaving; maturity says how long the protocol has run with no token (the longer it
// has waited, the more pent-up the launch); breadth says how many chains its users
// already sit on. Every factor is stated in the dashboard, and the sandbox there
// lets a reader move the growth weight and re-rank the board live.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may move them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_per_chain: number;
  breadth_max: number;
  multiple_floor: number;
  multiple_cap: number;
  shrink_prior: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  breadth_per_chain: 0.03,
  breadth_max: 1.15,
  multiple_floor: 0.02,
  multiple_cap: 1.5,
  shrink_prior: 3,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2-comps';

/** A live-token protocol, for the dashboard's comps view. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  multiple: number | null;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    multiple: number;
    multiple_n: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** One compact dashboard row, as an array: [rank, slug, name, category, chains, tvl, chg, age, implied, multiple, growthMult, maturityMult, breadthMult, watchlist]. */
export type CompactRow = [
  number,
  string,
  string,
  string | null,
  string,
  number,
  number | null,
  number | null,
  number,
  number,
  number,
  number,
  number,
  number,
];

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  total_implied_usd: number;
  median_multiple: number;
  comps: { category: string; n: number; median: number; multiple: number }[];
  rows: CompactRow[];
  live: [string, string, string | null, string, number, number, number | null, number][];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list of numbers. */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories the house's watchlist rule leaves out: a wrapped, staked or bridged product of a token that already trades is not a launch of its own. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchange names a protocol name must not begin with, per the same rule. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: pre-token, and not a wrapped, staked
 * or bridged product of a token that already trades, by the house's own watchlist
 * rule — its category is none of the excluded ones, its name carries no whole word
 * wrapped, staked or staking, it does not begin with an exchange's name, and it is
 * not a versioned pool. The rule is the same for every row, watchlist or early, so
 * a wrapped bitcoin or a bridge can never top a board about tokens that do not exist yet.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return false;
  if (EXCHANGE_PREFIXES.some((x) => p.name.startsWith(x))) return false;
  return true;
}

/**
 * The comparable multiples, computed from the snapshot's own live-token protocols:
 * for each category, the median market-cap / TVL of its live names, shrunk toward the
 * whole-market median when the category has few live names, clamped to the model's
 * floor and cap. Categories with no live name at all take the whole-market median.
 */
export function computeMultiples(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
): { overall: number; byCategory: Map<string, { n: number; median: number; multiple: number }> } {
  const live = snapshot.protocols.filter((p) => !isPreToken(p) && p.tvl_usd > 0 && p.mcap_usd !== null && p.mcap_usd > 0);
  const overall = median(live.map((p) => p.mcap_usd! / p.tvl_usd));
  const byCat = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? 'Other';
    const list = byCat.get(key) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    byCat.set(key, list);
  }
  const byCategory = new Map<string, { n: number; median: number; multiple: number }>();
  for (const [cat, values] of byCat) {
    const med = median(values);
    const n = values.length;
    const shrunk = (n * med + model.shrink_prior * overall) / (n + model.shrink_prior);
    const multiple = Math.min(model.multiple_cap, Math.max(model.multiple_floor, shrunk));
    byCategory.set(cat, { n, median: round4(med), multiple: round4(multiple) });
  }
  return { overall: round4(overall), byCategory };
}

/** The four factors and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  multiple: number,
  model: ModelConstants = MODEL,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const breadthMult = Math.min(model.breadth_max, 1 + model.breadth_per_chain * Math.max(0, protocol.chains.length - 1));
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * growthMult * maturityMult * breadthMult));
  return { implied, growthPct, growthMult, maturityMult, breadthMult, age };
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's main farming action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Supply $${capital} of USDC to ${name} on ${chain}, then borrow $20 against it and repay it the same week so the position shows both sides.`;
  if (c.includes('dex') || c.includes('liquidity manager'))
    return `Add $${capital} of liquidity to ${name}'s deepest pool on ${chain} and make one swap through it each week.`;
  if (c.includes('yield') || c.includes('leveraged farm'))
    return `Deposit $${capital} into ${name}'s highest-yield vault on ${chain} and top it up by $10 every week.`;
  if (c.includes('bridge') || c.includes('cross chain'))
    return `Bridge $${capital} of USDC to ${chain} through ${name}, then use the bridged funds in its app instead of bridging straight back.`;
  if (c.includes('staking') || c.includes('restak') || c.includes('staking pool'))
    return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token in the same wallet.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options'))
    return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged trade, closing it before the week ends.`;
  if (c.includes('prediction'))
    return `Fund $${capital} on ${name} and place one small position in a market that settles within the week.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('onchain capital'))
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares in the same wallet.`;
  if (c.includes('stable'))
    return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it for the full window.`;
  if (c.includes('rwa'))
    return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} through ${name} and hold it.`;
  if (c.includes('insurance'))
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active for the full window.`;
  if (c.includes('farm'))
    return `Deposit $${capital} into ${name}'s main farm on ${chain} and claim and re-stake the rewards once a week.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and use its main feature once a week.`;
}

/** A second weekly action, so the plan is a routine rather than a single deposit. */
function weeklyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('dex') || c.includes('liquidity manager')) return 'Swap $10 through the pool and add the fees back to the position.';
  if (c.includes('lend') || c.includes('cdp')) return 'Adjust the borrow by $10 and repay it, so the account shows fresh activity.';
  if (c.includes('perpetual') || c.includes('derivative')) return 'Open and close one small trade so the account shows weekly volume.';
  if (c.includes('bridge')) return 'Bridge $10 back and forth once, keeping the main funds on the destination chain.';
  if (c.includes('prediction')) return 'Settle one market and open the next, keeping a position live every week.';
  return 'Make one qualifying action, such as a deposit, a swap, a vote or a claim.';
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is
 * derived from the protocol's own record (category, chains, TVL, age), never from a
 * hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const weekly = weeklyFor(p);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `${weekly} Do it on the same day each week so the activity forms a regular pattern.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; comps: { category: string; n: number; median: number; multiple: number }[]; overall: number } {
  const { overall, byCategory } = computeMultiples(snapshot, model);
  const comps = [...byCategory.entries()]
    .map(([category, v]) => ({ category, n: v.n, median: v.median, multiple: v.multiple }))
    .sort((a, b) => b.n - a.n || (a.category < b.category ? -1 : 1));
  const multipleFor = (p: SnapshotProtocol): { multiple: number; n: number } => {
    const entry = byCategory.get(p.category ?? 'Other');
    if (entry !== undefined) return { multiple: entry.multiple, n: entry.n };
    return { multiple: Math.min(model.multiple_cap, Math.max(model.multiple_floor, overall)), n: 0 };
  };
  // The watchlist is the floor: every slug, and every other rankable pre-token protocol.
  const chosen = snapshot.protocols.filter((p) => snapshot.watchlist.includes(p.slug) || isRankable(p));
  const scored = chosen.map((p) => {
    const { multiple, n } = multipleFor(p);
    const v = impliedValue(p, snapshot.as_of, multiple, model);
    return { p, multiple, n, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const board: BoardRow[] = scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      multiple: s.multiple,
      multiple_n: s.n,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
  return { board, comps, overall };
}

/** The live-token protocols, by market cap, for the dashboard's comps view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX' && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      multiple: round4(p.mcap_usd! / p.tvl_usd),
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const { board, comps, overall } = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const total = board.reduce((n, r) => n + r.implied_value_usd, 0);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    total_implied_usd: total,
    median_multiple: overall,
    comps,
    rows: board.map((r): CompactRow => [
      r.rank,
      r.slug,
      r.name,
      r.category,
      r.chains.join('|'),
      r.tvl_usd,
      r.change_7d,
      r.age_days,
      r.implied_value_usd,
      r.model.multiple,
      r.model.growth_multiplier,
      r.model.maturity_multiplier,
      r.model.breadth_multiplier,
      snapshot.watchlist.includes(r.slug) ? 1 : 0,
    ]),
    live: live.map((p): [string, string, string | null, string, number, number, number | null, number] => [
      p.slug,
      p.name,
      p.category,
      p.chains.join('|'),
      p.tvl_usd,
      p.mcap_usd ?? 0,
      p.change_7d,
      p.multiple ?? 0,
    ]),
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
