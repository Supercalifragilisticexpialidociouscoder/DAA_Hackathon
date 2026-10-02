import { useEffect, useMemo, useRef, useState } from "react";
import type { Disruption, DisruptionKind, RescheduleOk, RescheduleResult } from "../engine/disrupt";
import type { Schedule } from "../engine/types";
import { copyText, useFlash } from "../lib/hooks";
import { dayLong, dayShort, describeDisruption, disruptionChip, fmt, plural, roomName, shortName, slotLabel } from "../lib/labels";
import { buildNotices } from "../lib/notices";
import type { Solution } from "../lib/solution";

export interface Applied {
  d: Disruption;
  base: Schedule;
  result: RescheduleOk;
}

interface BarProps {
  sol: Solution;
  current: Schedule;
  history: Applied[];
  onApply: (d: Disruption) => RescheduleResult;
  onUndo: () => void;
  onClear: () => void;
}

const sameBlock = (a: Disruption, b: Disruption) =>
  a.kind === b.kind && a.who === b.who && a.day === b.day && a.periods.join() === b.periods.join();

export function DisruptionBar({ sol, current, history, onApply, onUndo, onClear }: BarProps) {
  const { pb } = sol;
  const [open, setOpen] = useState<"none" | "teacher" | "more">("none");
  const [error, setError] = useState<string | null>(null);
  const [pickDay, setPickDay] = useState<number | "busiest">("busiest");
  const [kind, setKind] = useState<DisruptionKind>("room");
  const [who, setWho] = useState(0);
  const [day, setDay] = useState(1);
  const [periods, setPeriods] = useState<number[]>([]);
  const popRef = useRef<HTMLDivElement>(null);

  // classes per teacher per day in the current timetable
  const perDay = useMemo(() => {
    const m = Array.from({ length: pb.F }, () => new Array(pb.D).fill(0));
    for (let v = 0; v < pb.n; v++) m[pb.sessions[v].fac][(current.slot[v] / pb.P) | 0]++;
    return m;
  }, [pb, current]);
  const busiestDay = (f: number) => perDay[f].reduce((b, c, d, a) => (c > a[b] ? d : b), 0);
  const teachers = useMemo(
    () => pb.faculty.map((name, f) => ({ f, name })).sort((a, b) => pb.facCount[b.f] - pb.facCount[a.f] || a.name.localeCompare(b.name)),
    [pb],
  );

  useEffect(() => {
    if (open !== "teacher") return;
    const onDoc = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen("none");
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen("none"); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const run = (d: Disruption) => {
    if (history.some((h) => sameBlock(h.d, d))) {
      setError("That one is already in this week's list.");
      return;
    }
    const r = onApply(d);
    if (!r.ok) setError(`Couldn't reschedule: ${r.reason} Nothing was changed.`);
    else {
      setError(null);
      setOpen("none");
    }
  };

  const whoOptions =
    kind === "teacher" ? pb.faculty.map((n, i) => [i, n] as const)
      : kind === "section" ? pb.sections.map((n, i) => [i, n] as const)
        : Array.from({ length: current.rooms }, (_, i) => [i, roomName(i)] as const);
  const safeWho = Math.min(who, whoOptions.length - 1);

  return (
    <div className="disrupt">
      <div className="disrupt-row">
        <p className="disrupt-lede">
          <b>Then the week happens.</b> A teacher calls in sick, a room floods, a section goes on a trip. We move only the
          classes that have to move.
        </p>
        <div className="disrupt-actions">
          <div className="pop-anchor" ref={popRef}>
            <button
              className="btn btn-chalk"
              aria-expanded={open === "teacher"}
              aria-controls="teacher-pop"
              onClick={() => setOpen(open === "teacher" ? "none" : "teacher")}
            >
              Pick a teacher
            </button>
            {open === "teacher" && (
              <div className="pop" id="teacher-pop" role="dialog" aria-label="Mark a teacher absent">
                <div className="pop-head">
                  <span>Out on</span>
                  <div className="seg sm" role="radiogroup" aria-label="Day">
                    <button role="radio" aria-checked={pickDay === "busiest"} onClick={() => setPickDay("busiest")}>
                      their busiest day
                    </button>
                    {Array.from({ length: pb.D }, (_, d) => (
                      <button key={d} role="radio" aria-checked={pickDay === d} onClick={() => setPickDay(d)}>
                        {dayShort(d)}
                      </button>
                    ))}
                  </div>
                </div>
                <ul className="pop-list">
                  {teachers.map(({ f, name }) => {
                    const d = pickDay === "busiest" ? busiestDay(f) : pickDay;
                    const n = perDay[f][d];
                    return (
                      <li key={f}>
                        <button onClick={() => run({ kind: "teacher", who: f, day: d, periods: [] })}>
                          <span className="pop-name">{name}</span>
                          <span className="pop-meta">
                            {n ? `${plural(n, "class", "classes")} on ${dayShort(d)}` : `free on ${dayShort(d)}`}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
          <button className="btn btn-quiet" aria-expanded={open === "more"} onClick={() => setOpen(open === "more" ? "none" : "more")}>
            Other disruptions
          </button>
        </div>
      </div>

      {open === "more" && (
        <form
          className="disrupt-form"
          onSubmit={(e) => {
            e.preventDefault();
            run({ kind, who: safeWho, day, periods: periods.length === pb.P ? [] : periods });
          }}
        >
          <fieldset className="seg" aria-label="What changed">
            {(
              [
                ["teacher", "Teacher unavailable"],
                ["room", "Room closed"],
                ["section", "Section away"],
              ] as const
            ).map(([k, l]) => (
              <label key={k} className={kind === k ? "on" : ""}>
                <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => { setKind(k); setWho(0); }} />
                {l}
              </label>
            ))}
          </fieldset>
          <label className="field">
            <span>{kind === "teacher" ? "Teacher" : kind === "section" ? "Section" : "Room"}</span>
            <select value={safeWho} onChange={(e) => setWho(Number(e.target.value))}>
              {whoOptions.map(([i, n]) => (
                <option key={i} value={i}>{n}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Day</span>
            <select value={day} onChange={(e) => setDay(Number(e.target.value))}>
              {Array.from({ length: pb.D }, (_, d) => (
                <option key={d} value={d}>{dayLong(d)}</option>
              ))}
            </select>
          </label>
          <fieldset className="field periods">
            <legend>Periods</legend>
            <div className="chips">
              <button type="button" className="chip" aria-pressed={periods.length === 0} onClick={() => setPeriods([])}>
                All day
              </button>
              {Array.from({ length: pb.P }, (_, p) => (
                <button
                  type="button"
                  key={p}
                  className="chip"
                  aria-pressed={periods.includes(p)}
                  onClick={() => setPeriods(periods.includes(p) ? periods.filter((x) => x !== p) : [...periods, p].sort((a, b) => a - b))}
                >
                  P{p + 1}
                </button>
              ))}
            </div>
          </fieldset>
          <button type="submit" className="btn btn-chalk">Reschedule</button>
        </form>
      )}

      {error && <p className="disrupt-error" role="alert">{error}</p>}

      {history.length > 0 && (
        <div className="applied">
          <span className="applied-label">This week:</span>
          <ul>
            {history.map((h, i) => (
              <li key={i} className="tag">{disruptionChip(pb, h.d)}</li>
            ))}
          </ul>
          <button className="link" onClick={() => { setError(null); onUndo(); }}>Undo last</button>
          <button className="link" onClick={() => { setError(null); onClear(); }}>Back to the minimized timetable</button>
        </div>
      )}
    </div>
  );
}

export function ChangesPanel({ sol, applied, totalMoved }: { sol: Solution; applied: Applied; totalMoved: number }) {
  const { pb, codes } = sol;
  const { d, result: r, base } = applied;
  const [tab, setTab] = useState<"sections" | "teachers">("sections");
  const [copied, flash] = useFlash();
  const notices = useMemo(() => buildNotices(pb, d, r, codes), [pb, d, r, codes]);
  const list = tab === "sections" ? notices.sections : notices.teachers;
  const stayed = pb.n - r.moves.length;
  const changes = [...r.moves, ...r.roomSwaps].sort((a, b) => a.from - b.from || a.v - b.v);

  const copy = async (key: string, text: string) => {
    if (await copyText(text)) flash(key);
  };

  return (
    <section className="changes" aria-labelledby="changes-title">
      <h3 id="changes-title">
        {describeDisruption(pb, d)}.{" "}
        <span className="muted">
          {r.moves.length === 0 && r.roomSwaps.length === 0
            ? "Nothing on the timetable needed to change."
            : `${plural(r.moves.length, "class", "classes")} moved; the other ${fmt(stayed)} stayed put.`}
        </span>
      </h3>
      <dl className="change-stats">
        <div>
          <dt>Moved</dt>
          <dd>
            <b className="num">{r.moves.length}</b>
            <span>{r.hit} hit directly{r.chained ? `, ${r.chained} shifted to make space` : ""}</span>
          </dd>
        </div>
        <div>
          <dt>Rooms</dt>
          <dd>
            <b className="num">{r.schedule.rooms}</b>
            <span>{r.extraRoom ? `one more than before: ${base.rooms} couldn't fit everyone` : "still, same as before"}</span>
          </dd>
        </div>
        <div>
          <dt>Clashes</dt>
          <dd>
            <b className="num">{r.check === null && r.respectsBlocks ? 0 : "!"}</b>
            <span>{r.check === null && r.respectsBlocks ? "verified, blocked periods kept clear" : r.check ?? "a class sits in a blocked period"}</span>
          </dd>
        </div>
        <div>
          <dt>Room changes</dt>
          <dd>
            <b className="num">{r.roomSwaps.length}</b>
            <span>same period, different room</span>
          </dd>
        </div>
        <div>
          <dt>Solved in</dt>
          <dd>
            <b className="num">{r.ms < 10 ? r.ms.toFixed(1) : Math.round(r.ms)}</b>
            <span>ms, no re-solve{totalMoved !== r.moves.length ? `; ${totalMoved} moved this week in total` : ""}</span>
          </dd>
        </div>
      </dl>

      {changes.length > 0 && (
        <div className="change-grid">
          <div className="moves">
            <h4>What moved</h4>
            <table className="moves-table">
              <thead>
                <tr><th scope="col">Section</th><th scope="col">Class</th><th scope="col">Was</th><th scope="col">Now</th></tr>
              </thead>
              <tbody>
                {changes.map((m) => {
                  const s = pb.sessions[m.v];
                  return (
                    <tr key={m.v}>
                      <td><i className="sw" style={{ background: `var(--c${s.sec % 12})` }} />{pb.sections[s.sec]}</td>
                      <td><b>{codes[s.course]}</b> <span className="muted">{shortName(pb.faculty[s.fac])}</span></td>
                      <td className="was">{slotLabel(pb, m.from)} <span className="plate sm">{roomName(m.fromRoom)}</span></td>
                      <td className="now">{slotLabel(pb, m.to)} <span className="plate sm">{roomName(m.toRoom)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="notices">
            <div className="notices-head">
              <h4>Notices, ready to send</h4>
              <div className="seg sm" role="tablist" aria-label="Notices for">
                <button role="tab" aria-selected={tab === "sections"} onClick={() => setTab("sections")}>
                  Per section ({notices.sections.length})
                </button>
                <button role="tab" aria-selected={tab === "teachers"} onClick={() => setTab("teachers")}>
                  Per teacher ({notices.teachers.length})
                </button>
              </div>
              <button className="btn btn-quiet sm" onClick={() => copy("all", list.map((n) => n.text).join("\n\n"))}>
                {copied === "all" ? "Copied" : "Copy all"}
              </button>
            </div>
            <ul className="notice-list" role="tabpanel">
              {list.map((n) => (
                <li key={n.key} className="notice">
                  <pre>{n.text}</pre>
                  <button className="btn btn-quiet sm" onClick={() => copy(n.key, n.text)} aria-label={`Copy notice for ${n.to}`}>
                    {copied === n.key ? "Copied" : "Copy"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
