import { useMemo, useState } from "react";
import { Engine } from "../engine/engine";
import type { Problem, Schedule } from "../engine/types";
import { fmt, plural, roomName, slotLabel } from "../lib/labels";
import type { Solution } from "../lib/solution";
import { Section } from "./Section";

type Mutation = "section" | "teacher" | "room";

/* Copies of the timetable with exactly one thing broken on purpose. */
function mutate(pb: Problem, s: Schedule, kind: Mutation): { slot: number[]; room: number[]; what: string } | null {
  const slot = s.slot.slice(), room = s.room.slice();
  const name = (v: number) => `${pb.sections[pb.sessions[v].sec]} class ${v}`;
  if (kind === "section") {
    const [v, ...rest] = pb.secMembers[0];
    const u = rest.find((x) => s.slot[x] !== s.slot[v]);
    if (u === undefined) return null;
    slot[v] = s.slot[u];
    return { slot, room, what: `moved ${name(v)} into ${slotLabel(pb, s.slot[u])}, where its section already has a class` };
  }
  if (kind === "teacher") {
    for (const members of pb.facMembers) {
      const v = members[0];
      const u = members.find((x) => pb.sessions[x].sec !== pb.sessions[v].sec && s.slot[x] !== s.slot[v]);
      if (u === undefined) continue;
      slot[v] = s.slot[u];
      return { slot, room, what: `moved ${name(v)} into ${slotLabel(pb, s.slot[u])}, where ${pb.faculty[pb.sessions[v].fac]} already teaches` };
    }
    return null;
  }
  for (let t = 0; t < pb.T; t++) {
    const inT = slot.map((x, v) => (x === t ? v : -1)).filter((v) => v >= 0);
    if (inT.length < 2) continue;
    room[inT[1]] = room[inT[0]];
    return { slot, room, what: `put two classes of ${slotLabel(pb, t)} in ${roomName(room[inT[0]])}` };
  }
  return null;
}

export function Verification({ sol }: { sol: Solution }) {
  const { pb, after } = sol;
  const { n, T, lb } = pb;
  const rooms = after.rooms;
  const gap = rooms - lb;

  const checks = useMemo(() => {
    const placed = after.slot.filter((t) => t >= 0 && t < T).length;
    const seen = { sec: new Set<number>(), fac: new Set<number>(), room: new Set<number>() };
    let sec = 0, fac = 0, room = 0;
    for (let v = 0; v < n; v++) {
      const s = pb.sessions[v], t = after.slot[v];
      const a = t * pb.S + s.sec, b = t * pb.F + s.fac, c = t * (rooms + 1) + after.room[v];
      if (seen.sec.has(a)) sec++; else seen.sec.add(a);
      if (seen.fac.has(b)) fac++; else seen.fac.add(b);
      if (seen.room.has(c)) room++; else seen.room.add(c);
    }
    const load = new Array(T).fill(0);
    for (const t of after.slot) load[t]++;
    return { placed, sec, fac, room, peak: Math.max(...load) };
  }, [pb, after, n, T, rooms]);

  const [run, setRun] = useState<{ label: string; out: string | null; ms: number } | null>(null);
  const runVerify = (kind: Mutation | null) => {
    const m = kind ? mutate(pb, after, kind) : { slot: after.slot, room: after.room, what: "the timetable as solved" };
    if (!m) return;
    const t0 = performance.now();
    const out = Engine.verify(pb, m.slot, m.room);
    setRun({ label: m.what, out, ms: performance.now() - t0 });
  };

  const rows: [boolean, string, string][] = [
    [checks.placed === n, "every class has exactly one period in [0, T)", `${fmt(checks.placed)} / ${fmt(n)}`],
    [checks.sec === 0, "no section has two classes in one period", `${checks.sec} violations · ${plural(pb.S, "section")}`],
    [checks.fac === 0, "no teacher has two classes in one period", `${checks.fac} violations · ${plural(pb.F, "teacher")}`],
    [checks.room === 0, "no room holds two classes in one period", `${checks.room} violations · ${rooms} rooms × ${T} periods`],
    [checks.peak === rooms, "rooms used = largest color class", `${rooms}`],
    [true, "lower bound = ⌈n ÷ T⌉", `⌈${fmt(n)} ÷ ${T}⌉ = ${lb}`],
    [gap === 0, "gap = rooms used − lower bound", `${gap}`],
  ];

  return (
    <Section
      id="verify"
      step={9}
      title="Verification and proof"
      lede="The site doesn't assume the solver is right: it checks the finished timetable, independently of how it was built. Feasible means no clashes; optimal additionally means no feasible timetable uses fewer rooms."
    >
      <div className="verify-grid">
        <div>
          <ul className="asserts" aria-label="Checks">
            {rows.map(([ok, what, val]) => (
              <li key={what} className={ok ? "pass" : "fail"}>
                <span className="a-mark" aria-hidden>{ok ? "✓" : "✗"}</span>
                <span className="a-what">{what}</span>
                <span className="a-val num">{val}</span>
              </li>
            ))}
          </ul>

          <div className="vrun">
            <div className="vrun-btns">
              <button className="btn btn-chalk sm" onClick={() => runVerify(null)}>Run Engine.verify(timetable)</button>
              <span className="muted small">or break one thing first:</span>
              <button className="btn btn-quiet sm" onClick={() => runVerify("section")}>Double-book a section</button>
              <button className="btn btn-quiet sm" onClick={() => runVerify("teacher")}>Double-book a teacher</button>
              <button className="btn btn-quiet sm" onClick={() => runVerify("room")}>Double-book a room</button>
            </div>
            <pre className="vrun-out" aria-live="polite">
              {run
                ? `// ${run.label}\nEngine.verify(pb, slot, room)\n→ ${run.out === null ? "null   (no violations)" : JSON.stringify(run.out)}\n   ${run.ms.toFixed(2)} ms, one pass over ${fmt(n)} classes`
                : "// press a button to run the check in your browser"}
            </pre>
          </div>
        </div>

        <div>
          <h3 className="sub-h">Why the result is correct</h3>
          <ol className="proof-steps">
            <li>Every class receives exactly one period: the check above finds all {fmt(n)} placed.</li>
            <li>Classes joined by an edge never share a period: no section or teacher is double-booked.</li>
            <li>Classes in the same period get distinct rooms: no room is double-booked.</li>
            <li>So the timetable is <b>feasible</b>.</li>
            <li>Any timetable needs at least ⌈n ÷ T⌉ = {lb} rooms, since {lb - 1} rooms hold only {fmt((lb - 1) * T)} of {fmt(n)} classes.</li>
            <li>This timetable uses {rooms} {gap === 0 ? "= " + lb : `(gap ${gap})`}.</li>
            <li>{gap === 0 ? <>So no feasible timetable uses fewer rooms: it is <b>optimal</b>.</> : <>Counting can't close the gap, so optimality is <b>not proven</b>; exact minimization is NP-hard in general.</>}</li>
          </ol>
          <div className="fo">
            <div>
              <p className="fo-h">Feasible</p>
              <p>No clashes. Steps 1 to 4, checked by <code>verify</code> on every run.</p>
            </div>
            <div className={gap === 0 ? "on" : ""}>
              <p className="fo-h">Optimal</p>
              <p>Feasible, and rooms used = lower bound. Steps 5 to 7. {gap === 0 ? "Holds here." : "Not shown here."}</p>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}
