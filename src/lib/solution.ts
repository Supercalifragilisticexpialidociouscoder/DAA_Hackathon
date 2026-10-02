import { Engine } from "../engine/engine";
import type { Dataset, MethodOk, Problem, Schedule, SolveAll } from "../engine/types";
import { subjectCodes } from "./labels";

export const SEED = 7;

export interface Solution {
  dataset: Dataset;
  pb: Problem;
  out: SolveAll;
  ours: MethodOk;
  /** today: the fill-in-order timetable, one room per section */
  before: Schedule;
  /** our minimized timetable */
  after: Schedule;
  codes: string[];
}

export type SolveOutcome = { ok: true; solution: Solution } | { ok: false; errors: string[] };

/** Turns raw solver output into what the UI needs, or explains why it failed. */
export function buildSolution(dataset: Dataset, pb: Problem, out: SolveAll): SolveOutcome {
  if (!out.ours.ok) {
    const failed = [out.dsatur, out.welsh, out.manual].find((r) => !r.ok && r.failed !== undefined);
    if (failed && !failed.ok && failed.failed !== undefined) {
      const s = pb.sessions[failed.failed];
      const c = pb.courses[s.course];
      return {
        ok: false,
        errors: [
          `No clash-free timetable found. The solver ran out of periods for ${c.section}'s ${c.subject} class with ${c.faculty}: by then, every one of the ${pb.T} periods already had ${c.section} or ${c.faculty} busy.`,
          `Try more periods per day, fewer classes for ${c.section}, or give some of ${c.faculty}'s sections to another teacher.`,
        ],
      };
    }
    return { ok: false, errors: ["No clash-free timetable was found for this data."] };
  }
  const ours = out.ours;
  const baseline = [out.manual, out.welsh, out.dsatur, out.ours].find((r): r is MethodOk => r.ok)!;
  const before: Schedule = {
    slot: baseline.slot,
    room: pb.sessions.map((s) => s.sec),
    rooms: pb.S,
  };
  const after: Schedule = { slot: ours.slot, room: Array.from(ours.room!), rooms: ours.rooms };
  return { ok: true, solution: { dataset, pb, out, ours, before, after, codes: subjectCodes(pb) } };
}

export function solveNow(dataset: Dataset): SolveOutcome {
  const pb = Engine.prepare(dataset.courses, dataset.D, dataset.P);
  if (pb.problems.length) return { ok: false, errors: pb.problems };
  return buildSolution(dataset, pb, Engine.solveAll(pb, SEED));
}

/** Solves off the main thread so big random colleges never freeze the page. */
export function solveInWorker(dataset: Dataset): Promise<SolveOutcome> {
  const pb = Engine.prepare(dataset.courses, dataset.D, dataset.P);
  if (pb.problems.length) return Promise.resolve({ ok: false, errors: pb.problems });
  if (pb.n === 0) return Promise.resolve({ ok: false, errors: ["There are no classes to schedule."] });
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("../engine/solver.worker.ts", import.meta.url), { type: "module" });
    } catch {
      resolve(solveNow(dataset));
      return;
    }
    worker.onmessage = (e: MessageEvent<{ out: SolveAll }>) => {
      worker.terminate();
      resolve(buildSolution(dataset, pb, e.data.out));
    };
    worker.onerror = () => {
      worker.terminate();
      resolve(solveNow(dataset));
    };
    worker.postMessage({ courses: dataset.courses, D: dataset.D, P: dataset.P, seed: SEED });
  });
}

/** Room-periods with nobody in them. */
export const emptyRoomPeriods = (pb: Problem, rooms: number) => rooms * pb.T - pb.n;
