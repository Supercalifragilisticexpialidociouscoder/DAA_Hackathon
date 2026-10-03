import { useEffect, useMemo, useRef, useState } from "react";
import { disruptionSlots, type Disruption, type Move, type RescheduleResult } from "../engine/disrupt";
import { fmt, plural } from "../lib/labels";
import type { Solution } from "../lib/solution";
import { ChangesPanel, DisruptionBar, type Applied } from "./Disruptions";
import { Matrix, type Anim } from "./Matrix";
import { Section } from "./Section";

const FLOW = [
  "Existing timetable",
  "Find affected classes",
  "Remove those vertices",
  "Mark blocked periods busy",
  "Reinsert, most constrained first",
  "Ejection chains (≤ 3 links)",
  "Roll back a failed chain",
  "Verify",
];

export function Incremental({ sol, history, reduced, onApply, onUndo, onClear }: {
  sol: Solution;
  history: Applied[];
  reduced: boolean;
  onApply: (d: Disruption) => RescheduleResult;
  onUndo: () => Applied | undefined;
  onClear: () => void;
}) {
  const { pb, after } = sol;
  const current = history.length ? history[history.length - 1].result.schedule : after;
  const latest = history[history.length - 1];
  const [anim, setAnim] = useState<Anim>({ kind: "none" });
  const [highlight, setHighlight] = useState<Set<number> | null>(null);
  const [ghosts, setGhosts] = useState<Move[]>([]);
  const [dim, setDim] = useState(false);
  const timers = useRef<number[]>([]);
  const later = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)); };
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => () => clearTimers(), []);
  useEffect(() => { clearTimers(); setAnim({ kind: "none" }); setHighlight(null); setGhosts([]); setDim(false); }, [sol]);

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
    }
    return r;
  };
  const undo = () => {
    const popped = onUndo();
    if (!popped) return;
    animateMoves([...popped.result.moves, ...popped.result.roomSwaps].map((m) => ({ ...m, from: m.to, to: m.from, fromRoom: m.toRoom, toRoom: m.fromRoom })), []);
  };
  const clear = () => {
    const back: Move[] = [];
    for (let v = 0; v < pb.n; v++) {
      if (current.slot[v] !== after.slot[v] || current.room[v] !== after.room[v])
        back.push({ v, from: current.slot[v], to: after.slot[v], fromRoom: current.room[v], toRoom: after.room[v] });
    }
    onClear();
    animateMoves(back, []);
  };

  const closed = useMemo(() => {
    const cells: { t: number; r: number }[] = [];
    for (const h of history) if (h.d.kind === "room") for (const t of disruptionSlots(pb, h.d)) cells.push({ t, r: h.d.who });
    return cells;
  }, [history, pb]);
  let totalMoved = 0;
  for (let v = 0; v < pb.n; v++) if (current.slot[v] !== after.slot[v]) totalMoved++;

  return (
    <Section
      id="incremental"
      step={11}
      title="Incremental repair"
      lede="When a teacher is out, a room is closed or a section is away, we do not throw the timetable away and solve from scratch. Only the affected vertices are removed and reinserted; everything else stays exactly where it was."
    >
      <ol className="flow" aria-label="Incremental repair pipeline">
        {FLOW.map((s, i) => (
          <li key={s}>{s}{i < FLOW.length - 1 && <span aria-hidden> →</span>}</li>
        ))}
      </ol>
      <DisruptionBar sol={sol} current={current} history={history} onApply={apply} onUndo={undo} onClear={clear} />
      <div className="board inc-board">
        <div className="board-head">
          <p className="board-title">
            {latest ? <>After {plural(history.length, "disruption")}: {plural(current.rooms, "room")}</> : <>The solved timetable: {plural(current.rooms, "room")}</>}
          </p>
          <p className="board-meta">{fmt(pb.n)} classes · {totalMoved ? `${plural(totalMoved, "class", "classes")} moved this week` : "nothing moved yet"}</p>
        </div>
        <Matrix
          sol={sol}
          schedule={current}
          rows={current.rooms}
          maxRows={Math.max(current.rooms, after.rooms)}
          anim={anim}
          highlight={highlight}
          ghosts={ghosts}
          closed={closed}
          dim={dim}
          label={`Timetable after disruptions: ${plural(current.rooms, "room")}`}
        />
        <div className="legend">
          <span className="key"><i className="key-moved" />moved by the last change</span>
          <span className="key"><i className="key-ghost" />where it was</span>
          <span className="key"><i className="key-closed" />closed room</span>
        </div>
      </div>
      {latest && <ChangesPanel sol={sol} applied={latest} totalMoved={totalMoved} />}
    </Section>
  );
}
