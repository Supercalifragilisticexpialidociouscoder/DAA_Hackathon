import { useEffect, useMemo, useRef, useState } from "react";
import { Engine } from "../engine/engine";
import { useTween } from "../lib/hooks";
import { fmt, plural } from "../lib/labels";
import { emptyRoomPeriods, type Solution } from "../lib/solution";
import { ChalkCircle, Counter } from "./Counter";
import { Matrix, type Anim } from "./Matrix";

type Phase = "before" | "after";

const RAIL: [string, string][] = [
  ["Input", "#model"],
  ["Conflict graph", "#graph"],
  ["Graph coloring", "#model"],
  ["DSatur", "#dsatur"],
  ["Repair", "#repair"],
  ["Room assignment", "#rooms"],
  ["Verification", "#verify"],
  ["Minimum rooms", "#bound"],
];

export function Hero({ sol, reduced }: { sol: Solution; reduced: boolean }) {
  const { pb, before, after, out } = sol;
  const [phase, setPhase] = useState<Phase>("before");
  const [done, setDone] = useState(false);
  const [holdRows, setHoldRows] = useState(false);
  const [anim, setAnim] = useState<Anim>({ kind: "none" });
  const [circle, setCircle] = useState<"hidden" | "drawing" | "shown">("hidden");
  const timers = useRef<number[]>([]);
  const later = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)); };
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => () => clearTimers(), []);

  useEffect(() => {
    clearTimers();
    setPhase("before");
    setDone(false);
    setHoldRows(false);
    setAnim({ kind: "none" });
    setCircle("hidden");
  }, [sol]);

  const shown = phase === "before" ? before : after;
  const maxRows = Math.max(before.rooms, after.rooms);
  const rows = phase === "before" || holdRows ? maxRows : after.rooms;
  const gap = after.rooms - pb.lb;
  const optimal = gap <= 0;
  const verified = useMemo(() => Engine.verify(pb, after.slot, after.room), [pb, after]);
  const shownCheck = useMemo(() => Engine.verify(pb, shown.slot, shown.room), [pb, shown]);

  const run = () => {
    clearTimers();
    if (reduced) {
      setPhase("after");
      setCircle(optimal ? "shown" : "hidden");
      setDone(true);
      return;
    }
    setAnim({ kind: "sweep", dur: 680, stagger: 460, token: Date.now() });
    setHoldRows(true);
    setPhase("after");
    later(1180, () => setHoldRows(false));
    later(1480, () => { if (optimal) setCircle("drawing"); });
    later(1500, () => setAnim({ kind: "none" }));
    later(2150, () => setDone(true));
  };
  const show = (p: Phase) => {
    if (p === phase) return;
    clearTimers();
    if (reduced) {
      setPhase(p);
      setCircle(p === "after" && optimal ? "shown" : "hidden");
      return;
    }
    setCircle("hidden");
    setAnim({ kind: "sweep", dur: 520, stagger: 240, token: Date.now() });
    if (p === "after") {
      setHoldRows(true);
      later(800, () => { setHoldRows(false); if (optimal) setCircle("shown"); });
    }
    setPhase(p);
    later(900, () => setAnim({ kind: "none" }));
  };
  const replay = () => {
    clearTimers();
    setAnim({ kind: "none" });
    setPhase("before");
    setCircle("hidden");
    setDone(false);
    later(60, run);
  };

  const roomsNow = phase === "before" ? before.rooms : after.rooms;
  const animateNumbers = !reduced && anim.kind === "sweep";
  const empty = useTween(emptyRoomPeriods(pb, roomsNow), animateNumbers, 900, 150);
  const label =
    phase === "before"
      ? `Baseline: ${plural(before.rooms, "room")}, one per section, ${fmt(emptyRoomPeriods(pb, before.rooms))} room-periods empty`
      : `LOWERBOUND: ${plural(after.rooms, "room")}, ${fmt(emptyRoomPeriods(pb, after.rooms))} room-periods empty`;

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <h1 id="hero-title" className="wordmark">LOWERBOUND</h1>
        <p className="hero-sub">University timetable optimization using graph coloring and DSatur</p>
        <p className="lede">
          Model timetable conflicts as a graph, color it with the week's periods, and minimize the largest number of
          classes running at once. That number is the rooms you need.
        </p>
      </div>

      <dl className="result-strip" aria-label="Result">
        <div><dt>classes</dt><dd>{fmt(pb.n)}</dd><span>vertices, n</span></div>
        <div><dt>periods</dt><dd>{pb.T}</dd><span>colors, T</span></div>
        <div><dt>rooms used</dt><dd>{after.rooms}</dd><span>largest color class</span></div>
        <div><dt>lower bound</dt><dd>{pb.lb}</dd><span>⌈n ÷ T⌉</span></div>
        <div className={optimal ? "gap0" : "gapn"}><dt>gap</dt><dd>{gap}</dd><span>{optimal ? "optimal" : "not proven optimal"}</span></div>
      </dl>
      <p className={verified === null ? "verified-line ok" : "verified-line bad"}>
        {verified === null ? (optimal ? "Optimal solution, verified" : "Feasible solution, verified") : "Verification failed"}
        <code>Engine.verify(timetable) → {verified === null ? "null" : JSON.stringify(verified)}</code>
      </p>

      <ol className="rail" aria-label="Pipeline">
        {RAIL.map(([name, href], i) => (
          <li key={name}>
            <a href={href}>{name}</a>
            {i < RAIL.length - 1 && <span aria-hidden>→</span>}
          </li>
        ))}
      </ol>

      <div className="stage">
        <div className="board">
          <div className="board-head">
            <p className="board-title">
              {phase === "before" ? (
                <>Baseline: fill in order, one room per section</>
              ) : (
                <>LOWERBOUND: {plural(after.rooms, "room")} for the same {fmt(pb.n)} classes</>
              )}
            </p>
            <p className="board-meta">
              {plural(pb.S, "section")} · {plural(pb.F, "teacher")} · {pb.D} days × {pb.P} periods
            </p>
          </div>
          <Matrix
            sol={sol}
            schedule={shown}
            rows={rows}
            maxRows={maxRows}
            anim={anim}
            highlight={null}
            ghosts={[]}
            closed={[]}
            dim={false}
            label={label}
          />
          <p className="board-caption">
            Each column is a period, that is, a color. A column holds that color's classes, so its height is the color
            class size; the tallest column sets the rooms needed.
          </p>
          <div className="legend">
            <span className="key"><i className="key-blk" />a class (vertex), colored by section</span>
            <span className="key"><i className="key-hatch" />room-period left empty</span>
            <span className="key"><i className="key-floor" />lower bound: {plural(pb.lb, "room")}</span>
          </div>
        </div>

        <aside className="tally" aria-label="Rooms">
          <div className="count-block">
            <div className="count-num">
              <Counter value={roomsNow} width={String(maxRows).length} animate={!reduced && anim.kind === "sweep"} />
              <ChalkCircle state={phase === "after" ? circle : "hidden"} value={roomsNow} />
            </div>
            <p className="count-label" aria-live="polite">
              <span className="sr-only">{roomsNow}</span> {roomsNow === 1 ? "room" : "rooms"}
              {phase === "after" && optimal && circle !== "hidden" && <span className="count-proof"> = lower bound</span>}
            </p>
          </div>
          <dl className="stats">
            <div>
              <dt>Method</dt>
              <dd className="method-name">{phase === "before" ? out.manual.name : "LOWERBOUND"}</dd>
            </div>
            <div>
              <dt>Empty room-periods</dt>
              <dd className="waste num">{fmt(Math.round(empty))}</dd>
            </div>
            <div>
              <dt>Clashes</dt>
              <dd className="num">
                {shownCheck === null ? "0" : "!"} <small>{shownCheck === null ? "verified" : shownCheck}</small>
              </dd>
            </div>
          </dl>
          {!done ? (
            <button className="btn btn-chalk btn-big" onClick={run} disabled={phase === "after"}>
              {phase === "after" ? "Solving…" : "Run LOWERBOUND"}
            </button>
          ) : (
            <div className="after-controls">
              <div className="seg" role="radiogroup" aria-label="Show">
                <button role="radio" aria-checked={phase === "before"} onClick={() => show("before")}>Baseline</button>
                <button role="radio" aria-checked={phase === "after"} onClick={() => show("after")}>LOWERBOUND</button>
              </div>
              <button className="btn btn-quiet" onClick={replay}>Replay</button>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
