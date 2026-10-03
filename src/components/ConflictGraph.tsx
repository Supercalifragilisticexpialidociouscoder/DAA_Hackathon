import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { fmt, plural, roomName, slotLabel } from "../lib/labels";
import { arcPath, chord, hitVertex, neighbours, ringLayout } from "../lib/ring";
import type { Solution } from "../lib/solution";
import { Section } from "./Section";

export function ConflictGraph({ sol }: { sol: Solution }) {
  const { pb, codes, after } = sol;
  const ring = useMemo(() => ringLayout(pb), [pb]);
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maxDegV = useMemo(() => pb.sessions.reduce((b, s) => (s.deg > pb.sessions[b].deg ? s.id : b), 0), [pb]);
  const [pinned, setPinned] = useState(maxDegV);
  const [hover, setHover] = useState<number | null>(null);
  const [showSec, setShowSec] = useState(true);
  const [showFac, setShowFac] = useState(true);
  const [allEdges, setAllEdges] = useState(false);
  useEffect(() => { setPinned(maxDegV); setHover(null); }, [maxDegV]);

  const v = hover ?? pinned;
  const s = pb.sessions[v];
  const nb = useMemo(() => neighbours(pb, v), [pb, v]);
  const avgDeg = (2 * pb.edges) / Math.max(1, pb.n);
  const density = pb.n > 1 ? (2 * pb.edges) / (pb.n * (pb.n - 1)) : 0;

  // every edge, faintly, on a canvas behind the dots (12k+ lines is too many for SVG)
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = ring.size * dpr;
    cv.height = ring.size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ring.size, ring.size);
    if (!allEdges) return;
    ctx.strokeStyle = getComputedStyle(cv).color;
    ctx.globalAlpha = 0.05;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    const seen = (a: number, b: number) => a < b;
    for (let a = 0; a < pb.n; a++) {
      const sa = pb.sessions[a];
      for (const b of pb.secMembers[sa.sec]) if (seen(a, b)) { ctx.moveTo(ring.x[a], ring.y[a]); ctx.quadraticCurveTo(ring.cx + (ring.x[a] + ring.x[b] - 2 * ring.cx) * 0.35, ring.cy + (ring.y[a] + ring.y[b] - 2 * ring.cy) * 0.35, ring.x[b], ring.y[b]); }
      for (const b of pb.facMembers[sa.fac]) if (seen(a, b) && pb.sessions[b].sec !== sa.sec) { ctx.moveTo(ring.x[a], ring.y[a]); ctx.quadraticCurveTo(ring.cx, ring.cy, ring.x[b], ring.y[b]); }
    }
    ctx.stroke();
  }, [allEdges, ring, pb]);

  const toSvg = (e: PointerEvent) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return hitVertex(ring, p.x, p.y);
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const h = toSvg(e);
    setHover(h >= 0 ? h : null);
  };
  const onDown = (e: PointerEvent) => {
    const h = toSvg(e);
    if (h >= 0) { setPinned(h); setHover(null); }
  };
  const onKey = (e: KeyboardEvent) => {
    const i = ring.order.indexOf(pinned);
    let j = i;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") j = (i + 1) % pb.n;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = (i - 1 + pb.n) % pb.n;
    else if (e.key === "PageDown") j = ring.order.findIndex((u) => pb.sessions[u].sec === (s.sec + 1) % pb.S);
    else if (e.key === "PageUp") j = ring.order.findIndex((u) => pb.sessions[u].sec === (s.sec - 1 + pb.S) % pb.S);
    else return;
    e.preventDefault();
    setHover(null);
    setPinned(ring.order[j]);
  };

  const secNbrs = [...nb.sec, ...nb.both];
  const facNbrs = [...nb.fac, ...nb.both];
  const nbSet = new Set([...nb.sec, ...nb.fac, ...nb.both]);
  const course = pb.courses[s.course];

  return (
    <Section
      id="graph"
      step={3}
      title="The conflict graph"
      lede="This is the real graph built from the data: one dot per class, grouped on its section's arc. Hover or tap a class to draw its edges; arrow keys walk through the vertices."
    >
      <div className="graph-grid">
        <figure className="graph-fig">
          <div className="graph-tools">
            <label className="check"><input type="checkbox" checked={showSec} onChange={(e) => setShowSec(e.target.checked)} /> <i className="sw-sec" />section edges</label>
            <label className="check"><input type="checkbox" checked={showFac} onChange={(e) => setShowFac(e.target.checked)} /> <i className="sw-fac" />teacher edges</label>
            <label className="check"><input type="checkbox" checked={allEdges} onChange={(e) => setAllEdges(e.target.checked)} /> all {fmt(pb.edges)} edges</label>
          </div>
          <div className="graph-stack">
            <canvas ref={canvasRef} className="graph-canvas" aria-hidden />
            <svg
              ref={svgRef}
              viewBox={`0 0 ${ring.size} ${ring.size}`}
              className="graph-svg"
              tabIndex={0}
              role="img"
              aria-label={`Conflict graph with ${pb.n} vertices and ${pb.edges} edges. Selected: ${pb.sections[s.sec]} ${course.subject}, degree ${s.deg}. Arrow keys move between vertices, Page Up and Page Down between sections.`}
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
              onPointerDown={onDown}
              onKeyDown={onKey}
            >
              {ring.arcs.map(({ sec, a0, a1 }) => {
                const mid = (a0 + a1) / 2, cos = Math.cos(mid);
                const lx = ring.cx + (ring.r + 30) * cos, ly = ring.cy + (ring.r + 30) * Math.sin(mid);
                const on = sec === s.sec;
                return (
                  <g key={sec} className={on ? "sec on" : "sec"}>
                    <path d={arcPath(ring, a0, a1, ring.r + 13)} className="sec-band" style={{ stroke: `var(--c${sec % 12})` }} />
                    <text x={lx} y={ly} textAnchor={cos > 0.2 ? "start" : cos < -0.2 ? "end" : "middle"} dominantBaseline="middle">
                      {pb.sections[sec]}
                    </text>
                  </g>
                );
              })}
              <g className="nb-edges">
                {showSec && secNbrs.map((u) => <path key={`s${u}`} d={chord(ring, v, u)} className="e-sec" />)}
                {showFac && nb.fac.map((u) => <path key={`f${u}`} d={chord(ring, v, u)} className="e-fac" />)}
              </g>
              <g className="dots">
                {pb.sessions.map((x) => {
                  const isNb = nbSet.has(x.id);
                  const cls = x.id === v ? "dot sel" : isNb ? "dot nb" : "dot";
                  return <circle key={x.id} cx={ring.x[x.id]} cy={ring.y[x.id]} r={x.id === v ? ring.dotR + 2.5 : ring.dotR} className={cls} style={{ fill: `var(--c${x.sec % 12})` }} />;
                })}
              </g>
            </svg>
          </div>
        </figure>

        <div className="graph-side">
          <dl className="graph-stats">
            <div><dt>V, classes</dt><dd className="stencil-num">{fmt(pb.n)}</dd></div>
            <div><dt>E, clashing pairs</dt><dd className="stencil-num">{fmt(pb.edges)}</dd></div>
            <div><dt>Average degree</dt><dd className="small-num">{avgDeg.toFixed(1)}</dd></div>
            <div><dt>Density</dt><dd className="small-num">{(density * 100).toFixed(1)}%</dd></div>
          </dl>

          <div className="vcard" aria-live="polite">
            <p className="vcard-kicker">{hover !== null ? "Hovered vertex" : v === maxDegV ? "Highest-degree vertex" : "Selected vertex"}</p>
            <h3>
              <i className="sw" style={{ background: `var(--c${s.sec % 12})` }} />
              {pb.sections[s.sec]} · {codes[s.course]}
            </h3>
            <p className="vcard-sub">{course.subject}</p>
            <dl className="vcard-dl">
              <div><dt>Teacher</dt><dd>{pb.faculty[s.fac]}</dd></div>
              <div><dt>Degree</dt><dd className="num"><b>{nb.degree}</b></dd></div>
              <div><dt>Section conflicts</dt><dd className="num">{secNbrs.length} <span>same students</span></dd></div>
              <div><dt>Teacher conflicts</dt><dd className="num">{facNbrs.length} <span>same teacher</span></dd></div>
              <div><dt>Counted in both</dt><dd className="num">{nb.both.length} <span>its own other hours</span></dd></div>
              <div><dt>Final color</dt><dd>{slotLabel(pb, after.slot[v])} · {roomName(after.room[v])}</dd></div>
            </dl>
            <p className="vcard-formula num">
              degree = {secNbrs.length} + {facNbrs.length} − {nb.both.length} = {nb.degree}
            </p>
          </div>

          <p className="framing">
            Choosing periods is <b>coloring this graph with {pb.T} colors</b> so no edge joins two classes of the same
            color. Rooms needed is the size of the biggest color class. Every section's classes form a clique (all{" "}
            {plural(pb.secCount[pb.busiestSec], "class", "classes")} of {pb.sections[pb.busiestSec]} clash pairwise), and
            shared teachers link the cliques, which is why a period can't simply be filled section by section.
          </p>
        </div>
      </div>
    </Section>
  );
}
