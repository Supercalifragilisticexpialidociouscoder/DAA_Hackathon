import { useEffect, useState } from "react";
import { slotsAfterPolishEvents, type PipelineTrace } from "../engine/trace";
import type { Instance } from "../lib/demos";
import { dayShort, plural, slotLabel } from "../lib/labels";
import type { Solution } from "../lib/solution";
import { InstancePicker, useInstances } from "./Repair";
import { Pseudo, Section } from "./Section";

const PSEUDO = [
  "POLISH(c),  cap ← peak(c)",
  "  for each class v whose subject meets twice that day:",
  "    if some period B on a day without that subject",
  "       is free for v and has load < cap: move v to B",
  "    else if one class u blocks v in such a B",
  "       and u fits a period C with load < cap: move u, then v",
  "  repeat until nothing moves",
];

/* One section's day, as subject codes per period, with repeats and moved cells marked. */
function DayRow({ inst, slot, sec, day, mark }: { inst: Instance; slot: number[]; sec: number; day: number; mark: Set<number> }) {
  const { pb, codes } = inst;
  const at = new Array(pb.P).fill(-1);
  for (const v of pb.secMembers[sec]) if (((slot[v] / pb.P) | 0) === day) at[slot[v] % pb.P] = v;
  const count = new Map<number, number>();
  for (const v of at) if (v >= 0) count.set(pb.sessions[v].course, (count.get(pb.sessions[v].course) || 0) + 1);
  return (
    <div className="dayrow">
      <span className="dayrow-d">{dayShort(day)}</span>
      {at.map((v, p) => {
        const rep = v >= 0 && count.get(pb.sessions[v].course)! > 1;
        return (
          <span key={p} className={`dcell${v < 0 ? " free" : ""}${rep ? " rep" : ""}${v >= 0 && mark.has(v) ? " moved" : ""}`}>
            {v >= 0 ? codes[pb.sessions[v].course] : ""}
          </span>
        );
      })}
    </div>
  );
}

export function Polish({ sol, trace }: { sol: Solution; trace: PipelineTrace | null }) {
  const { list, initial } = useInstances(sol, trace, (t) => t.polishLog.length > 0);
  const [key, setKey] = useState(initial);
  const [i, setI] = useState(0);
  useEffect(() => { setKey(initial); }, [initial]);
  useEffect(() => { setI(0); }, [key]);
  const inst = list.find((x) => x.key === key) ?? list[0];
  const tr = inst.trace;
  const events = tr?.polishLog ?? [];
  const e = events[i];
  const { pb, codes } = inst;

  let detail = null;
  if (tr && e) {
    const before = slotsAfterPolishEvents(tr, i), after = slotsAfterPolishEvents(tr, i + 1);
    const sv = pb.sessions[e.v];
    const days = [...new Set([(e.from / pb.P) | 0, (e.to / pb.P) | 0])].sort((a, b) => a - b);
    const moved = new Set([e.v, ...(e.kind === "polish-swap" ? [e.u] : [])]);
    const su = e.kind === "polish-swap" ? pb.sessions[e.u] : null;
    const uTo = e.kind === "polish-swap" ? e.uTo : -1;
    detail = (
      <div className="polish-ev">
        <p>
          <b>{pb.sections[sv.sec]}</b> had <b>{codes[sv.course]}</b> twice on {dayShort((e.from / pb.P) | 0)}. One of them moves
          from {slotLabel(pb, e.from)} to {slotLabel(pb, e.to)}
          {su ? <>, after <b>{pb.sections[su.sec]} · {codes[su.course]}</b> steps aside from {slotLabel(pb, e.to)} to {slotLabel(pb, uTo)}</> : null}.
        </p>
        <div className="ba">
          <div>
            <p className="ba-h">Before</p>
            {days.map((d) => <DayRow key={d} inst={inst} slot={before} sec={sv.sec} day={d} mark={new Set()} />)}
          </div>
          <div>
            <p className="ba-h">After</p>
            {days.map((d) => <DayRow key={d} inst={inst} slot={after} sec={sv.sec} day={d} mark={moved} />)}
          </div>
        </div>
        <p className="muted small">{pb.sections[sv.sec]}, P1 to P{pb.P}. Pink: the same subject twice in a day. Ringed: moved.</p>
      </div>
    );
  }

  return (
    <Section
      id="polish"
      step={7}
      title="Polish: better days, same room count"
      lede="Once the busiest period is fixed, polish improves timetable quality without raising it: it moves classes so no subject meets twice in one day. Every move keeps each period at or below the current peak and never creates a section or teacher clash."
    >
      <InstancePicker list={list} sel={key} onSel={setKey}
        count={(x) => (x.trace ? `${plural(x.trace.repeatsBeforePolish, "repeat")} → ${x.trace.repeats}` : "no coloring")} />
      <p className="muted small inst-note">{inst.note}</p>

      {tr && (
        <dl className="rstats">
          <div><dt>Repeats before polish</dt><dd className="num">{tr.repeatsBeforePolish}</dd></div>
          <div><dt>After polish</dt><dd className="num">{tr.repeats}</dd></div>
          <div><dt>Moves</dt><dd className="num">{tr.polishMoves}</dd></div>
          <div><dt>Busiest period</dt><dd className="num">{tr.repairRooms} → {tr.rooms}</dd></div>
        </dl>
      )}

      <div className="repair-grid">
        <div>
          {!tr ? (
            <p className="muted">DSatur could not color this instance.</p>
          ) : events.length === 0 ? (
            <p className="note-box">
              No subject meets twice in a day after DSatur here (its period choice already penalises repeats), so polish makes no
              moves. The original sample has repeats to fix.
            </p>
          ) : (
            <>
              <div className="ev-bar">
                <button className="btn btn-quiet sm" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}>◀ Previous</button>
                <span className="num">Move {i + 1} of {events.length} · {e.kind === "polish-swap" ? "swap with one blocker" : "direct move"}</span>
                <button className="btn btn-quiet sm" onClick={() => setI(Math.min(events.length - 1, i + 1))} disabled={i >= events.length - 1}>Next ▶</button>
              </div>
              {detail}
            </>
          )}
        </div>
        <div>
          <Pseudo lines={PSEUDO} active={e ? (e.kind === "polish-swap" ? [5, 6] : [3, 4]) : []} label="Polish pseudocode" />
          <p className="muted small">
            Polish is a heuristic local search: it removes a repeat only where a direct move or a one-blocker swap exists, so
            it does not promise zero repeats. Events come from the engine's own <code>polish()</code> log.
          </p>
        </div>
      </div>
    </Section>
  );
}
