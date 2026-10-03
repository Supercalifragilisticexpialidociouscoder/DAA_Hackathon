import { useEffect, useMemo, useState } from "react";
import { loadsAfterRepairEvents, type PipelineTrace, type RepairEvent } from "../engine/trace";
import type { Problem } from "../engine/types";
import { ejectInstance, originalInstance, type Instance } from "../lib/demos";
import { plural, slotLabel } from "../lib/labels";
import type { Solution } from "../lib/solution";
import { Pseudo, Section } from "./Section";

const PSEUDO = [
  "REPAIR(c)",
  "  while peak(c) > lower bound:",
  "    targets ← periods with load ≤ peak − 2",
  "    for v in a fullest period A:",
  "      if some target B is free for v: move v to B",
  "      else if exactly one class u blocks v in a target B",
  "           and u fits a third period C:",
  "        move u to C, then v to B      (ejection chain)",
  "    stop if nothing moved",
];

export function useInstances(sol: Solution, trace: PipelineTrace | null, has: (t: PipelineTrace) => boolean) {
  const current: Instance = useMemo(
    () => ({ key: "current", label: "This dataset", note: sol.dataset.name, pb: sol.pb, codes: sol.codes, trace }),
    [sol, trace],
  );
  const list = useMemo(() => [current, originalInstance(), ejectInstance()], [current]);
  const firstWith = list.find((i) => i.trace && has(i.trace));
  return { list, initial: (current.trace && has(current.trace) ? current : firstWith ?? current).key };
}

export function InstancePicker({ list, sel, onSel, count }: {
  list: Instance[]; sel: string; onSel: (k: string) => void; count: (i: Instance) => string;
}) {
  return (
    <div className="seg inst" role="radiogroup" aria-label="Instance">
      {list.map((i) => (
        <button key={i.key} role="radio" aria-checked={sel === i.key} onClick={() => onSel(i.key)}>
          {i.label} <span className="muted">· {count(i)}</span>
        </button>
      ))}
    </div>
  );
}

const who = (pb: Problem, codes: string[], v: number) => `${pb.sections[pb.sessions[v].sec]} · ${codes[pb.sessions[v].course]}`;

function Chain({ inst, e, i }: { inst: Instance; e: RepairEvent; i: number }) {
  const { pb, codes } = inst;
  const tr = inst.trace!;
  const before = loadsAfterRepairEvents(pb, tr, i), after = loadsAfterRepairEvents(pb, tr, i + 1);
  const peakB = Math.max(...before), peakA = Math.max(...after);
  const why = e.kind === "eject"
    ? pb.sessions[e.u].sec === pb.sessions[e.v].sec ? "same section" : "same teacher"
    : "";
  return (
    <ol className="chain" aria-label="Ejection chain">
      <li className="chain-node">
        <b>{who(pb, codes, e.v)}</b> sits in <b>{slotLabel(pb, e.from)}</b>, a busiest period ({before[e.from]} classes)
      </li>
      {e.kind === "move" ? (
        <>
          <li className="chain-arrow">moves directly</li>
          <li className="chain-node">
            <b>{slotLabel(pb, e.to)}</b> had {before[e.to]} classes and no clash: <b>{who(pb, codes, e.v)}</b> moves in
          </li>
        </>
      ) : (
        <>
          <li className="chain-arrow">wants {slotLabel(pb, e.to)} ({before[e.to]} classes)</li>
          <li className="chain-node blocked">
            {slotLabel(pb, e.to)} is blocked by <b>{who(pb, codes, e.u)}</b> ({why})
          </li>
          <li className="chain-arrow">eject</li>
          <li className="chain-node">
            <b>{who(pb, codes, e.u)}</b> → <b>{slotLabel(pb, e.uTo)}</b> ({before[e.uTo]} → {after[e.uTo]} classes)
          </li>
          <li className="chain-arrow">then</li>
          <li className="chain-node">
            <b>{who(pb, codes, e.v)}</b> → <b>{slotLabel(pb, e.to)}</b>
          </li>
        </>
      )}
      <li className={peakA < peakB ? "chain-end ok" : "chain-end"}>
        {slotLabel(pb, e.from)}: {before[e.from]} → {after[e.from]} classes · busiest period {peakB} → {peakA}
        {peakA <= pb.lb ? ` = lower bound ${pb.lb}, reached` : ""}
      </li>
    </ol>
  );
}

export function Repair({ sol, trace }: { sol: Solution; trace: PipelineTrace | null }) {
  const { list, initial } = useInstances(sol, trace, (t) => t.repairLog.some((e) => e.kind === "eject"));
  const [key, setKey] = useState(initial);
  const [i, setI] = useState(0);
  useEffect(() => { setKey(initial); }, [initial]);
  useEffect(() => { setI(0); }, [key]);
  const inst = list.find((x) => x.key === key) ?? list[0];
  const tr = inst.trace;
  const events = tr?.repairLog ?? [];
  const peaks = tr ? Array.from({ length: events.length + 1 }, (_, k) => Math.max(...loadsAfterRepairEvents(inst.pb, tr, k))) : [];

  return (
    <Section
      id="repair"
      step={6}
      title="Repair: ejection chains"
      lede="DSatur gives a first coloring. If its busiest period is above the lower bound, repair pulls classes out of the fullest periods. When a target period is blocked by exactly one clashing class, that class is ejected to a third period first."
    >
      <InstancePicker list={list} sel={key} onSel={setKey}
        count={(x) => (x.trace ? plural(x.trace.repairLog.length, "event") : "no coloring")} />
      <p className="muted small inst-note">{inst.note}</p>

      {tr && (
        <dl className="rstats">
          <div><dt>DSatur's busiest period</dt><dd className="num">{tr.startRooms}</dd></div>
          <div><dt>After repair</dt><dd className="num">{tr.repairRooms}</dd></div>
          <div><dt>Lower bound</dt><dd className="num">{inst.pb.lb}</dd></div>
          <div><dt>Status</dt><dd className={tr.repairRooms <= inst.pb.lb ? "ok" : "warn"}>{tr.repairRooms <= inst.pb.lb ? "reached" : `gap ${tr.repairRooms - inst.pb.lb}`}</dd></div>
        </dl>
      )}

      <div className="repair-grid">
        <div>
          {!tr ? (
            <p className="muted">DSatur could not color this instance.</p>
          ) : events.length === 0 ? (
            <p className="note-box">
              DSatur's first pass already uses {tr.startRooms} rooms, equal to the lower bound, so repair has nothing to do here.
              Pick one of the other instances to watch it work: same engine code, harder data.
            </p>
          ) : (
            <>
              <div className="ev-bar">
                <button className="btn btn-quiet sm" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}>◀ Previous</button>
                <span className="num">Event {i + 1} of {events.length} · {events[i].kind === "eject" ? "ejection chain" : "direct move"}</span>
                <button className="btn btn-quiet sm" onClick={() => setI(Math.min(events.length - 1, i + 1))} disabled={i >= events.length - 1}>Next ▶</button>
              </div>
              <Chain inst={inst} e={events[i]} i={i} />
              <p className="peaks num" aria-label="Busiest period after each event">
                Busiest period: {peaks.map((p, k) => (
                  <span key={k} className={k === i + 1 ? "on" : ""}>{p}{k < peaks.length - 1 ? " → " : ""}</span>
                ))}
              </p>
            </>
          )}
        </div>
        <div>
          <Pseudo lines={PSEUDO} active={events[i]?.kind === "eject" ? [6, 7, 8] : events.length ? [5] : []} label="Repair pseudocode" />
          <p className="muted small">
            Events come from the engine's own <code>repair()</code> with its built-in log switched on. Its chains have one
            blocker (two moves); incremental repair, further down, allows chains of up to three links.
          </p>
        </div>
      </div>
    </Section>
  );
}
