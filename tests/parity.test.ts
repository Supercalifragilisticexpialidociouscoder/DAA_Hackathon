/* The TypeScript engine must behave exactly like the tested reference/engine.js. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Engine } from "../src/engine/engine";
import { Data } from "../src/engine/data";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
// The reference files are classic scripts that define globals; load them as such.
const RefEngine = new Function(readFileSync(here("../reference/engine.js"), "utf8") + "\nreturn Engine;")();
const RefData = new Function("Engine", readFileSync(here("../reference/data.js"), "utf8") + "\nreturn Data;")(RefEngine);

const strip = (r: Record<string, unknown>) => {
  const { ms: _ms, room, ...rest } = r;
  return { ...rest, room: room ? Array.from(room as ArrayLike<number>) : undefined };
};

function compare(courses: unknown[], D: number, P: number) {
  const a = Engine.prepare(courses as never, D, P);
  const b = RefEngine.prepare(courses, D, P);
  expect(a.lb).toBe(b.lb);
  expect(a.edges).toBe(b.edges);
  expect(a.problems).toEqual(b.problems);
  expect(a.sessions).toEqual(b.sessions);
  if (a.problems.length) return;
  const x = Engine.solveAll(a, 7);
  const y = RefEngine.solveAll(b, 7);
  for (const k of ["manual", "welsh", "dsatur"] as const) expect(strip(x[k] as never)).toEqual(strip(y[k]));
  // "ours" restarts until a time budget runs out when the bound is hard to hit,
  // so only compare when both runs did the same number of restarts.
  if (x.ours.ok && y.ours.ok && x.ours.restarts === y.ours.restarts) expect(strip(x.ours as never)).toEqual(strip(y.ours));
  if (x.ours.ok) expect(Engine.verify(a, x.ours.slot, x.ours.room)).toBeNull();
}

describe("engine parity with reference/engine.js", () => {
  it("sample: identical schedules, 9 → 8 → 8 → 7 rooms, floor 7", () => {
    const s = Data.sample();
    expect(s).toEqual(RefData.sample());
    compare(s.courses, s.D, s.P);
    const pb = Engine.prepare(s.courses, s.D, s.P);
    const out = Engine.solveAll(pb, 7);
    const rooms = [out.manual, out.welsh, out.dsatur, out.ours].map((r) => (r.ok ? r.rooms : -1));
    expect(rooms).toEqual([9, 8, 8, 7]);
    expect(pb.lb).toBe(7);
    expect(pb.n).toBe(245);
    expect(pb.T).toBe(36);
  });

  const grid = [
    { sections: 4, hours: 12, share: 1, D: 5, P: 4, seed: 1 },
    { sections: 10, hours: 26, share: 2, D: 6, P: 6, seed: 1 },
    { sections: 12, hours: 30, share: 3, D: 6, P: 6, seed: 4 },
    { sections: 16, hours: 24, share: 2, D: 5, P: 6, seed: 2 },
    { sections: 24, hours: 36, share: 4, D: 6, P: 8, seed: 3 },
    { sections: 8, hours: 36, share: 1, D: 5, P: 6, seed: 9 },
  ];
  for (const g of grid) {
    it(`random ${JSON.stringify(g)}`, () => {
      const d = Data.random(g);
      expect(d).toEqual(RefData.random(g));
      compare(d.courses, d.D, d.P);
    });
  }

  it("parseCSV and toCSV agree (line numbers now point at the pasted line)", () => {
    const text = "section,subject,faculty,hours\nA,DAA,Dr X,4\n\n# comment\nB,OS,Dr Y\nC,DBMS,Dr Z,x\nD,,Dr Q,3\nE,CN,Dr W,2";
    const a = Data.parseCSV(text), b = RefData.parseCSV(text);
    expect(a.courses).toEqual(b.courses);
    expect(a.errors.length).toBe(b.errors.length);
    expect(a.errors[0]).toMatch(/^Line 5 /);
    expect(a.errors[1]).toMatch(/^Line 6:/);
    expect(a.errors[2]).toMatch(/^Line 7 /);
    const s = Data.sample();
    expect(Data.toCSV(s.courses)).toBe(RefData.toCSV(s.courses));
    expect(Data.parseCSV(Data.toCSV(s.courses)).courses).toEqual(s.courses);
  });
});
