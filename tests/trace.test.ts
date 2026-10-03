/* The visualization layer must show what the engine actually does. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Data } from "../src/engine/data";
import { Engine } from "../src/engine/engine";
import { loadsAfterRepairEvents, slotsAfterPolishEvents, traceDSatur, tracePipeline } from "../src/engine/trace";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const RefEngine = new Function(readFileSync(here("../reference/engine.js"), "utf8") + "\nreturn Engine;")();
const RefData = new Function("Engine", readFileSync(here("../reference/data.js"), "utf8") + "\nreturn Data;")(RefEngine);

const datasets = [
  Data.sample(),
  Data.original(),
  Data.random({ sections: 10, hours: 26, share: 2, D: 6, P: 6, seed: 1 }),
  Data.random({ sections: 12, hours: 30, share: 3, D: 6, P: 6, seed: 4 }),
  Data.random({ sections: 16, hours: 24, share: 2, D: 5, P: 6, seed: 2 }),
];

describe("trace layer", () => {
  it("Data.original() is exactly the sample in reference/data.js", () => {
    expect(Data.original().courses).toEqual(RefData.sample().courses);
  });

  for (const ds of datasets) {
    it(`${ds.name}: traced DSatur colors every vertex exactly like the engine`, () => {
      const pb = Engine.prepare(ds.courses, ds.D, ds.P);
      const out = Engine.solveAll(pb, 7);
      const tr = traceDSatur(pb);
      expect(tr.ok).toBe(out.dsatur.ok);
      if (!out.dsatur.ok) return;
      expect(Array.from(tr.st.slot)).toEqual(out.dsatur.slot);
      expect(tr.steps.length).toBe(pb.n);
      expect(new Set(tr.steps.map((s) => s.v)).size).toBe(pb.n);
      expect(tr.steps.at(-1)!.peak).toBe(out.dsatur.rooms);
      for (const s of tr.steps) {
        expect(s.avail).toContain(s.t);
        expect(pb.T - s.open).toBeGreaterThanOrEqual(0);
      }
    });

    it(`${ds.name}: traced pipeline = solveAll's first pass, events replay to the same loads`, () => {
      const pb = Engine.prepare(ds.courses, ds.D, ds.P);
      const out = Engine.solveAll(pb, 7);
      const tr = tracePipeline(pb);
      if (!out.ours.ok || !tr) return;
      if (out.ours.restarts === 1) {
        expect(tr.final).toEqual(out.ours.slot);
        expect(tr.startRooms).toBe(out.ours.startRooms);
        expect(tr.repairMoves).toBe(out.ours.moves);
        expect(tr.polishMoves).toBe(out.ours.polishMoves);
      }
      const loads = loadsAfterRepairEvents(pb, tr, tr.repairLog.length);
      expect(Math.max(...loads)).toBe(tr.repairRooms);
      expect(slotsAfterPolishEvents(tr, tr.polishLog.length)).toEqual(tr.final);
      expect(Engine.verify(pb, tr.final, null)).toBeNull();
    });
  }

  it("the original sample really exercises repair and polish", () => {
    const ds = Data.original();
    const tr = tracePipeline(Engine.prepare(ds.courses, ds.D, ds.P))!;
    expect(tr.startRooms).toBe(8);
    expect(tr.repairRooms).toBe(7);
    expect(tr.repairLog.length).toBeGreaterThan(0);
    expect(tr.polishLog.length).toBeGreaterThan(0);
  });
});
