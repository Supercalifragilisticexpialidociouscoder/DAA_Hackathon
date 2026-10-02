import { useMemo } from "react";
import { Engine } from "../engine/engine";
import type { Schedule } from "../engine/types";
import { fmt, plural } from "../lib/labels";
import type { Solution } from "../lib/solution";

export function Proof({ sol, current }: { sol: Solution; current: Schedule }) {
  const { pb } = sol;
  const { n, T, lb } = pb;
  const rooms = current.rooms;
  const gap = rooms - lb;
  const fewer = lb - 1;
  const holds = fewer * T;
  const short = n - holds;

  const checks = useMemo(() => {
    const placed = current.slot.every((t) => t >= 0 && t < T);
    // verify() reports the first problem it meets; split it out per rule for the list
    const seen = { sec: new Set<number>(), fac: new Set<number>(), room: new Set<number>() };
    let sec = 0, fac = 0, room = 0;
    for (let v = 0; v < pb.n; v++) {
      const s = pb.sessions[v], t = current.slot[v];
      const a = t * pb.S + s.sec, b = t * pb.F + s.fac, c = t * (rooms + 1) + current.room[v];
      if (seen.sec.has(a)) sec++; else seen.sec.add(a);
      if (seen.fac.has(b)) fac++; else seen.fac.add(b);
      if (seen.room.has(c)) room++; else seen.room.add(c);
    }
    const full = Engine.verify(pb, current.slot, current.room);
    return { placed, sec, fac, room, full };
  }, [pb, current, T, rooms]);

  return (
    <section className="section proof" id="proof" aria-labelledby="proof-title">
      <h2 id="proof-title">Why {lb} is the floor</h2>
      <div className="proof-grid">
        <div className="equation" aria-label={`ceiling of ${n} divided by ${T} equals ${lb}`}>
          <div className="eq-row">
            <span className="ceil">
              <span className="eq-num">{fmt(n)}</span>
              <span className="eq-op">÷</span>
              <span className="eq-num">{T}</span>
            </span>
            <span className="eq-op">=</span>
            <span className="eq-num eq-result">{lb}</span>
          </div>
          <p className="eq-caption">
            {fmt(n)} classes a week, {T} periods a week ({pb.D} days × {pb.P}), rounded up.
          </p>
        </div>
        <div className="proof-text">
          {lb <= 1 ? (
            <p>Any timetable with a class in it needs at least one room, and ours uses {plural(rooms, "room")}.</p>
          ) : (
            <p>
              If {plural(fewer, "room")} were enough, the week could hold only {fewer} × {T} = <b>{fmt(holds)}</b> classes,{" "}
              <b>{fmt(short)} short</b> of the {fmt(n)} we have. So some period must run {lb} classes at once, and each needs
              its own room. No timetable, by anyone, can use fewer than {lb}.
            </p>
          )}
          {gap <= 0 ? (
            <p className="verdict ok">
              We never exceed {rooms}. <b>Gap: 0</b>, so this timetable is optimal. Not "good", provably the best possible.
            </p>
          ) : (
            <p className="verdict gap">
              We use {rooms}, so the <b>gap is {gap}</b>. That doesn't mean {lb} is reachable: the floor counts classes, not
              clashes. Finding the true minimum is graph coloring with a capped palette, which is NP-hard in general, so
              we report the gap honestly instead of claiming optimality.
            </p>
          )}
          <ul className="checks" aria-label="Verified">
            <li className={checks.placed ? "pass" : "fail"}>All {fmt(n)} classes have a period and a room</li>
            <li className={checks.sec === 0 ? "pass" : "fail"}>
              No section is in two classes at once ({plural(pb.S, "section")} checked)
            </li>
            <li className={checks.fac === 0 ? "pass" : "fail"}>
              No teacher is double-booked ({plural(pb.F, "teacher")} checked)
            </li>
            <li className={checks.room === 0 ? "pass" : "fail"}>
              No room is double-booked ({rooms} rooms × {T} periods)
            </li>
          </ul>
          <p className="verify-line">
            <code>Engine.verify(timetable)</code> → <code>{checks.full === null ? "null" : JSON.stringify(checks.full)}</code>
            <span className="muted">{checks.full === null ? " (no clashes found)" : ""}</span>
          </p>
        </div>
      </div>
    </section>
  );
}
