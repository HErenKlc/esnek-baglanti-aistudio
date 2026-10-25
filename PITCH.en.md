# RoomForSun — Flexible Connection Engine · English pitch

Climathon 2026 (Siemens × YGA × UP School) · Hüseyin Eren Kılıç, METU Environmental Engineering
Live tool: **roomforsun.vercel.app** · Code: **github.com/HErenKlc/roomforsun**

---

## 90-second spoken pitch

In Türkiye, between 2024 and 2025, 65% of unlicensed solar and wind applications
were rejected — 11.6 gigawatts — for one reason: no capacity.

But that "no capacity" is not a physical limit. It is an arithmetic choice.
Capacity is allocated by assuming two worst moments happen at once, every hour
of every year: the plant at full output, the substation at its lowest load.
That pair happens for a few hundred hours a year. We size the grid for all 8,760.

So I built a tool that asks a different question. Not "is there capacity",
but: **if an investor accepts being curtailed in those few hours, how many more
megawatts can connect — and what does that curtailment actually cost them?**

It simulates one substation hour by hour: twenty years of real weather,
ten years of real national consumption, and the official TEİAŞ capacity table.
It returns not a single number but a distribution — the typical year and the
bad year, P50 and P90 — because an investor finances the bad year, not the
average one.

Three things make it defensible. First, the headline number assumes nothing
about substation load: it holds even if the substation is empty. Second, every
layer is real published data, and where data does not exist, the interface says
so rather than filling the gap. Third, the model was tested on eight years it
had never seen — including 2020, where it failed, and we report that failure,
because it defines what the risk band does and does not cover.

Türkiye has 794 substations in that table. 346 of them — 43.6% — show zero
remaining capacity today. Each one is a place where this question has never
been asked.

---

## One paragraph

Grid connection capacity in Türkiye is allocated with a static rule that assumes
peak generation and minimum load coincide at all times. RoomForSun replaces
that assumption with an hourly simulation over 20 years of real
weather and 10 years of real demand, and reports how much additional solar can
connect to a "full" substation under a curtailment agreement, together with the
curtailment risk as a P50/P90 distribution. The headline figure is a
load-independent lower bound: it requires no assumption about substation
consumption, so adding load can only increase it. Existing plants are never
curtailed — curtailment applies to the new project first.

---

## What is actually real

| Layer | Source | Status |
|---|---|---|
| Weather (tilted irradiance, temperature, wind) | Open-Meteo ERA5, 2006–2025, 20 years | Real, live |
| Demand shape and uncertainty | EPİAŞ Transparency Platform, national hourly, 2016–2025 (87,623 hours) | Real |
| Substation capacity ceiling and allocation | TEİAŞ official table, 1 Oct 2026, 794 substations, 81 provinces | Official |
| Substation coordinates | OpenStreetMap `power=substation` (≥66 kV), 667 of 794 matched | Open data, province-validated |
| Emission factor | Turkish Ministry of Energy 2023 grid factor; solar lifecycle from IPCC AR5 | Official, low/high scenario |
| Connection line voltage | Short-line formula, validated against pandapower load flow | Engineering check, optional |
| Substation hourly load | Not published anywhere in Türkiye | **The headline number does not use it** |
| N-1, protection, short circuit | — | Deliberately out of scope |

## Validation

**Load model.** Chronological split: 2016–2023 train, 2024 calibrate, 2025 test.
On the unseen 2025 test year, LightGBM quantile regression with conformal
calibration reaches pinball loss 0.00962, P5–P95 coverage 93.3%, P50 MAPE 3.23% —
better than a naive year-ago baseline (5.28% MAPE) and an empirical quantile
table on every metric.

**Eight-year backtest.** Each year predicted by a model that never saw it.
Coverage averages 89.8% across seven years against a 90% target. The exception
is 2020 at 62.9%: that model was trained only on 2016–2018, and no historical
data could have signalled the COVID lockdown demand collapse. We publish this
because it defines the claim — P90 is the bad end of normal climate and demand
variability, not a structural crisis scenario.

**Solar model.** PVWatts and Faiman ported to TypeScript, agreeing with
pvlib-python to 5.6·10⁻¹⁷.

**Voltage formula.** Tested against pandapower Newton-Raphson load flow across
150 cases (3 conductors × 5 distances × 2 power factors × 6 loading levels).
In none of the 25 capacity cases does the closed-form formula return a number
larger than the true load-flow capacity; the worst optimistic voltage deviation
is 0.02 percentage points. The approximation is conservative throughout.

## How this differs from UK flexible connections

UK distribution network operators have offered flexible connections for years,
so the concept is proven. Two differences:

- **Risk as a distribution, not a number.** UKPN's published methodology does
  not define a P50 or P90 curtailment figure. An investor needs the bad year.
- **Depth of data.** UKPN's assessment uses a single year of load. This uses
  10 years of demand and 20 years of weather, so the "bad year" comes from
  observed climate rather than a margin.

## Likely questions

**Isn't this just telling investors to accept less?**
No. These projects are currently rejected outright. The choice is not
"full connection versus curtailed connection" — it is "curtailed connection
versus no connection at all."

**What if the substation load assumption is wrong?**
The headline number never uses it. It is computed as if the substation had no
consumers at all, so real load can only make the answer larger.

**Who gets curtailed first?**
The new project, always. Existing plants keep their contracted capacity
untouched; the simulation verifies this explicitly (existing-plant curtailment
comes out at 0.00 MWh).

**Why not deep learning or a foundation forecasting model?**
On tabular data LightGBM is the practical choice, and the problem needs a
calibrated uncertainty band rather than a sharp point forecast. Off-the-shelf
time-series foundation models target short-horizon point prediction.

**What would it take to deploy this?**
One substation, one distribution company, twelve months. The pilot proposal
is written: `model/epdk_pilot_onerisi.md`. The one thing it needs that we
cannot obtain ourselves is SCADA measurement of substation load — the reader
for it is built and tested, waiting for the file.
