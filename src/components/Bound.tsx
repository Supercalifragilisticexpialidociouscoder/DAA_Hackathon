import { useState } from "react";
import { fmt } from "../lib/labels";
import type { Solution } from "../lib/solution";
import { Section } from "./Section";

/* The pigeonhole bound, with a slider to try any room count against the counting argument. */
export function Bound({ sol }: { sol: Solution }) {
  const { pb, after } = sol;
  const { n, T, lb } = pb;
  const found = after.rooms;
  const lo = Math.max(1, lb - 3), hi = Math.max(pb.S, found);
  const [R, setR] = useState(Math.max(lo, lb - 1));
  const cap = R * T;
  const ratio = n / T;
  const below = lb - 1;
  const verdict =
    cap < n ? "impossible" : R >= found ? "achieved" : "open";

  // pigeonhole picture: T columns × R rows of room-periods, filled with the n classes
  const cw = 13, ch = 9, gx = 2, gy = 2;
  const width = T * (cw + gx) + 8;
  const overflow = Math.max(0, n - cap);
  const overRows = Math.ceil(overflow / T);
  const height = (R + overRows) * (ch + gy) + (overflow ? 18 : 6);

  return (
    <Section
      id="bound"
      step={2}
      title={<>Why {lb} is the minimum</>}
      lede={`Every class needs a room in its period. So the busiest period holds at least the average number of classes per period, rounded up. No timetable, by any algorithm, can use fewer rooms.`}
    >
      <div className="bound-grid">
        <div className="bound-math">
          <div className="frac-row">
            <span className="frac"><span>{fmt(n)}</span><span>{T}</span></span>
            <span className="op">=</span>
            <span className="val">{ratio.toFixed(2)}…</span>
          </div>
          <div className="frac-row">
            <span className="ceilx">{ratio.toFixed(2)}…</span>
            <span className="op">=</span>
            <span className="val accent">{lb}</span>
          </div>
          <p className="bound-claim">Lower bound = {lb} rooms</p>

          <ol className="bound-steps">
            <li>
              <span className="num">{below} rooms × {T} periods = {fmt(below * T)}</span> room-periods
            </li>
            <li>
              <span className="num">{fmt(n)} − {fmt(below * T)} = {fmt(n - below * T)}</span> classes would have nowhere to go
            </li>
            <li>So {below} rooms are impossible, whatever the timetable.</li>
            <li>
              LOWERBOUND found <b>{found}</b>. Gap = {found} − {lb} = <b>{found - lb}</b>
              {found === lb ? ", so the timetable is optimal." : ". Counting can't rule out a better one; finding the true minimum is NP-hard."}
            </li>
          </ol>
        </div>

        <div className="bound-try">
          <label className="slider">
            <span className="slider-top">
              <span>Try a room count</span>
              <output className="num">{R} rooms</output>
            </span>
            <input type="range" min={lo} max={hi} value={R} onChange={(e) => setR(Number(e.target.value))} aria-label="Room count" />
          </label>
          <p className={`try-verdict ${verdict}`} aria-live="polite">
            {verdict === "impossible" && (
              <>{R} × {T} = {fmt(cap)} room-periods &lt; {fmt(n)} classes: {fmt(n - cap)} left over. <b>Impossible.</b></>
            )}
            {verdict === "open" && (
              <>{fmt(cap)} room-periods ≥ {fmt(n)}: counting allows it, but our solver didn't find a timetable with {R} rooms.</>
            )}
            {verdict === "achieved" && (
              <>{fmt(cap)} room-periods ≥ {fmt(n)}. <b>Achieved</b>: LOWERBOUND's timetable uses {found}.</>
            )}
          </p>
          <svg viewBox={`0 0 ${width} ${height}`} className="pigeon" role="img"
            aria-label={`${R} rooms by ${T} periods: ${fmt(Math.min(n, cap))} room-periods filled${overflow ? `, ${overflow} classes left over` : ""}`}>
            {Array.from({ length: R }, (_, r) =>
              Array.from({ length: T }, (_, t) => {
                const i = t * R + r; // fill period by period
                return (
                  <rect key={`${r}:${t}`} x={4 + t * (cw + gx)} y={r * (ch + gy)} width={cw} height={ch} rx="1.5"
                    className={i < n ? "pg-full" : "pg-empty"} />
                );
              }),
            )}
            {overflow > 0 && (
              <>
                <text x="4" y={R * (ch + gy) + 12} className="pg-note">left over</text>
                {Array.from({ length: overflow }, (_, i) => (
                  <rect key={`o${i}`} x={4 + (i % T) * (cw + gx)} y={(R + Math.floor(i / T)) * (ch + gy) + 16} width={cw} height={ch} rx="1.5" className="pg-over" />
                ))}
              </>
            )}
          </svg>
          <p className="pg-caption">Each cell is one room in one period ({T} columns, {R} rows). Filled cells hold classes.</p>
        </div>
      </div>
    </Section>
  );
}
