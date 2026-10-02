import { useEffect, useMemo, useRef, useState } from "react";
import { disruptionSlots, type Disruption, type Move, type RescheduleResult } from "../engine/disrupt";
import { Engine } from "../engine/engine";
import type { Schedule } from "../engine/types";
import { useTween } from "../lib/hooks";
import { fmt, plural } from "../lib/labels";
import { emptyRoomPeriods, type Solution } from "../lib/solution";
import { ChalkCircle, Counter } from "./Counter";
import { ChangesPanel, DisruptionBar, type Applied } from "./Disruptions";
import { Matrix, type Anim } from "./Matrix";

interface Props {
  sol: Solution;
  history: Applied[];
  reduced: boolean;
  onApply: (d: Disruption) => RescheduleResult;
  onUndo: () => Applied | undefined;
  onClear: () => void;
}

type Phase = "before" | "after";

export function Hero({ sol, history, reduced, onApply, onUndo, onClear }: Props) {
  const { pb, before, after } = sol;
  const current: Schedule = history.length ? history[history.length - 1].result.schedule : after;

  const [phase, setPhase] = useState<Phase>("before");
  const [done, setDone] = useState(false); // the moment has played; show the toggle
  const [holdRows, setHoldRows] = useState(false); // keep the old rows while blocks travel
  const [anim, setAnim] = useState<Anim>({ kind: "none" });
  const [circle, setCircle] = useState<"hidden" | "drawing" | "shown">("hidden");
  const [highlight, setHighlight] = useState<Set<number> | null>(null);
  const [ghosts, setGhosts] = useState<Move[]>([]);
  const [dim, setDim] = useState(false);
  const timers = useRef<number[]>([]);
  const later = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)); };
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => () => clearTimers(), []);

  // a new dataset starts over in "today" mode
  useEffect(() => {
    clearTimers();
    setPhase("before");
    setDone(false);
    setHoldRows(false);
    setAnim({ kind: "none" });
    setCircle("hidden");
    setHighlight(null);
    setGhosts([]);
    setDim(false);
  }, [sol]);

  const shown = phase === "before" ? before : current;
  const maxRows = Math.max(before.rooms, current.rooms);
  const rows = phase === "before" || holdRows ? maxRows : current.rooms;
  const optimal = current.rooms <= pb.lb;

  const minimize = () => {
    clearTimers();
    setHighlight(null);
    setGhosts([]);
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

  const showBefore = () => {
    if (phase === "before") return;
    clearTimers();
    setCircle("hidden");
    setAnim(reduced ? { kind: "none" } : { kind: "sweep", dur: 520, stagger: 240, token: Date.now() });
    setPhase("before");
    later(900, () => setAnim({ kind: "none" }));
  };
  const showAfter = () => {
    if (phase === "after") return;
    clearTimers();
    if (reduced) {
      setPhase("after");
      setCircle(optimal ? "shown" : "hidden");
      return;
    }
    setAnim({ kind: "sweep", dur: 520, stagger: 240, token: Date.now() });
    setHoldRows(true);
    setPhase("after");
    later(800, () => { setHoldRows(false); if (optimal) setCircle("shown"); });
    later(900, () => setAnim({ kind: "none" }));
  };
  const replay = () => {
    clearTimers();
    setAnim({ kind: "none" });
    setPhase("before");
    setCircle("hidden");
    setDone(false);
    // let "today" paint first so the sweep has somewhere to start from
    later(60, minimize);
  };

  const animateMoves = (moves: Move[], ghostMoves: Move[]) => {
    const order = new Map(moves.map((m, i) => [m.v, i]));
    setHighlight(new Set(order.keys()));
    setGhosts(ghostMoves);
    if (reduced) return;
    clearTimers();
    setAnim({ kind: "moved", order, token: Date.now() });
    setDim(true);
    later(720 + moves.length * 70 + 50, () => setAnim({ kind: "none" }));
    later(2800, () => setDim(false));
  };

  const apply = (d: Disruption) => {
    const r = onApply(d);
    if (r.ok) {
      const moves = [...r.moves, ...r.roomSwaps].sort((a, b) => a.to - b.to);
      animateMoves(moves, moves);
      setCircle(r.schedule.rooms <= pb.lb ? "shown" : "hidden");
    }
    return r;
  };
  const undo = () => {
    const popped = onUndo();
    if (!popped) return;
    const back = [...popped.result.moves, ...popped.result.roomSwaps].map((m) => ({ ...m, from: m.to, to: m.from, fromRoom: m.toRoom, toRoom: m.fromRoom }));
    animateMoves(back, []);
    setGhosts([]);
    setCircle(popped.base.rooms <= pb.lb ? "shown" : "hidden");
  };
  const clear = () => {
    const all = new Map<number, Move>();
    for (const h of history) for (const m of [...h.result.moves, ...h.result.roomSwaps]) all.set(m.v, m);
    const back: Move[] = [];
    for (const v of all.keys()) {
      if (current.slot[v] !== after.slot[v] || current.room[v] !== after.room[v])
        back.push({ v, from: current.slot[v], to: after.slot[v], fromRoom: current.room[v], toRoom: after.room[v] });
    }
    onClear();
    animateMoves(back, []);
    setGhosts([]);
    setCircle(after.rooms <= pb.lb ? "shown" : "hidden");
  };

  const closed = useMemo(() => {
    if (phase === "before") return [];
    const cells: { t: number; r: number }[] = [];
    for (const h of history) if (h.d.kind === "room") for (const t of disruptionSlots(pb, h.d)) cells.push({ t, r: h.d.who });
    return cells;
  }, [history, phase, pb]);

  const verified = useMemo(() => Engine.verify(pb, shown.slot, shown.room), [pb, shown]);
  const roomsNow = phase === "before" ? before.rooms : current.rooms;
  const animateNumbers = !reduced && anim.kind === "sweep";
  const empty = useTween(emptyRoomPeriods(pb, roomsNow), animateNumbers, 900, 150);
  const freed = useTween(before.rooms - roomsNow, animateNumbers, 900, 150);
  const width = String(maxRows).length;
  const latest = history[history.length - 1];
  const totalMoved = useMemo(() => {
    let c = 0;
    for (let v = 0; v < pb.n; v++) if (current.slot[v] !== after.slot[v]) c++;
    return c;
  }, [pb, current, after]);

  const label =
    phase === "before"
      ? `Today's timetable: ${plural(before.rooms, "room")}, one per section, ${fmt(emptyRoomPeriods(pb, before.rooms))} room-periods empty`
      : `Minimized timetable: ${plural(current.rooms, "room")}, ${fmt(emptyRoomPeriods(pb, current.rooms))} room-periods empty`;

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <h1 id="hero-title">Your timetable is wasting classrooms.</h1>
        <p className="lede">
          Colleges give every section its own room, so rooms sit empty whenever a section is out. We reschedule the same
          classes into the fewest rooms the week allows, and prove no schedule can use fewer.
        </p>
      </div>

      <div className="stage">
        <div className="board">
          <div className="board-head">
            <p className="board-title">
              {phase === "before" ? (
                <>Today: one room per section</>
              ) : (
                <>Minimized: {plural(current.rooms, "room")} for the same {fmt(pb.n)} classes</>
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
            highlight={phase === "after" ? highlight : null}
            ghosts={phase === "after" ? ghosts : []}
            closed={closed}
            dim={dim && phase === "after"}
            label={label}
          />
          <div className="legend">
            <span className="key"><i className="key-blk" />a class, colored by section</span>
            <span className="key"><i className="key-hatch" />room standing empty</span>
            <span className="key"><i className="key-floor" />the floor: {plural(pb.lb, "room")}, the fewest possible</span>
            {phase === "after" && highlight && highlight.size > 0 && (
              <span className="key"><i className="key-moved" />just moved</span>
            )}
          </div>
          <ul className="sections-key" aria-label="Section colors">
            {pb.sections.map((s, i) => (
              <li key={s}><i style={{ background: `var(--c${i % 12})` }} />{s}</li>
            ))}
          </ul>
        </div>

        <aside className="tally" aria-label="Result">
          <div className="count-block">
            <div className="count-num">
              <Counter value={roomsNow} width={width} animate={!reduced && anim.kind === "sweep"} />
              <ChalkCircle state={phase === "after" ? circle : "hidden"} digits={String(roomsNow).length} />
            </div>
            <p className="count-label" aria-live="polite">
              <span className="sr-only">{roomsNow}</span> {roomsNow === 1 ? "room" : "rooms"}
              {phase === "after" && optimal && circle !== "hidden" && <span className="count-proof"> = the floor</span>}
            </p>
          </div>
          <dl className="stats">
            <div>
              <dt>Empty room-periods a week</dt>
              <dd className="waste num">{fmt(Math.round(empty))}</dd>
            </div>
            <div>
              <dt>Classrooms freed</dt>
              <dd className="num">{Math.round(freed)}</dd>
            </div>
            <div>
              <dt>Clashes</dt>
              <dd className="num">
                {verified === null ? "0" : "!"} <small>{verified === null ? "verified" : verified}</small>
              </dd>
            </div>
          </dl>
          {!done ? (
            <button className="btn btn-chalk btn-big" onClick={minimize} disabled={phase === "after"}>
              {phase === "after" ? "Minimizing…" : "Minimize rooms"}
            </button>
          ) : (
            <div className="after-controls">
              <div className="seg" role="radiogroup" aria-label="Show timetable">
                <button role="radio" aria-checked={phase === "before"} onClick={showBefore}>Before</button>
                <button role="radio" aria-checked={phase === "after"} onClick={showAfter}>After</button>
              </div>
              <button className="btn btn-quiet" onClick={replay}>Replay</button>
            </div>
          )}
        </aside>
      </div>

      {done && phase === "after" && (
        <DisruptionBar sol={sol} current={current} history={history} onApply={apply} onUndo={undo} onClear={clear} />
      )}
      {done && phase === "after" && latest && <ChangesPanel sol={sol} applied={latest} totalMoved={totalMoved} />}
    </section>
  );
}
