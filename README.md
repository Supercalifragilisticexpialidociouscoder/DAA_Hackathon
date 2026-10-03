# LOWERBOUND

University Timetable Room Minimizer, built for the DAA hackathon.

> Colleges give every section its own room, so rooms sit empty whenever a section is out.
> We reschedule the same classes into the fewest rooms the week allows, and **prove** no
> schedule can use fewer.

The proof is the pigeonhole bound: `rooms ≥ ⌈total classes ÷ periods per week⌉`. On the
university sample that's `⌈702 ÷ 36⌉ = 20`, and our schedule uses exactly 20, so it is optimal.

## The university sample

One semester across six branches, 27 sections, 6 days × 6 periods, 49 fictional faculty.
CSE-G and CSE-H are always taught together, so they are one section, `CSE-G+H` (the data model
has no separate notion of combined sections: a section is one group of students who attend
together, so a combined group is simply one section).

| Branch | Sections | Subjects (hours a week) |
| --- | --- | --- |
| CSE | A, B, C, D, E, F, G+H | P&S 5, DE 5, DAA 5, BWD 5, ACS 3, LRAS 3 |
| CSE-DS | A–F | same six |
| CSM | A–H | same six |
| ECE | A, B, C | Electronic Circuit Analysis 5, Analog and Digital Communications 5, Linear and Digital IC Applications 4, Electromagnetic Fields and Waves 4, Signals and Systems 4, Probability Theory and Stochastic Processes 4 |
| IoT/R&AI | 1 section | Sensors and Actuators 5, Embedded Systems 5, Introduction to Robotics 4, Artificial Intelligence Fundamentals 4, Wireless Sensor Networks 4, Control Systems for Robotics 4 |
| BBA | A, B | Financial Management 5, Marketing Management 5, Human Resource Management 4, Organisational Behaviour 4, Business Statistics 4, Business Communication 4 |

The six common subjects are Probability and Statistics (P&S), Digital Electronics (DE), Design
and Analysis of Algorithms (DAA), Backend Web Development (BWD), Advanced Communication Skills
(ACS) and Logical Reasoning and Analytical Skills (LRAS). Every section has 26 classes a week.

Faculty are shared the way a department allocates them: each P&S, DE, DAA and BWD teacher takes
3 of the 21 CSE/CSE-DS/CSM sections (grouped differently per subject, often across those three
branches), each ACS and LRAS trainer takes 3–5, and most ECE and BBA teachers take every section
of their subject. Seven teach across branch groups: two ECE faculty also teach IoT/R&AI (Embedded
Systems, Sensors and Actuators); a DE teacher and a P&S teacher also teach ECE (Signals and
Systems, PTSP); a maths teacher covers ECE's PTSP and BBA's Business Statistics; a CSM DAA teacher
takes IoT/R&AI's AI course; and an English trainer takes BBA's Business Communication. Loads run
from 4 to 19 classes a week; the full allocation is in `src/engine/data.ts`.

What the solver produces on it (seed 7, all numbers from `npm test` and the running app):

| | |
| --- | --- |
| Classes a week | 702 (27 sections × 26) |
| Periods a week | 36 |
| Conflict graph | 702 vertices, 12,345 edges (8,775 from shared sections, the rest from shared teachers) |
| Floor ⌈702 ÷ 36⌉ | 20 rooms |
| Today, one room per section | 27 rooms, 270 empty room-periods |
| Fill in order / Welsh–Powell / DSatur / ours | 27 / 20 / 20 / 20 rooms |
| Ours | 20 rooms, gap 0, 18 empty room-periods, 0 same-subject repeats, 85 room changes a week |
| `Engine.verify` | `null`: 0 section, 0 teacher, 0 room clashes |

On this dataset DSatur's first pass already reaches the floor, so the repair and polish steps
make 0 moves. The original 245-class sample (in `reference/data.js`, still used by the parity
test) is the one that exercises them: DSatur 8, repair 4 moves to 7. Room capacity isn't modelled,
so the combined CSE-G+H class needs one room like any other section.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # parity, dataset, trace and disruption suites
npm run build      # typecheck + production build into dist/
```

Everything runs in the browser. Fonts are bundled (no network needed on stage), and the
solver uses a fixed seed (7), so the sample always gives the same timetable.

## The website

The page is a DAA project defence, top to bottom. The hero gives the result: classes n,
periods T, rooms used, lower bound ⌈n ÷ T⌉, the gap, and the live `Engine.verify` output. A
**Run LOWERBOUND** animation shows the baseline (one room per section) becoming the solved
timetable. Then come 13 numbered sections:

| # | Section | What it shows (all from the live data) |
| --- | --- | --- |
| 1 | The problem is graph coloring | Class → vertex, clash → edge, period → color, rooms → largest color class; three real classes as an example |
| 2 | Why 20 is the minimum | 702 ÷ 36 = 19.50…, rounded up to 20; 19 × 36 = 684 is 18 short; a room-count slider with a pigeonhole grid |
| 3 | The conflict graph | Every class as a dot; hover one to draw its real section and teacher edges and see its degree |
| 4 | DSatur, step by step | Play, step or scrub through all 702 DSatur choices: saturation, degree, ties, available periods, the period chosen |
| 5 | Method comparison | Fill in order, Welsh–Powell, DSatur, LOWERBOUND on the same input, with each one's classes-per-period profile |
| 6 | Repair | The engine's real repair events, including an ejection chain, with the busiest period before and after |
| 7 | Polish | The engine's real polish moves removing same-subject-twice-a-day repeats, before and after |
| 8 | Room assignment | Color-class size per period; click a period to see its classes and rooms |
| 9 | Verification and proof | Formal checks, a live `verify()` run, buttons that break the timetable on purpose so `verify` catches it, and the feasible-vs-optimal proof |
| 10 | Complexity | DSatur O(n² + E), space O(n + T·(S + F) + C·D), every stage with measured times |
| 11 | Incremental repair | Mark a teacher, room or section unavailable; only affected classes move; affected / moved / untouched / rooms / verify |
| 12 | The final timetable | By section, teacher or room; copy as CSV |
| 13 | Technical details | Architecture, testing, limitations, source |

Nothing is faked. The DSatur steps come from a step-recording copy of the engine's DSatur
(`src/engine/trace.ts`). It uses the engine's own feasibility and period-choice functions, and
`tests/trace.test.ts` checks it colors every vertex exactly like `Engine.solveAll`. Repair and
polish events come from the engine's own `repair()` and `polish()`, run with their built-in event
logs switched on. On the university sample DSatur already reaches the floor, so those two stages
make no moves. The Repair and Polish sections say so, then let you switch to the original
245-class sample and to a random 16-section week, where the same code does real work.

## Two-minute demo

1. **Hero.** Read the strip: 702 classes, 36 periods, 20 rooms, lower bound 20, gap 0, verified.
   Click **Run LOWERBOUND**: the 27-room baseline collapses to 20 and the 20 is circled.
2. **Why 20.** 19 rooms × 36 periods = 684 < 702, so 19 is impossible; drag the slider to show it.
3. **Graph and DSatur.** Hover a class in the conflict graph, then play DSatur and stop on a step.
4. **Proof.** Run `verify()`, then "Double-book a teacher" to show it catches a clash.
5. **Incremental repair.** Ask a judge for a teacher name; only the affected classes move, rooms
   stay at 20.

## How it works

| Step | Where | What |
| --- | --- | --- |
| Problem setup | `src/engine/engine.ts` `prepare` | conflict-graph degrees, edge count, lower bound, infeasibility messages |
| Four solvers | `solveAll` | fill-in-order baseline, Welsh–Powell, DSatur, and ours: DSatur + ejection-chain repair + polish + room assignment |
| Verification | `verify` | returns `null` when nothing is double-booked |
| Disruptions | `src/engine/disrupt.ts` | incremental repair, never a re-solve (below) |
| Visualization layer | `src/engine/trace.ts` | traced DSatur; repair/polish with event logs; replay helpers |

`src/engine/engine.ts` and `src/engine/data.ts` are TypeScript ports of the tested
`reference/engine.js` and `reference/data.js`. The logic is unchanged; `tests/parity.test.ts`
runs both versions on the original sample, the university sample and a grid of random colleges
and checks the schedules are identical. Two deliberate changes: `parseCSV` reports the line
number as it appears in the pasted text (the original counted after dropping blank and comment
lines), and `sample()` returns the university dataset above instead of the original one
(which is still available as `Data.original()`). The engine also exports its stage functions
(`chooseMinLoad`, `repair`, `polish`, `assignRooms`) unchanged, for the visualization layer.

### Disruption mode

A disruption (teacher unavailable, room closed, section away; a whole day or chosen periods) is
stored as blocked slots. Starting from the current timetable:

1. Take out only the classes that sit in a now-blocked period, plus, in periods that have run
   out of open rooms, the classes in the closed room.
2. Mark the blocked periods as busy in the engine's own section/teacher busy maps, so the
   engine's `feasible` check keeps everyone out of them.
3. Put each displaced class back, most constrained first: a free period if one exists, otherwise
   an ejection chain (take the period, push the one or two classes in the way elsewhere), the
   same move the repair step uses, deepening up to 3 links. Each chain is journaled and rolled
   back exactly if it fails.
4. Rooms: a class that kept its period keeps its room; moved classes prefer their section's room
   from the neighbouring period, then the section's usual room.

Priorities: zero clashes, no more rooms than before, fewest classes moved. Only if a class fits
nowhere does it try one extra room, and the UI says so. On the university sample, all 294
"teacher out for a whole day" cases (49 teachers × 6 days) keep 20 rooms with zero clashes
(average 2.6 classes moved, worst 6; 6 cases move nothing because that teacher has no class that
day), in under a millisecond each. All 162 "section away" and 120 "room closed" whole-day cases
also keep 20 rooms. Marking any teacher out on their busiest day always moves at least one class.

## Layout

```
src/
  engine/      engine.ts, data.ts (ports), disrupt.ts, trace.ts, solver.worker.ts, types.ts
  components/  Hero, Model, Bound, ConflictGraph, Playground, Methods, Repair, Polish, Rooms,
               Verification, Complexity, Incremental, Timetable, Technical
               (+ Matrix, Counter, Disruptions, DataDialog, Section)
  lib/         labels, notices, solution, hooks, ring (graph layout), demos (harder instances)
  styles/      app.css (chalkboard + ledger-paper themes)
reference/     the original engine.js and data.js, used by the parity and trace tests
tests/         parity, sample, trace and disruption suites (npm test)
```

Random datasets: "ours" restarts with seeded randomness until it hits the floor or a time
budget runs out. When the floor is reached on the first pass (as on the sample) the result
doesn't depend on machine speed; on very hard random instances the number of restarts, and so
the result, can.
