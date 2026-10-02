# LOWERBOUND

University Timetable Room Minimizer, built for the DAA hackathon.

> Colleges give every section its own room, so rooms sit empty whenever a section is out.
> We reschedule the same classes into the fewest rooms the week allows, and **prove** no
> schedule can use fewer.

The proof is the pigeonhole bound: `rooms ≥ ⌈total classes ÷ periods per week⌉`. On the
sample college that's `⌈245 ÷ 36⌉ = 7`, and our schedule uses exactly 7, so it is optimal.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine parity + disruption invariants
npm run build      # typecheck + production build into dist/
```

Everything runs in the browser. Fonts are bundled (no network needed on stage), and the
solver uses a fixed seed (7), so the sample always gives the same timetable.

## Two-minute demo

1. **Hero.** "Today" shows one room per section: 9 rooms, 79 empty room-periods (pink hatching).
   The yellow dashed line is the floor, 7 rooms.
2. **Minimize rooms.** Every class slides to its new period and room, the two extra rows
   collapse, the counter rolls 9 → 7 and the 7 gets circled in chalk.
3. **Why 7 is the floor.** The bound, worked out from live numbers, plus the `Engine.verify`
   checks (no section, teacher or room double-booked).
4. **Pick a teacher.** Ask a judge for a name. They're marked absent on their busiest day; only
   the affected classes move (highlighted, with dashed outlines where they were), rooms stay at 7,
   clashes stay at 0, and the Changes panel has copy-ready notices per section and per teacher.
5. **How we got there / conflict graph / timetable** for the algorithm questions.

## How it works

| Step | Where | What |
| --- | --- | --- |
| Problem setup | `src/engine/engine.ts` `prepare` | conflict-graph degrees, edge count, lower bound, infeasibility messages |
| Four solvers | `solveAll` | fill-in-order baseline, Welsh–Powell, DSatur, and ours: DSatur + ejection-chain repair + polish + room assignment |
| Verification | `verify` | returns `null` when nothing is double-booked |
| Disruptions | `src/engine/disrupt.ts` | incremental repair, never a re-solve (below) |

`src/engine/engine.ts` and `src/engine/data.ts` are TypeScript ports of the tested
`reference/engine.js` and `reference/data.js`. The logic is unchanged; `tests/parity.test.ts`
runs both versions on the sample and a grid of random colleges and checks the schedules are
identical. One deliberate fix: `parseCSV` reports the line number as it appears in the pasted
text (the original counted after dropping blank and comment lines).

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
nowhere does it try one extra room, and the UI says so. On the sample, all 138 "teacher out for a
day" cases keep 7 rooms with zero clashes (average 2.5 classes moved, worst 8), in a few
milliseconds each.

## Layout

```
src/
  engine/      engine.ts, data.ts (ports), disrupt.ts, solver.worker.ts, types.ts
  components/  Hero (matrix + the moment), Matrix, Counter, Disruptions, Proof,
               Methods, ConflictGraph, Timetable, DataDialog
  lib/         labels, notices, solution, hooks
  styles/      app.css (chalkboard + ledger-paper themes)
reference/     the original engine.js and data.js, used by the parity test
tests/         parity.test.ts, disrupt.test.ts
```

Random datasets: "ours" restarts with seeded randomness until it hits the floor or a time
budget runs out. When the floor is reached on the first pass (as on the sample) the result
doesn't depend on machine speed; on very hard random instances the number of restarts, and so
the result, can.
