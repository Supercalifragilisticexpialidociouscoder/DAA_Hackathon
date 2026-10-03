import { useState } from "react";
import type { MethodResult, Problem } from "../engine/types";
import { dayShort } from "../lib/labels";
import type { Solution } from "../lib/solution";
import { Pseudo, Section } from "./Section";

type Key = "manual" | "welsh" | "dsatur" | "ours";
const KEYS: Key[] = ["manual", "welsh", "dsatur", "ours"];

const INFO: Record<Key, { title: string; idea: string; pseudo: string[] }> = {
  manual: {
    title: "Fill in order",
    idea: "How a timetable is filled by hand: section by section, cycling through each section's subjects, every class goes into the earliest period that is still free for its section and teacher. Greedy, no look-ahead, and it piles classes into the first periods of the week.",
    pseudo: [
      "for each section s, cycling its subjects:",
      "  for each class v of s:",
      "    t ← earliest period free for v",
      "        (prefer a day without this subject)",
      "    colour v with t",
    ],
  },
  welsh: {
    title: "Largest-first (Welsh–Powell)",
    idea: "Sort the classes by degree, most clashes first, and give each the least-loaded period it can take. Hard classes go first while the most periods are still open.",
    pseudo: [
      "order ← classes sorted by degree, descending",
      "for v in order:",
      "  t ← least-loaded period free for v",
      "  colour v with t",
    ],
  },
  dsatur: {
    title: "DSatur",
    idea: "Re-pick the most constrained class after every step: the one whose neighbours already use the most different periods (highest saturation), ties by degree. It adapts to the coloring as it grows.",
    pseudo: [
      "while uncoloured vertices remain:",
      "  v ← max saturation, then max degree",
      "  t ← least-loaded period free for v",
      "  colour v with t; update neighbours",
    ],
  },
  ours: {
    title: "LOWERBOUND",
    idea: "DSatur, then ejection-chain repair of the busiest periods, then a polish pass that removes same-subject repeats without raising the peak. If the floor or zero repeats is missed, it restarts DSatur with seeded random tie-breaks until a time budget runs out. Rooms are assigned last.",
    pseudo: [
      "c ← DSATUR(G)",
      "while peak(c) > ⌈n/T⌉: eject-and-reinsert",
      "polish(c) without raising peak(c)",
      "restart with seeded ties if not at the floor",
      "assign rooms period by period",
    ],
  },
};

function Profile({ pb, load, big }: { pb: Problem; load: number[]; big?: boolean }) {
  const max = Math.max(...load, pb.lb);
  const top = Math.max(max, 1);
  const bw = big ? 16 : 5, gap = big ? 3 : 1, dayGap = big ? 8 : 3, h = big ? 180 : 42;
  const x = (t: number) => (big ? 28 : 0) + t * (bw + gap) + Math.floor(t / pb.P) * dayGap;
  const W = x(pb.T - 1) + bw + (big ? 8 : 0);
  const y = (v: number) => h - (v / top) * (h - (big ? 16 : 2));
  const peak = Math.max(...load);
  return (
    <svg viewBox={`0 0 ${W} ${h + (big ? 22 : 0)}`} className={big ? "profile big" : "profile"} role={big ? "img" : undefined}
      aria-hidden={big ? undefined : true}
      aria-label={big ? `Classes per period; busiest period ${peak}, lower bound ${pb.lb}` : undefined}>
      {load.map((v, t) => (
        <rect key={t} x={x(t)} y={y(v)} width={bw} height={h - y(v)} className={v === peak ? "bar peak" : v > pb.lb ? "bar over" : "bar"}>
          {big && <title>{`${dayShort((t / pb.P) | 0)} P${(t % pb.P) + 1}: ${v} classes`}</title>}
        </rect>
      ))}
      <line x1={big ? 24 : 0} x2={W} y1={y(pb.lb)} y2={y(pb.lb)} className="lbline" />
      {big && (
        <>
          <text x={0} y={y(pb.lb) + 4} className="axis-t">{pb.lb}</text>
          {Array.from({ length: pb.D }, (_, d) => (
            <text key={d} x={x(d * pb.P) + ((bw + gap) * pb.P) / 2} y={h + 16} textAnchor="middle" className="axis-t">{dayShort(d)}</text>
          ))}
        </>
      )}
    </svg>
  );
}

const ms = (x: number) => (x < 1 ? x.toFixed(2) : x < 10 ? x.toFixed(1) : Math.round(x).toString());

export function Methods({ sol }: { sol: Solution }) {
  const { pb, out } = sol;
  const [sel, setSel] = useState<Key>("ours");
  const res = (k: Key): MethodResult => out[k];
  const r = res(sel);
  const info = INFO[sel];

  return (
    <Section
      id="method"
      step={5}
      title="Same input, same constraints, different algorithm"
      lede={`Four ways to color the same ${pb.n}-vertex graph with ${pb.T} periods. The bars show how many classes each one puts in each period: the tallest bar is the rooms it needs, and the dashed line is the lower bound.`}
    >
      <div className="mcards" role="radiogroup" aria-label="Method">
        {KEYS.map((k) => {
          const m = res(k);
          return (
            <button key={k} role="radio" aria-checked={sel === k} className={sel === k ? "mcard on" : "mcard"} onClick={() => setSel(k)}>
              <span className="mcard-name">{INFO[k].title}</span>
              {m.ok ? (
                <>
                  <span className="mcard-rooms"><b className="stencil-num">{m.rooms}</b> rooms</span>
                  <span className={m.rooms === pb.lb ? "mcard-gap ok" : "mcard-gap"}>gap {m.rooms - pb.lb}</span>
                  <Profile pb={pb} load={m.load} />
                </>
              ) : (
                <span className="mcard-gap">ran out of periods</span>
              )}
              <code className="mcard-o">{m.ok ? m.complexity : ""}</code>
            </button>
          );
        })}
      </div>

      <div className="mdetail">
        <div className="mdetail-text">
          <h3>{info.title}</h3>
          <p>{info.idea}</p>
          <dl className="mstats">
            <div><dt>Rooms</dt><dd className="num">{r.ok ? r.rooms : "—"}</dd></div>
            <div><dt>Gap to the bound</dt><dd className="num">{r.ok ? r.rooms - pb.lb : "—"}</dd></div>
            <div><dt>Time on this data</dt><dd className="num">{ms(r.ms)} ms</dd></div>
            <div><dt>Time complexity</dt><dd><code>{r.ok ? r.complexity : "—"}</code></dd></div>
          </dl>
          <Pseudo lines={info.pseudo} label={`${info.title} pseudocode`} />
        </div>
        <div className="mdetail-chart">
          {r.ok ? <Profile pb={pb} load={r.load} big /> : <p className="muted">This method could not place every class.</p>}
          <p className="muted small">Classes per period (color-class sizes), Monday to {pb.D === 6 ? "Saturday" : "Friday"}. Hover a bar for its count.</p>
        </div>
      </div>
    </Section>
  );
}
