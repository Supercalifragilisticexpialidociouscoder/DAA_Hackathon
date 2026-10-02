import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import type { Move } from "../engine/disrupt";
import type { Problem, Schedule } from "../engine/types";
import { dayShort, plural, roomName, slotLabel } from "../lib/labels";
import { useWidth } from "../lib/hooks";
import type { Solution } from "../lib/solution";

export type Anim =
  | { kind: "none" }
  | { kind: "sweep"; dur: number; stagger: number; token: number }
  | { kind: "moved"; order: Map<number, number>; token: number };

interface Props {
  sol: Solution;
  schedule: Schedule;
  /** rows that are visible (the matrix height follows this) */
  rows: number;
  /** rows that are drawn; rows past `rows` fade out while the matrix shrinks */
  maxRows: number;
  anim: Anim;
  highlight: Set<number> | null;
  ghosts: Move[];
  closed: { t: number; r: number }[];
  dim: boolean;
  label: string;
}

interface Geo {
  plate: number;
  gutter: number;
  head: number;
  cellW: number;
  rowH: number;
  dayGap: number;
  width: number;
  x: (t: number) => number;
  y: (r: number) => number;
}

function geometry(pb: Problem, avail: number): Geo {
  const narrow = avail < 640;
  const plate = narrow ? 40 : 48;
  const gutter = narrow ? 64 : 84;
  const dayGap = narrow ? 6 : 8;
  const head = 26;
  const rowH = narrow ? 22 : 26;
  const cellW = Math.max(12, Math.min(34, Math.floor((avail - plate - gutter - (pb.D - 1) * dayGap) / pb.T)));
  const width = plate + pb.T * cellW + (pb.D - 1) * dayGap + gutter;
  return {
    plate, gutter, head, cellW, rowH, dayGap, width,
    x: (t) => plate + t * cellW + ((t / pb.P) | 0) * dayGap,
    y: (r) => head + r * rowH,
  };
}

const EASE = "cubic-bezier(.62,.02,.24,1)";

const Blocks = memo(function Blocks({ pb, schedule, geo, anim, highlight }: {
  pb: Problem; schedule: Schedule; geo: Geo; anim: Anim; highlight: Set<number> | null;
}) {
  return (
    <>
      {pb.sessions.map((s) => {
        const t = schedule.slot[s.id], r = schedule.room[s.id];
        let transition = "none";
        if (anim.kind === "sweep") {
          const delay = (t / Math.max(1, pb.T - 1)) * anim.stagger;
          transition = `transform ${anim.dur}ms ${EASE} ${delay.toFixed(0)}ms`;
        } else if (anim.kind === "moved" && anim.order.has(s.id)) {
          transition = `transform 720ms ${EASE} ${anim.order.get(s.id)! * 70}ms`;
        }
        const style = {
          transform: `translate3d(${geo.x(t)}px, ${geo.y(r)}px, 0)`,
          width: geo.cellW,
          height: geo.rowH,
          transition,
          "--c": `var(--c${s.sec % 12})`,
        } as CSSProperties;
        return <div key={s.id} className={highlight?.has(s.id) ? "blk moved" : "blk"} style={style} />;
      })}
    </>
  );
});

export function Matrix({ sol, schedule, rows, maxRows, anim, highlight, ghosts, closed, dim, label }: Props) {
  const { pb, codes } = sol;
  const [wrapRef, avail] = useWidth<HTMLDivElement>();
  const geo = useMemo(() => geometry(pb, avail || 900), [pb, avail]);
  const boxRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ t: number; r: number; x: number; y: number } | null>(null);
  const [cursor, setCursor] = useState<{ t: number; r: number } | null>(null);
  const [pinned, setPinned] = useState(false);

  // a fixed-position tooltip would drift from its cell on scroll; a tapped one
  // should go away when tapping anywhere else
  useEffect(() => {
    if (!hover) return;
    const hide = () => { setHover(null); setPinned(false); };
    const outside = (e: globalThis.PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) hide();
    };
    window.addEventListener("scroll", hide, { passive: true, capture: true });
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("scroll", hide, { capture: true });
      document.removeEventListener("pointerdown", outside);
    };
  }, [hover]);

  const at = useMemo(() => {
    const a = new Int32Array(Math.max(maxRows, schedule.rooms) * pb.T).fill(-1);
    for (let v = 0; v < pb.n; v++) a[schedule.room[v] * pb.T + schedule.slot[v]] = v;
    return a;
  }, [pb, schedule, maxRows]);
  const closedSet = useMemo(() => new Set(closed.map((c) => c.r * pb.T + c.t)), [closed, pb]);
  const movedFrom = useMemo(() => new Map(ghosts.map((g) => [g.v, g])), [ghosts]);

  const height = geo.head + rows * geo.rowH + 24;
  const animating = anim.kind !== "none";

  const cellAt = (clientX: number, clientY: number) => {
    const box = boxRef.current!.getBoundingClientRect();
    const x = clientX - box.left, y = clientY - box.top;
    const gx = x - geo.plate;
    if (gx < 0) return null;
    const dayW = pb.P * geo.cellW + geo.dayGap;
    const d = Math.floor(gx / dayW);
    if (d >= pb.D) return null;
    const off = gx - d * dayW;
    if (off >= pb.P * geo.cellW) return null;
    const r = Math.floor((y - geo.head) / geo.rowH);
    if (r < 0 || r >= rows) return null;
    return { t: d * pb.P + Math.floor(off / geo.cellW), r };
  };

  const place = (c: { t: number; r: number }) => {
    const box = boxRef.current!.getBoundingClientRect();
    return { ...c, x: box.left + geo.x(c.t) + geo.cellW / 2, y: box.top + geo.y(c.r) };
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || animating) return;
    const c = cellAt(e.clientX, e.clientY);
    setPinned(false);
    setHover(c ? place(c) : null);
  };
  const onDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" || animating) return;
    const c = cellAt(e.clientX, e.clientY);
    setPinned(!!c);
    setHover(c ? place(c) : null);
  };
  const onKey = (e: KeyboardEvent) => {
    const cur = cursor ?? { t: 0, r: 0 };
    let { t, r } = cur;
    if (e.key === "ArrowRight") t = Math.min(pb.T - 1, t + 1);
    else if (e.key === "ArrowLeft") t = Math.max(0, t - 1);
    else if (e.key === "ArrowDown") r = Math.min(rows - 1, r + 1);
    else if (e.key === "ArrowUp") r = Math.max(0, r - 1);
    else if (e.key === "Home") t = 0;
    else if (e.key === "End") t = pb.T - 1;
    else if (e.key === "Escape") { setCursor(null); setHover(null); return; }
    else return;
    e.preventDefault();
    setCursor({ t, r });
    setHover(place({ t, r }));
  };

  const describe = (c: { t: number; r: number }) => {
    const v = at[c.r * pb.T + c.t];
    if (closedSet.has(c.r * pb.T + c.t)) return { v: -1, text: `${roomName(c.r)} is closed, ${slotLabel(pb, c.t)}` };
    if (v < 0) return { v, text: `${roomName(c.r)}, ${slotLabel(pb, c.t)}: empty` };
    const s = pb.sessions[v], course = pb.courses[s.course];
    return { v, text: `${roomName(c.r)}, ${slotLabel(pb, c.t)}: ${pb.sections[s.sec]}, ${course.subject}, ${course.faculty}` };
  };

  const tip = hover && !animating ? describe(hover) : null;
  const floorY = geo.y(pb.lb);
  const over = rows - pb.lb;
  const gutterX = geo.width - geo.gutter + 10;

  return (
    <div className="matrix-wrap" ref={wrapRef}>
      <div className="matrix-scroll">
        <div
          ref={boxRef}
          className={`matrix${animating ? " animating" : ""}${dim ? " dim" : ""}`}
          style={{ width: geo.width, height }}
          tabIndex={0}
          role="group"
          aria-label={`${label}. Use the arrow keys to read each room and period.`}
          onPointerMove={onMove}
          onPointerLeave={() => { if (!pinned) setHover(null); }}
          onPointerDown={onDown}
          onKeyDown={onKey}
          onBlur={() => { setCursor(null); setHover(null); }}
        >
          {Array.from({ length: pb.D }, (_, d) => (
            <div key={d} className="day-head" style={{ left: geo.x(d * pb.P), width: pb.P * geo.cellW }}>
              {dayShort(d)}
            </div>
          ))}
          {Array.from({ length: maxRows }, (_, r) => (
            <div key={r} className={r < rows ? "mrow" : "mrow gone"} aria-hidden>
              <div className="plate" style={{ top: geo.y(r) + 3, height: geo.rowH - 6, width: geo.plate - 10 }}>
                {roomName(r)}
              </div>
              {Array.from({ length: pb.D }, (_, d) => (
                <div
                  key={d}
                  className="hatch"
                  style={{ transform: `translate(${geo.x(d * pb.P)}px, ${geo.y(r)}px)`, width: pb.P * geo.cellW, height: geo.rowH }}
                />
              ))}
            </div>
          ))}
          {closed.map((c) => (
            <div
              key={`${c.r}:${c.t}`}
              className="closed-cell"
              style={{ transform: `translate(${geo.x(c.t)}px, ${geo.y(c.r)}px)`, width: geo.cellW, height: geo.rowH }}
            />
          ))}
          {ghosts.map((g) => (
            <div
              key={`g${g.v}`}
              className="ghost"
              style={{ transform: `translate(${geo.x(g.from)}px, ${geo.y(g.fromRoom)}px)`, width: geo.cellW, height: geo.rowH }}
            />
          ))}
          <Blocks pb={pb} schedule={schedule} geo={geo} anim={anim} highlight={highlight} />
          {cursor && (
            <div
              className="cursor"
              style={{ transform: `translate(${geo.x(cursor.t)}px, ${geo.y(cursor.r)}px)`, width: geo.cellW, height: geo.rowH }}
            />
          )}
          <div className="floor" style={{ top: floorY, left: geo.plate - 6, width: geo.width - geo.plate - geo.gutter + 12 }} />
          <div className="floor-note" style={{ top: floorY - 15, left: gutterX }}>
            <span>floor:</span> {plural(pb.lb, "room")}
          </div>
          {over > 0 ? (
            <div className="excess-note" style={{ top: floorY + 4, left: gutterX, height: over * geo.rowH - 8 }}>
              <span>+{over} over</span>
            </div>
          ) : (
            <div className="gap-note" style={{ top: floorY + 4, left: gutterX }}>gap 0</div>
          )}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">{cursor && tip ? tip.text : ""}</p>
      {tip && hover && (
        <div
          className={hover.y < 170 ? "tip below" : "tip"}
          role="presentation"
          style={{
            left: Math.min(Math.max(hover.x, 130), window.innerWidth - 130),
            top: hover.y < 170 ? hover.y + geo.rowH : hover.y,
          }}
        >
          {tip.v >= 0 ? (
            <TipBody sol={sol} v={tip.v} t={hover.t} r={hover.r} from={movedFrom.get(tip.v)} codes={codes} />
          ) : (
            <div className="tip-empty">{tip.text}</div>
          )}
        </div>
      )}
    </div>
  );
}

function TipBody({ sol, v, t, r, from, codes }: { sol: Solution; v: number; t: number; r: number; from?: Move; codes: string[] }) {
  const { pb } = sol;
  const s = pb.sessions[v], c = pb.courses[s.course];
  return (
    <>
      <div className="tip-head">
        <i className="sw" style={{ background: `var(--c${s.sec % 12})` }} />
        <b>{pb.sections[s.sec]}</b>
        <span className="tip-code">{codes[s.course]}</span>
      </div>
      <div className="tip-sub">{c.subject}</div>
      <div className="tip-sub">{c.faculty}</div>
      <div className="tip-when">
        <span>{slotLabel(pb, t)}</span>
        <span className="plate sm">{roomName(r)}</span>
      </div>
      {from && (
        <div className="tip-moved">
          moved from {slotLabel(pb, from.from)}, {roomName(from.fromRoom)}
        </div>
      )}
    </>
  );
}

