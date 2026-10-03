/* The demo dataset: one semester across the university, and what the solver makes of it. */
import { describe, expect, it } from "vitest";
import { Data } from "../src/engine/data";
import { Engine } from "../src/engine/engine";
import { reschedule } from "../src/engine/disrupt";
import { subjectCodes } from "../src/lib/labels";

const SIX = [
  "Probability and Statistics",
  "Digital Electronics",
  "Design and Analysis of Algorithms",
  "Backend Web Development",
  "Advanced Communication Skills",
  "Logical Reasoning and Analytical Skills",
];
const BRANCHES: Record<string, string[]> = {
  CSE: ["CSE-A", "CSE-B", "CSE-C", "CSE-D", "CSE-E", "CSE-F", "CSE-G+H"],
  "CSE-DS": ["CSE-DS-A", "CSE-DS-B", "CSE-DS-C", "CSE-DS-D", "CSE-DS-E", "CSE-DS-F"],
  CSM: ["CSM-A", "CSM-B", "CSM-C", "CSM-D", "CSM-E", "CSM-F", "CSM-G", "CSM-H"],
  ECE: ["ECE-A", "ECE-B", "ECE-C"],
  "IoT/R&AI": ["IoT/R&AI"],
  BBA: ["BBA-A", "BBA-B"],
};
const SIX_BRANCHES = ["CSE", "CSE-DS", "CSM"];
const branchOf = (sec: string) => Object.keys(BRANCHES).find((b) => BRANCHES[b].includes(sec))!;

describe("university sample", () => {
  const ds = Data.sample();
  const pb = Engine.prepare(ds.courses, ds.D, ds.P);
  const out = Engine.solveAll(pb, 7);
  const subjectsOf = (sec: string) => ds.courses.filter((c) => c.section === sec).map((c) => c.subject);

  it("has the real branch and section structure, with CSE-G and CSE-H as one combined section", () => {
    expect(ds.D).toBe(6);
    expect(ds.P).toBe(6);
    expect(pb.sections).toEqual(Object.values(BRANCHES).flat());
    expect(pb.sections).not.toContain("CSE-G");
    expect(pb.sections).not.toContain("CSE-H");
  });

  it("CSE, CSE-DS and CSM take exactly the six common subjects; ECE, IoT/R&AI and BBA take their own", () => {
    for (const b of SIX_BRANCHES) for (const sec of BRANCHES[b]) expect([...subjectsOf(sec)].sort()).toEqual([...SIX].sort());
    for (const b of ["ECE", "IoT/R&AI", "BBA"]) {
      const subjects = new Set(BRANCHES[b].flatMap(subjectsOf));
      expect(subjects.size).toBeGreaterThanOrEqual(5);
      for (const s of subjects) expect(SIX).not.toContain(s);
      // a branch's own subjects belong to that branch only
      for (const c of ds.courses) if (subjects.has(c.subject)) expect(branchOf(c.section)).toBe(b);
    }
    for (const c of ds.courses) {
      expect(c.section && c.subject && c.faculty).toBeTruthy();
      expect(Number.isInteger(c.hours) && c.hours > 0).toBe(true);
    }
    // one row per section and subject
    expect(new Set(ds.courses.map((c) => `${c.section}|${c.subject}`)).size).toBe(ds.courses.length);
  });

  it("short codes are clean and unique; the six are P&S, DE, DAA, BWD, ACS, LRAS", () => {
    const codes = subjectCodes(pb);
    const bySubject = new Map(pb.courses.map((c, i) => [c.subject, codes[i]]));
    expect(SIX.map((s) => bySubject.get(s))).toEqual(["P&S", "DE", "DAA", "BWD", "ACS", "LRAS"]);
    expect(new Set(bySubject.values()).size).toBe(bySubject.size);
  });

  it("teachers are shared across sections and some across branches, so the conflict graph has teacher edges", () => {
    const secsOf = (f: number) => new Set(pb.facMembers[f].map((v) => pb.sessions[v].sec));
    for (let f = 0; f < pb.F; f++) {
      const secs = [...secsOf(f)];
      if (secs.some((s) => SIX_BRANCHES.includes(branchOf(pb.sections[s])))) expect(secs.length).toBeGreaterThanOrEqual(2);
    }
    const crossBranch = pb.faculty.filter((_, f) => new Set([...secsOf(f)].map((s) => branchOf(pb.sections[s]))).size > 1);
    expect(crossBranch.length).toBeGreaterThanOrEqual(3);
    const sectionOnly = pb.secCount.reduce((a, c) => a + (c * (c - 1)) / 2, 0);
    expect(pb.edges).toBeGreaterThan(sectionOnly);
  });

  it("every session is a distinct class", () => {
    expect(pb.n).toBe(ds.courses.reduce((a, c) => a + c.hours, 0));
    expect(pb.sessions.map((s) => s.id)).toEqual(Array.from({ length: pb.n }, (_, i) => i));
    expect(new Set(pb.sessions.map((s) => `${s.course}:${s.k}`)).size).toBe(pb.n);
  });

  it("solves to the floor with no clashes, verified", () => {
    expect(pb.problems).toEqual([]);
    expect(pb.T).toBe(36);
    expect(pb.lb).toBe(Math.ceil(pb.n / pb.T));
    if (!out.manual.ok || !out.ours.ok) throw new Error("solve failed");
    // today's one-room-per-section baseline needs pb.S rooms; ours needs fewer
    expect(out.ours.rooms).toBeLessThan(pb.S);
    expect(out.ours.rooms).toBe(pb.lb);
    expect(out.ours.repeats).toBe(0);
    expect(Engine.verify(pb, out.ours.slot, out.ours.room)).toBeNull();
    expect(Engine.verify(pb, out.manual.slot, out.manual.room)).toBeNull();
    for (let v = 0; v < pb.n; v++) {
      expect(out.ours.slot[v]).toBeGreaterThanOrEqual(0);
      expect(out.ours.slot[v]).toBeLessThan(pb.T);
      expect(out.ours.room![v]).toBeGreaterThanOrEqual(0);
      expect(out.ours.room![v]).toBeLessThan(out.ours.rooms);
    }
    // the measured numbers the docs quote
    expect([pb.S, pb.n, pb.lb, out.ours.rooms]).toEqual([27, 702, 20, 20]);
  });

  it("is deterministic with seed 7", () => {
    const again = Engine.solveAll(Engine.prepare(ds.courses, ds.D, ds.P), 7);
    if (!out.ours.ok || !again.ours.ok) throw new Error("solve failed");
    expect(again.ours.slot).toEqual(out.ours.slot);
    expect(Array.from(again.ours.room!)).toEqual(Array.from(out.ours.room!));
  });

  it("marking any teacher out on their busiest day moves classes, keeps the room count and 0 clashes", () => {
    if (!out.ours.ok) throw new Error("solve failed");
    const base = { slot: out.ours.slot, room: Array.from(out.ours.room!), rooms: out.ours.rooms };
    for (let f = 0; f < pb.F; f++) {
      const perDay = new Array(pb.D).fill(0);
      for (const v of pb.facMembers[f]) perDay[(base.slot[v] / pb.P) | 0]++;
      const day = perDay.indexOf(Math.max(...perDay));
      const r = reschedule(pb, base, [{ kind: "teacher", who: f, day, periods: [] }]);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.moves.length).toBeGreaterThan(0);
      expect(r.schedule.rooms).toBe(base.rooms);
      expect(r.check).toBeNull();
      expect(r.respectsBlocks).toBe(true);
    }
  });
});
