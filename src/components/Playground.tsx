import { useEffect, useMemo, useRef, useState } from "react";
import type { PipelineTrace } from "../engine/trace";
import { dayShort, fmt, plural, slotLabel } from "../lib/labels";
import { chord, neighbours, periodColor, ringLayout } from "../lib/ring";
import type { Solution } from "../lib/solution";
import { Pseudo, Section } from "./Section";

const PSEUDO = [
  "DSATUR(G, T)",
  "  while some vertex is uncoloured",
  "    v ← uncoloured vertex with the highest saturation",
  "         (ties: highest degree, then lowest index)",
  "    t ← least-loaded period not used by v's neighbours",
  "         (same subject twice that day counts as +1.5)",
  "    colour v with t;  neighbours of v lose period t",
  "  rooms ← largest number of vertices with one colour",
];
const SPEEDS = [2, 10, 50, 250];

export function Playground({ sol, trace }: { sol: Solution; trace: PipelineTrace | null }) {
  const { pb, codes } = sol;
  const steps = trace?.dsatur ?? [];
  const n = steps.length;
  const ring = useMemo(() => ringLayout(pb, 600, 214), [pb]);
  const [c, setC] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(10);
  const cRef = useRef(c);
  cRef.current = c;

  useEffect(() => { setC(0); setPlaying(false); }, [trace]);
  useEffect(() => {
    if (!playing) return;
    const every = Math.max(16, 1000 / speed);
    const per = Math.max(1, Math.round((speed * every) / 1000));
    const id = window.setInterval(() => {
      const next = Math.min(n, cRef.current + per);
      setC(next);
      if (next >= n) setPlaying(false);
    }, every);
    return () => window.clearInterval(id);
  }, [playing, speed, n]);

  const state = useMemo(() => {
    const period = new Int16Array(pb.n).fill(-1);
    const load = new Array(pb.T).fill(0);
    for (let i = 0; i < c; i++) {
      period[steps[i].v] = steps[i].t;
      load[steps[i].t]++;
    }
    return { period, load };
  }, [c, steps, pb]);

  if (!trace || !n) {
    return (
      <Section id="dsatur" step={4} title="DSatur, step by step">
        <p className="section-lede">DSatur could not color this dataset with {pb.T} periods, so there is nothing to step through.</p>
      </Section>
    );
  }

  const cur = c > 0 ? steps[c - 1] : null;
  const curS = cur ? pb.sessions[cur.v] : null;
  const coloredNb = cur ? (() => {
    const nb = neighbours(pb, cur.v);
    return [...nb.sec, ...nb.both, ...nb.fac].filter((u) => state.period[u] >= 0);
  })() : [];
  const blocked = new Set(coloredNb.map((u) => state.period[u]));
  const availSet = new Set(cur?.avail ?? []);
  const peak = cur?.peak ?? 0;
  const chosenLoad = cur ? cur.availLoad[cur.avail.indexOf(cur.t)] : 0;
  const active = c === 0 ? [1, 2] : c >= n ? [8] : [3, 4, 5, 6, 7];

  const go = (to: number) => { setPlaying(false); setC(Math.max(0, Math.min(n, to))); };

  return (
    <Section
      id="dsatur"
      step={4}
      title="DSatur, step by step"
      lede="DSatur colors the most constrained class first. A class's saturation is how many different periods its neighbours already use; those periods are closed to it. Step through all the choices the solver makes on this data."
    >
      <div className="play-grid">
        <div className="play-graph">
          <svg viewBox={`0 0 ${ring.size} ${ring.size}`} className="play-svg" role="img"
            aria-label={`Conflict graph after ${c} of ${n} DSatur steps: ${c} vertices coloured, busiest period has ${peak} classes.`}>
            {cur && (
              <g className="play-edges">
                {coloredNb.map((u) => <path key={u} d={chord(ring, cur.v, u)} style={{ stroke: periodColor(state.period[u], pb.T) }} />)}
              </g>
            )}
            <g>
              {pb.sessions.map((x) => {
                const t = state.period[x.id];
                const sel = cur && x.id === cur.v;
                return (
                  <circle key={x.id} cx={ring.x[x.id]} cy={ring.y[x.id]} r={sel ? ring.dotR + 3.5 : t >= 0 ? ring.dotR + 0.9 : ring.dotR}
                    className={sel ? "pdot sel" : t >= 0 ? "pdot on" : "pdot"}
                    style={t >= 0 ? { fill: periodColor(t, pb.T) } : undefined} />
                );
              })}
            </g>
            <text x={ring.cx} y={ring.cy - 6} textAnchor="middle" className="play-center">{c} / {fmt(n)}</text>
            <text x={ring.cx} y={ring.cy + 16} textAnchor="middle" className="play-center-sub">vertices coloured</text>
          </svg>
          <p className="play-legend">
            Grey: not coloured yet. Colour = period. {cur ? "Lines join the selected class to its already-coloured neighbours: their periods are the ones closed to it." : ""}
          </p>
        </div>

        <div className="play-side">
          <div className="play-controls" role="group" aria-label="Step controls">
            <button className="btn btn-quiet sm" onClick={() => go(0)} aria-label="Reset">⏮</button>
            <button className="btn btn-quiet sm" onClick={() => go(c - 1)} aria-label="Step back" disabled={c === 0}>◀</button>
            <button className="btn btn-chalk sm play-btn" onClick={() => { if (c >= n) setC(0); setPlaying(!playing); }}>
              {playing ? "Pause" : c >= n ? "Replay" : "Play"}
            </button>
            <button className="btn btn-quiet sm" onClick={() => go(c + 1)} aria-label="Step forward" disabled={c >= n}>▶</button>
            <button className="btn btn-quiet sm" onClick={() => go(n)} aria-label="Jump to the end">⏭</button>
            <div className="seg sm" role="radiogroup" aria-label="Speed">
              {SPEEDS.map((s) => (
                <button key={s} role="radio" aria-checked={speed === s} onClick={() => setSpeed(s)}>{s}/s</button>
              ))}
            </div>
          </div>
          <input type="range" className="play-scrub" min={0} max={n} value={c} onChange={(e) => go(Number(e.target.value))} aria-label="Step" />

          <div className="play-step" aria-live={playing ? "off" : "polite"}>
            <p className="play-count num">Step <b>{c}</b> of {fmt(n)}</p>
            {cur && curS ? (
              <>
                <h3>
                  <i className="sw" style={{ background: `var(--c${curS.sec % 12})` }} />
                  {pb.sections[curS.sec]} · {codes[curS.course]}
                </h3>
                <dl className="play-dl">
                  <div><dt>Saturation</dt><dd className="num"><b>{pb.T - cur.open}</b> of {pb.T} periods used by neighbours</dd></div>
                  <div><dt>Degree</dt><dd className="num">{cur.deg}</dd></div>
                  <div><dt>Why this vertex</dt><dd>{cur.tied ? `highest saturation; ${plural(cur.tied, "other")} tied on saturation and degree, lowest index wins` : "highest saturation (then degree) among the uncoloured"}</dd></div>
                  <div><dt>Available</dt><dd className="num">{cur.avail.length} periods</dd></div>
                  <div><dt>Assigned</dt><dd><b>{slotLabel(pb, cur.t)}</b> <span className="muted">least loaded available ({chosenLoad} {chosenLoad === 1 ? "class" : "classes"} before)</span></dd></div>
                </dl>
              </>
            ) : (
              <p className="muted">Nothing coloured yet. Every saturation is 0, so DSatur starts with the highest-degree class.</p>
            )}
          </div>

          <dl className="play-counters">
            <div><dt>Coloured</dt><dd className="num">{c}</dd></div>
            <div><dt>Remaining</dt><dd className="num">{n - c}</dd></div>
            <div><dt>Busiest period</dt><dd className="num">{peak}</dd></div>
            <div><dt>Lower bound</dt><dd className="num">{pb.lb}</dd></div>
          </dl>

          <div className="pgrid" role="table" aria-label="Classes per period so far" style={{ ["--cols" as string]: pb.P }}>
            <div role="row" className="pgrid-row head">
              <span role="columnheader" />
              {Array.from({ length: pb.P }, (_, p) => <span key={p} role="columnheader">P{p + 1}</span>)}
            </div>
            {Array.from({ length: pb.D }, (_, d) => (
              <div role="row" className="pgrid-row" key={d}>
                <span role="rowheader">{dayShort(d)}</span>
                {Array.from({ length: pb.P }, (_, p) => {
                  const t = d * pb.P + p;
                  const cls = [
                    "pcell",
                    cur && t === cur.t ? "chosen" : "",
                    cur && t !== cur.t && availSet.has(t) ? "avail" : "",
                    cur && blocked.has(t) ? "blocked" : "",
                    state.load[t] === peak && peak > 0 ? "peak" : "",
                  ].join(" ");
                  return (
                    <span role="cell" key={p} className={cls} title={`${slotLabel(pb, t)}: ${state.load[t]} classes`}>
                      <i style={{ height: `${(state.load[t] / Math.max(1, pb.lb)) * 100}%` }} />
                      <b className="num">{state.load[t]}</b>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="pgrid-key">
            <span className="k chosen" />assigned <span className="k avail" />available <span className="k blocked" />closed by a neighbour
          </p>
        </div>
      </div>

      <div className="play-foot">
        <Pseudo lines={PSEUDO} active={active} label="DSatur pseudocode" />
        <p className="muted small">
          The steps are recorded by a tracing copy of the engine's <code>runDSatur</code> that calls the engine's own feasibility
          and period-choice functions; a test checks it colours every vertex exactly like <code>Engine.solveAll</code>. On this
          data DSatur alone ends with a busiest period of {steps[n - 1].peak} classes, against a lower bound of {pb.lb}.
        </p>
      </div>
    </Section>
  );
}
