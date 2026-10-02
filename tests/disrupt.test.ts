import { describe, expect, it } from "vitest";
import { Engine } from "../src/engine/engine";
import { Data } from "../src/engine/data";
import { buildBlocks, reschedule, roomClosed, type Disruption, type RescheduleOk } from "../src/engine/disrupt";
import type { Problem, Schedule } from "../src/engine/types";

function solved(d = Data.sample()) {
  const pb = Engine.prepare(d.courses, d.D, d.P);
  const out = Engine.solveAll(pb, 7);
  if (!out.ours.ok) throw new Error("solve failed");
  const base: Schedule = { slot: out.ours.slot, room: Array.from(out.ours.room!), rooms: out.ours.rooms };
  return { pb, base };
}

/** Invariants every successful reschedule must keep. */
function checkResult(pb: Problem, base: Schedule, list: Disruption[], r: RescheduleOk) {
  const { slot, room } = r.schedule;
  expect(r.check).toBeNull();
  expect(Engine.verify(pb, slot, room)).toBeNull();
  expect(r.respectsBlocks).toBe(true);
  const blocks = buildBlocks(pb, list, r.schedule.rooms + 1);
  for (let v = 0; v < pb.n; v++) {
    const s = pb.sessions[v], t = slot[v];
    expect(blocks.sec[t * pb.S + s.sec]).toBe(0);
    expect(blocks.fac[t * pb.F + s.fac]).toBe(0);
    expect(roomClosed(blocks, t, room[v])).toBe(false);
    expect(room[v]).toBeGreaterThanOrEqual(0);
    expect(room[v]).toBeLessThan(r.schedule.rooms);
  }
  // every class not reported as moved is exactly where it was
  const moved = new Set(r.moves.map((m) => m.v));
  for (let v = 0; v < pb.n; v++) if (!moved.has(v)) expect(slot[v]).toBe(base.slot[v]);
  expect(r.moves.length).toBeGreaterThanOrEqual(r.hit - r.roomSwaps.length);
}

describe("disruptions on the sample", () => {
  const { pb, base } = solved();

  it("every teacher out on every day: no clashes, rooms stay at 7", () => {
    let total = 0, worst = 0, extra = 0;
    for (let f = 0; f < pb.F; f++) {
      for (let day = 0; day < pb.D; day++) {
        const list: Disruption[] = [{ kind: "teacher", who: f, day, periods: [] }];
        const r = reschedule(pb, base, list);
        expect(r.ok).toBe(true);
        if (!r.ok) continue;
        checkResult(pb, base, list, r);
        if (r.extraRoom) extra++;
        total += r.moves.length;
        worst = Math.max(worst, r.moves.length);
      }
    }
    console.log(`teacher-out: ${pb.F * pb.D} cases, avg ${(total / (pb.F * pb.D)).toFixed(1)} moved, worst ${worst}, extra room in ${extra}`);
    expect(extra).toBe(0);
  });

  it("every section away for a day", () => {
    for (let s = 0; s < pb.S; s++) {
      for (let day = 0; day < pb.D; day++) {
        const list: Disruption[] = [{ kind: "section", who: s, day, periods: [] }];
        const r = reschedule(pb, base, list);
        expect(r.ok).toBe(true);
        if (r.ok) { checkResult(pb, base, list, r); expect(r.extraRoom).toBe(false); }
      }
    }
  });

  it("every room closed for a day", () => {
    for (let room = 0; room < base.rooms; room++) {
      for (let day = 0; day < pb.D; day++) {
        const list: Disruption[] = [{ kind: "room", who: room, day, periods: [] }];
        const r = reschedule(pb, base, list);
        expect(r.ok).toBe(true);
        if (r.ok) checkResult(pb, base, list, r);
      }
    }
  });

  it("specific periods only touch those periods", () => {
    const list: Disruption[] = [{ kind: "teacher", who: pb.busiestFac, day: 1, periods: [0, 1, 2] }];
    const r = reschedule(pb, base, list);
    expect(r.ok).toBe(true);
    if (r.ok) checkResult(pb, base, list, r);
  });

  it("disruptions stack on top of each other", () => {
    let cur = base;
    const list: Disruption[] = [];
    const steps: Disruption[] = [
      { kind: "teacher", who: 0, day: 1, periods: [] },
      { kind: "room", who: 2, day: 3, periods: [1, 2, 3] },
      { kind: "section", who: 4, day: 4, periods: [] },
      { kind: "teacher", who: pb.busiestFac, day: 2, periods: [] },
    ];
    for (const d of steps) {
      list.push(d);
      const r = reschedule(pb, cur, list);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      checkResult(pb, cur, list, r);
      cur = r.schedule;
    }
  });

  it("is deterministic", () => {
    const list: Disruption[] = [{ kind: "teacher", who: 7, day: 2, periods: [] }];
    const a = reschedule(pb, base, list), b = reschedule(pb, base, list);
    expect(a.ok && b.ok && a.schedule).toEqual(a.ok && b.ok && b.schedule);
  });

  it("impossible blocks fail with a reason and change nothing", () => {
    // CSM-A has 28 classes; blocking 2 whole days leaves 24 periods
    const s = pb.sections.indexOf("CSM-A");
    const list: Disruption[] = [0, 1].map((day) => ({ kind: "section" as const, who: s, day, periods: [] }));
    const r = reschedule(pb, base, list);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/CSM-A has 28 classes a week, but only 24 periods stay open/);
  });
});

describe("disruptions on random colleges", () => {
  for (const g of [
    { sections: 10, hours: 26, share: 2, D: 6, P: 6, seed: 1 },
    { sections: 16, hours: 30, share: 3, D: 6, P: 7, seed: 5 },
    { sections: 6, hours: 20, share: 1, D: 5, P: 5, seed: 2 },
  ]) {
    it(JSON.stringify(g), () => {
      const { pb, base } = solved(Data.random(g));
      for (let f = 0; f < Math.min(pb.F, 12); f++) {
        const list: Disruption[] = [{ kind: "teacher", who: f, day: f % pb.D, periods: [] }];
        const r = reschedule(pb, base, list);
        if (r.ok) checkResult(pb, base, list, r);
        else expect(r.reason.length).toBeGreaterThan(10);
      }
    });
  }
});
