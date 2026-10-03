/* Stencil room counter whose digits roll like a tally drum, plus the chalk circle. */
import { useLayoutEffect, useRef, useState } from "react";

const STRIP = ["", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function Counter({ value, width, animate, delay = 150, duration = 900 }: {
  value: number;
  /** number of digit columns to reserve */
  width: number;
  animate: boolean;
  delay?: number;
  duration?: number;
}) {
  const text = String(value).padStart(width, " ");
  const transition = animate ? `transform ${duration}ms cubic-bezier(.3,.7,.2,1) ${delay}ms, width 300ms ease ${delay}ms` : "none";
  return (
    <span className="counter" aria-hidden>
      {text.split("").map((ch, i) => {
        const idx = ch === " " ? 0 : Number(ch) + 1;
        return (
          <span key={i} className={idx === 0 ? "digit blank" : "digit"} style={{ transition }}>
            <span className="strip" style={{ transform: `translateY(${-idx}em)`, transition }}>
              {STRIP.map((d, j) => (
                <span key={j}>{d || " "}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}

interface Ring {
  left: number;
  top: number;
  w: number;
  h: number;
  d: string;
  stroke: number;
}

/* A hand-drawn loop: an ellipse with a little wobble whose radius grows as the pen
 * goes round, so the end overshoots just outside where it started. */
function loopPath(cx: number, cy: number, rx: number, ry: number) {
  const start = (62 * Math.PI) / 180, sweep = 2 * Math.PI + 0.5, N = 96;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, th = start + sweep * t;
    const r = 1 + 0.022 * Math.sin(2 * th + 0.7) + 0.014 * Math.sin(5 * th + 1.3) + 0.07 * t;
    pts.push(`${(cx + rx * r * Math.cos(th)).toFixed(1)} ${(cy - ry * r * Math.sin(th)).toFixed(1)}`);
  }
  return `M${pts.join(" L")}`;
}

/* Rings the digits' visible ink, not their line box: the stencil face sits off-centre
 * in its em box, so the glyph bounds come from canvas text metrics for the same font,
 * placed where the counter lays out each digit column. */
function measureRing(host: HTMLElement, value: number): Ring | null {
  const counter = host.querySelector<HTMLElement>(".counter");
  const ctx = document.createElement("canvas").getContext("2d");
  if (!counter || !ctx) return null;
  const cs = getComputedStyle(host);
  const fs = parseFloat(cs.fontSize);
  ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  // each digit column is as wide as the widest digit, with the digit centred in it
  const col = Math.max(...STRIP.slice(1).map((d) => ctx.measureText(d).width));
  const hostBox = host.getBoundingClientRect(), box = counter.getBoundingClientRect();
  const ox = box.left - hostBox.left, oy = box.top - hostBox.top;
  let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
  String(value).split("").forEach((d, i) => {
    const m = ctx.measureText(d);
    const asc = m.fontBoundingBoxAscent, desc = m.fontBoundingBoxDescent;
    // line-height is 1em, so the font's ascent + descent sit centred in a 1em line
    const baseline = asc !== undefined && desc !== undefined ? (fs - asc - desc) / 2 + asc : fs * 0.8;
    const x0 = ox + i * col + (col - m.width) / 2;
    l = Math.min(l, x0 - m.actualBoundingBoxLeft);
    r = Math.max(r, x0 + m.actualBoundingBoxRight);
    t = Math.min(t, oy + baseline - m.actualBoundingBoxAscent);
    b = Math.max(b, oy + baseline + m.actualBoundingBoxDescent);
  });
  if (!(r > l && b > t)) return null;
  // corners of the ink box sit inside the ellipse: (w/2)^2/rx^2 + (h/2)^2/ry^2 < 1
  const ry = (b - t) * 0.78, rx = Math.max((r - l) * 0.78, ry * 0.72);
  const stroke = Math.max(3, fs * 0.032), pad = stroke + 8;
  const hw = rx * 1.11 + pad, hh = ry * 1.11 + pad;
  const cx = (l + r) / 2, cy = (t + b) / 2;
  return { left: cx - hw, top: cy - hh, w: 2 * hw, h: 2 * hh, d: loopPath(hw, hh, rx, ry), stroke };
}

export function ChalkCircle({ state, value }: { state: "hidden" | "drawing" | "shown"; value: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const [ring, setRing] = useState<Ring | null>(null);

  useLayoutEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    let live = true;
    const update = () => { if (live) setRing(measureRing(host, value)); };
    update();
    // re-measure once the stencil font has loaded, and when the counter resizes
    document.fonts?.ready.then(update);
    const ro = new ResizeObserver(update);
    ro.observe(host);
    return () => {
      live = false;
      ro.disconnect();
    };
  }, [value]);

  return (
    <svg
      ref={ref}
      className={`chalk-circle ${ring ? state : "hidden"}`}
      style={ring ? { left: ring.left, top: ring.top, width: ring.w, height: ring.h } : undefined}
      viewBox={ring ? `0 0 ${ring.w.toFixed(1)} ${ring.h.toFixed(1)}` : undefined}
      aria-hidden
    >
      <defs>
        <filter id="chalk-rough" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="3" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" />
        </filter>
      </defs>
      {ring && <path pathLength={1} filter="url(#chalk-rough)" strokeWidth={ring.stroke} d={ring.d} />}
    </svg>
  );
}
