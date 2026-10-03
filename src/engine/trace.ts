/* Visualization layer around the engine. Nothing here changes how a timetable is
 * solved:
 * - traceDSatur is a step-recording copy of the engine's runDSatur (first pass, no
 *   randomness). It uses the engine's own feasible / chooseMinLoad / place, and
 *   tests/trace.test.ts checks it colors every vertex exactly like Engine.solveAll.
 * - tracePipeline then runs the engine's real repair() and polish() on that coloring
 *   with their built-in event logs switched on (solveAll passes null), which is the
 *   same first pass solveAll makes before any seeded restart. */
import { internals, type LogEntry } from "./engine";
import type { Problem, State } from "./types";

const { makeState, feasible, place, maxLoad, countRepeats, chooseMinLoad, repair, polish } = internals;

export interface DStep {
  /** the vertex DSatur picked */
  v: number;
  /** periods still open to v when it was picked (saturation = T − open) */
  open: number;
  deg: number;
  /** other uncoloured vertices with the same saturation and degree (lowest index wins) */
  tied: number;
  /** periods v could take: no section or teacher clash */
  avail: number[];
  /** load of each available period just before the choice */
  availLoad: number[];
  /** period chosen: least loaded available one, a same-day repeat counting +1.5 */
  t: number;
  /** busiest period after this step = rooms needed so far */
  peak: number;
}

export interface DSaturTrace {
  ok: boolean;
  steps: DStep[];
  st: State;
  failed?: number;
}

export function traceDSatur(pb: Problem): DSaturTrace {
  const st = makeState(pb);
  const n = pb.n, T = pb.T;
  const open = new Int32Array(n).fill(T);
  const placed = new Uint8Array(n);
  const stamp = new Int32Array(n);
  let tick = 0, peak = 0;
  const steps: DStep[] = [];
  for (let step = 0; step < n; step++) {
    // same selection as runDSatur with rng = null: fewest open periods, then highest degree, then lowest index
    let v = -1;
    for (let u = 0; u < n; u++) {
      if (placed[u]) continue;
      if (v < 0 || open[u] < open[v] || (open[u] === open[v] && pb.sessions[u].deg > pb.sessions[v].deg)) v = u;
    }
    let tied = 0;
    for (let u = 0; u < n; u++) {
      if (!placed[u] && u !== v && open[u] === open[v] && pb.sessions[u].deg === pb.sessions[v].deg) tied++;
    }
    const avail: number[] = [], availLoad: number[] = [];
    for (let t = 0; t < T; t++) if (feasible(pb, st, v, t)) { avail.push(t); availLoad.push(st.load[t]); }
    const t = chooseMinLoad(pb, st, v, null);
    if (t < 0) return { ok: false, steps, st, failed: v };
    const openAtPick = open[v];
    tick++;
    const s = pb.sessions[v];
    const touch = (u: number) => {
      if (placed[u] || u === v || stamp[u] === tick) return;
      stamp[u] = tick;
      if (feasible(pb, st, u, t)) open[u]--;
    };
    pb.secMembers[s.sec].forEach(touch);
    pb.facMembers[s.fac].forEach(touch);
    place(pb, st, v, t);
    placed[v] = 1;
    peak = Math.max(peak, st.load[t]);
    steps.push({ v, open: openAtPick, deg: s.deg, tied, avail, availLoad, t, peak });
  }
  return { ok: true, steps, st };
}

export type RepairEvent =
  | { kind: "move"; v: number; from: number; to: number }
  | { kind: "eject"; v: number; from: number; to: number; u: number; uTo: number };
export type PolishEvent =
  | { kind: "polish"; v: number; from: number; to: number }
  | { kind: "polish-swap"; v: number; from: number; to: number; u: number; uTo: number };

export interface PipelineTrace {
  dsatur: DStep[];
  afterDSatur: number[];
  startRooms: number;
  repairLog: RepairEvent[];
  repairMoves: number;
  afterRepair: number[];
  repairRooms: number;
  repeatsBeforePolish: number;
  polishLog: PolishEvent[];
  polishMoves: number;
  final: number[];
  rooms: number;
  repeats: number;
}

export function tracePipeline(pb: Problem): PipelineTrace | null {
  const d = traceDSatur(pb);
  if (!d.ok) return null;
  const st = d.st;
  const afterDSatur = Array.from(st.slot);
  const startRooms = maxLoad(st);
  const repairLog: LogEntry[] = [];
  const repairMoves = repair(pb, st, null, repairLog);
  const afterRepair = Array.from(st.slot);
  const repairRooms = maxLoad(st);
  const repeatsBeforePolish = countRepeats(pb, st);
  const polishLog: LogEntry[] = [];
  const polishMoves = polish(pb, st, polishLog);
  return {
    dsatur: d.steps,
    afterDSatur,
    startRooms,
    repairLog: repairLog as unknown as RepairEvent[],
    repairMoves,
    afterRepair,
    repairRooms,
    repeatsBeforePolish,
    polishLog: polishLog as unknown as PolishEvent[],
    polishMoves,
    final: Array.from(st.slot),
    rooms: maxLoad(st),
    repeats: countRepeats(pb, st),
  };
}

/** Period loads after replaying the first `upto` repair events on the DSatur coloring. */
export function loadsAfterRepairEvents(pb: Problem, tr: PipelineTrace, upto: number) {
  const load = new Array(pb.T).fill(0);
  for (const t of tr.afterDSatur) load[t]++;
  for (const e of tr.repairLog.slice(0, upto)) {
    load[e.from]--;
    load[e.to]++;
    if (e.kind === "eject") {
      load[e.to]--;
      load[e.uTo]++;
    }
  }
  return load;
}

/** Slots after replaying the first `upto` polish events on the repaired coloring. */
export function slotsAfterPolishEvents(tr: PipelineTrace, upto: number) {
  const slot = tr.afterRepair.slice();
  for (const e of tr.polishLog.slice(0, upto)) {
    slot[e.v] = e.to;
    if (e.kind === "polish-swap") slot[e.u] = e.uTo;
  }
  return slot;
}
