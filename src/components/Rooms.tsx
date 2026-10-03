import { useMemo, useState } from "react";
import { dayShort, plural, roomName, slotLabel } from "../lib/labels";
import type { Solution } from "../lib/solution";
import { Section } from "./Section";

export function Rooms({ sol }: { sol: Solution }) {
  const { pb, codes, after, ours } = sol;
  const byPeriod = useMemo(() => {
    const lists: number[][] = Array.from({ length: pb.T }, () => []);
    for (let v = 0; v < pb.n; v++) lists[after.slot[v]].push(v);
    for (const l of lists) l.sort((a, b) => after.room[a] - after.room[b]);
    return lists;
  }, [pb, after]);
  const sizes = byPeriod.map((l) => l.length);
  const max = Math.max(...sizes);
  const atMax = sizes.filter((s) => s === max).length;
  const [t, setT] = useState(() => sizes.indexOf(max));
  const sel = byPeriod[Math.min(t, pb.T - 1)];
  const switches = ours.switches ?? 0;

  const bw = 15, gap = 3, dayGap = 8, h = 150;
  const x = (k: number) => 30 + k * (bw + gap) + Math.floor(k / pb.P) * dayGap;
  const W = x(pb.T - 1) + bw + 8;
  const y = (v: number) => h - (v / Math.max(1, max)) * (h - 14);

  return (
    <Section
      id="rooms"
      step={8}
      title="Room assignment comes last"
      lede="Coloring fixes every class's period first. The classes in one period may share the time, but each needs its own room, so a period with k classes needs k distinct rooms. The rooms needed overall is therefore the size of the largest color class."
    >
      <ol className="flow" aria-label="From class to room">
        {["Class", "Conflict graph", "Period (color)", "Color-class size", "Room assignment"].map((s, i, a) => (
          <li key={s}>{s}{i < a.length - 1 && <span aria-hidden> →</span>}</li>
        ))}
      </ol>

      <div className="rooms-grid">
        <div>
          <svg viewBox={`0 0 ${W} ${h + 22}`} className="profile big" role="img"
            aria-label={`Color-class sizes per period; the largest is ${max}, reached in ${atMax} periods.`}>
            {sizes.map((v, k) => (
              <rect key={k} x={x(k)} y={y(v)} width={bw} height={h - y(v)}
                className={`bar clickable${v === max ? " peak" : ""}${k === t ? " sel" : ""}`}
                onClick={() => setT(k)}>
                <title>{`${slotLabel(pb, k)}: ${v} classes, ${v} distinct rooms`}</title>
              </rect>
            ))}
            <line x1="26" x2={W} y1={y(max)} y2={y(max)} className="lbline" />
            <text x="0" y={y(max) + 4} className="axis-t">{max}</text>
            {Array.from({ length: pb.D }, (_, d) => (
              <text key={d} x={x(d * pb.P) + ((bw + gap) * pb.P) / 2} y={h + 16} textAnchor="middle" className="axis-t">{dayShort(d)}</text>
            ))}
          </svg>
          <label className="field inline rooms-pick">
            <span>Period</span>
            <select value={t} onChange={(e) => setT(Number(e.target.value))}>
              {sizes.map((v, k) => <option key={k} value={k}>{slotLabel(pb, k)} · {v} classes</option>)}
            </select>
          </label>
          <p className="muted small">
            The largest color class has {max} classes ({plural(atMax, "period")} of {pb.T}), so {max} rooms are needed and
            enough. Click a bar to see its rooms.
          </p>
        </div>
        <div className="room-list-wrap">
          <h3>{slotLabel(pb, t)}: {plural(sel.length, "class", "classes")} in {plural(sel.length, "distinct room")} of {after.rooms}</h3>
          <ul className="room-list">
            {sel.map((v) => {
              const s = pb.sessions[v];
              return (
                <li key={v}>
                  <span className="plate sm">{roomName(after.room[v])}</span>
                  <i className="sw" style={{ background: `var(--c${s.sec % 12})` }} />
                  {pb.sections[s.sec]} · <b>{codes[s.course]}</b>
                </li>
              );
            })}
          </ul>
          <p className="muted small">
            Which room each class gets: a section keeps the room it used in the period before on the same day, else room
            (section number mod rooms), else the lowest free room. That gives {plural(switches, "room change")} a week across
            all sections; it never changes how many rooms are needed.
          </p>
        </div>
      </div>
    </Section>
  );
}
