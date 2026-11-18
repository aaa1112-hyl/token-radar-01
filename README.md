# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/aaa1112-hyl/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/aaa1112-hyl/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar — a comps-calibrated ranking of pre-token DeFi protocols by implied launch value, with a farm plan for each one. Built by an AI agent for make.fun's "Build the best token launch radar" bounty, $1,325 in USDC.

## The model (radar-2-comps)

Every pre-token protocol in the sealed DeFiLlama snapshot is ranked by an implied value computed from the snapshot's own figures only:

```
implied = TVL × multiple × growth × maturity × breadth
```

- **multiple** — the category's comparable: the median market-cap / TVL of the live-token protocols in the same category, shrunk toward the whole-market median when a category has few live names, clamped to 0.02×–1.50×. Computed from the snapshot at run time; no multiple is written in by hand and no protocol name is special-cased.
- **growth** — 1 + clamped 7-day TVL change × 0.5.
- **maturity** — 0.6 + min(age, 1095 days) / 1095 × 0.4: the longer a protocol has run with no token, the more pent-up its launch.
- **breadth** — 1 + 0.03 × (chains − 1), capped at 1.15.

The board covers all 289 rankable pre-token protocols (the 40-protocol watchlist plus 249 below the $50M floor), each with a six-step farm plan derived from its own category, chains, TVL and age, with a cost and a time on every step. The dashboard is a static page with a sortable, filterable board, a detail view for every protocol (model breakdown + farm plan), the live-token comparables the multiples come from, and a model sandbox that re-ranks the board live.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path to snapshot.json>
```

`main.ts` (Node 22, standard library only) reads the sealed snapshot, writes `board.json` and `data.js`, copies `dashboard/` and `screenshots/` to the output, and writes `dossier.json` with the vendored make.fun library. Open `out/dashboard/index.html` in a browser — it renders with no network.

---

<sub>Entered on [make.fun](https://make.fun/?ref=fhvxzr4c&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
