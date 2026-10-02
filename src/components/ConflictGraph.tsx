import { useMemo, useState } from "react";
import { fmt, plural } from "../lib/labels";
import type { Solution } from "../lib/solution";

const SIZE = 660, C = SIZE / 2, R = 232;

type Focus = { kind: "section"; i: number } | { kind: "teacher"; i: number } | null;

export function ConflictGraph({ sol }: { sol: Solution }) {
  const { pb } = sol;
  const [focus, setFocus] = useState<Focus>(null);

  const layout = useMemo(() => {
    const gap = Math.min(0.07, 1 / pb.S);
    const step = (2 * Math.PI - gap * pb.S) / Math.max(1, pb.n);
    const dense = step * R < 4.2;
    const dotR = Math.max(1.1, Math.min(2.6, (step * R * (dense ? 2 : 1)) / 2.6));
    const dots: { x: number; y: number; sec: number }[] = [];
    const arcs: { sec: number; a0: number; a1: number }[] = [];
    // where each teacher's classes sit inside each section, to anchor the curves
    const anchor = new Map<string, { sum: number; k: number }>();
    let a = -Math.PI / 2 + gap / 2;
    let idx = 0;
    pb.secMembers.forEach((members, sec) => {
      const a0 = a;
      const ordered = members.slice().sort((x, y) => {
        const sx = pb.sessions[x], sy = pb.sessions[y];
        return sx.fac - sy.fac || sx.course - sy.course || sx.k - sy.k;
      });
      for (const v of ordered) {
        const ang = a + step / 2;
        const rr = dense && idx % 2 ? R - 6 : R;
        dots.push({ x: C + rr * Math.cos(ang), y: C + rr * Math.sin(ang), sec });
        const key = `${pb.sessions[v].fac}:${sec}`;
        const an = anchor.get(key) ?? { sum: 0, k: 0 };
        an.sum += ang;
        an.k++;
        anchor.set(key, an);
        a += step;
        idx++;
      }
      arcs.push({ sec, a0, a1: a });
      a += gap;
    });
    const curves: { f: number; s1: number; s2: number; d: string }[] = [];
    const facSecs: number[][] = Array.from({ length: pb.F }, () => []);
    for (const key of anchor.keys()) {
      const [f, s] = key.split(":").map(Number);
      facSecs[f].push(s);
    }
    const pt = (f: number, s: number, rr: number) => {
      const an = anchor.get(`${f}:${s}`)!;
      const ang = an.sum / an.k;
      return [C + rr * Math.cos(ang), C + rr * Math.sin(ang)];
    };
    facSecs.forEach((secs, f) => {
      secs.sort((x, y) => x - y);
      for (let i = 0; i < secs.length; i++)
        for (let j = i + 1; j < secs.length; j++) {
          const [x1, y1] = pt(f, secs[i], R - 12), [x2, y2] = pt(f, secs[j], R - 12);
          curves.push({ f, s1: secs[i], s2: secs[j], d: `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${C} ${C} ${x2.toFixed(1)} ${y2.toFixed(1)}` });
        }
    });
    return { dots, arcs, curves, dotR, facSecs };
  }, [pb]);

  const arcPath = (a0: number, a1: number, rr: number) => {
    const x0 = C + rr * Math.cos(a0), y0 = C + rr * Math.sin(a0);
    const x1 = C + rr * Math.cos(a1), y1 = C + rr * Math.sin(a1);
    return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${rr} ${rr} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  };

  const curveOn = (c: { f: number; s1: number; s2: number }) =>
    !focus ? null : focus.kind === "teacher" ? c.f === focus.i : c.s1 === focus.i || c.s2 === focus.i;
  const secOn = (s: number) =>
    !focus ? null : focus.kind === "section" ? s === focus.i : layout.facSecs[focus.i].includes(s);

  const sharedTeachers = layout.curves.length ? new Set(layout.curves.map((c) => c.f)).size : 0;
  const busySecPartners = (s: number) => {
    const partners = new Map<number, Set<number>>();
    for (const c of layout.curves) {
      if (c.s1 !== s && c.s2 !== s) continue;
      const other = c.s1 === s ? c.s2 : c.s1;
      if (!partners.has(other)) partners.set(other, new Set());
      partners.get(other)!.add(c.f);
    }
    return [...partners.entries()].sort((a, b) => a[0] - b[0]);
  };

  return (
    <section className="section" id="graph" aria-labelledby="graph-title">
      <h2 id="graph-title">The conflict graph</h2>
      <div className="graph-grid">
        <figure className="graph-fig" onMouseLeave={() => setFocus(null)}>
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            role="img"
            aria-label={`Conflict graph: ${pb.n} classes in ${pb.S} section arcs, ${layout.curves.length} curves joining sections that share a teacher.`}
          >
            <g className="curves">
              {layout.curves.map((c, i) => {
                const on = curveOn(c);
                return (
                  <g key={i} className={on === null ? "" : on ? "on" : "off"} onMouseEnter={() => setFocus({ kind: "teacher", i: c.f })}>
                    <path d={c.d} className="curve" style={on ? { stroke: `var(--c${c.s1 % 12})` } : undefined} />
                    <path d={c.d} className="curve-hit" />
                  </g>
                );
              })}
            </g>
            {layout.arcs.map(({ sec, a0, a1 }) => {
              const on = secOn(sec);
              const mid = (a0 + a1) / 2;
              const lx = C + (R + 30) * Math.cos(mid), ly = C + (R + 30) * Math.sin(mid);
              const cos = Math.cos(mid);
              return (
                <g
                  key={sec}
                  className={`sec ${on === null ? "" : on ? "on" : "off"}`}
                  tabIndex={0}
                  aria-label={`${pb.sections[sec]}: ${pb.secCount[sec]} classes`}
                  onMouseEnter={() => setFocus({ kind: "section", i: sec })}
                  onFocus={() => setFocus({ kind: "section", i: sec })}
                  onBlur={() => setFocus(null)}
                >
                  <path d={arcPath(a0, a1, R + 12)} className="sec-band" style={{ stroke: `var(--c${sec % 12})` }} />
                  <path d={arcPath(a0 - 0.01, a1 + 0.01, R)} className="sec-hit" />
                  <text x={lx} y={ly} textAnchor={cos > 0.2 ? "start" : cos < -0.2 ? "end" : "middle"} dominantBaseline="middle">
                    {pb.sections[sec]}
                  </text>
                </g>
              );
            })}
            <g className="dots" aria-hidden>
              {layout.dots.map((d, i) => {
                const on = secOn(d.sec);
                return (
                  <circle key={i} cx={d.x.toFixed(1)} cy={d.y.toFixed(1)} r={layout.dotR} style={{ fill: `var(--c${d.sec % 12})` }} opacity={on === false ? 0.25 : 1} />
                );
              })}
            </g>
          </svg>
          <figcaption>
            Each dot is one class, on its section's arc. Every dot on an arc clashes with every other dot on that arc (same
            students). Curves join sections that share a teacher. Hover or tab through the sections.
          </figcaption>
        </figure>

        <div className="graph-side">
          <dl className="graph-stats">
            <div><dt>V, classes</dt><dd className="stencil-num">{fmt(pb.n)}</dd></div>
            <div><dt>E, clashing pairs</dt><dd className="stencil-num">{fmt(pb.edges)}</dd></div>
          </dl>
          <div className="graph-detail" aria-live="polite">
            {focus?.kind === "section" ? (
              <>
                <h3>{pb.sections[focus.i]}</h3>
                <p>
                  {plural(pb.secCount[focus.i], "class", "classes")} a week. Each one clashes with the other {pb.secCount[focus.i] - 1}:
                  the same students can't be in two rooms.
                </p>
                {busySecPartners(focus.i).length ? (
                  <ul className="partners">
                    {busySecPartners(focus.i).map(([s, fs]) => (
                      <li key={s}>
                        <b>{pb.sections[s]}</b> via {[...fs].map((f) => pb.faculty[f]).join(", ")}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">Shares no teacher with another section.</p>
                )}
              </>
            ) : focus?.kind === "teacher" ? (
              <>
                <h3>{pb.faculty[focus.i]}</h3>
                <p>
                  Teaches {plural(pb.facCount[focus.i], "class", "classes")} across {layout.facSecs[focus.i].map((s) => pb.sections[s]).join(", ")}.
                  None of them can share a period.
                </p>
              </>
            ) : (
              <>
                <p>
                  Busiest section: <b>{pb.sections[pb.busiestSec]}</b>, {plural(pb.secCount[pb.busiestSec], "class", "classes")}.
                  <br />
                  Busiest teacher: <b>{pb.faculty[pb.busiestFac]}</b>, {plural(pb.facCount[pb.busiestFac], "class", "classes")}
                  {layout.facSecs[pb.busiestFac].length > 1 ? ` in ${layout.facSecs[pb.busiestFac].length} sections` : ""}.
                  <br />
                  {plural(sharedTeachers, "teacher")} link sections together.
                </p>
              </>
            )}
          </div>
          <p className="framing">
            Picking periods is <b>coloring this graph with {pb.T} colors</b>, one per period, so no edge joins two classes of
            the same color. Rooms needed is the size of the biggest color class. Keeping that small is NP-hard in general;
            DSatur is the classic heuristic, and the floor tells us when we can stop.
          </p>
        </div>
      </div>
    </section>
  );
}
