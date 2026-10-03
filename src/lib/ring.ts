/* Ring layout for the conflict graph: every class is a dot on its section's arc,
 * grouped by teacher inside the section. Shared by the graph explorer and the
 * DSatur playground so both draw the same picture. */
import type { Problem } from "../engine/types";

export interface Ring {
  size: number;
  cx: number;
  cy: number;
  r: number;
  dotR: number;
  /** dot position per vertex id */
  x: Float32Array;
  y: Float32Array;
  ang: Float32Array;
  /** vertex ids in angular order, for hit-testing */
  order: number[];
  arcs: { sec: number; a0: number; a1: number }[];
}

export function ringLayout(pb: Problem, size = 660, radius = 232): Ring {
  const cx = size / 2, cy = size / 2;
  const gap = Math.min(0.07, 1 / Math.max(1, pb.S));
  const step = (2 * Math.PI - gap * pb.S) / Math.max(1, pb.n);
  const dense = step * radius < 4.2;
  const dotR = Math.max(1.3, Math.min(2.8, (step * radius * (dense ? 2 : 1)) / 2.5));
  const x = new Float32Array(pb.n), y = new Float32Array(pb.n), ang = new Float32Array(pb.n);
  const order: number[] = [];
  const arcs: Ring["arcs"] = [];
  let a = -Math.PI / 2 + gap / 2, idx = 0;
  pb.secMembers.forEach((members, sec) => {
    const a0 = a;
    const sorted = members.slice().sort((p, q) => {
      const sp = pb.sessions[p], sq = pb.sessions[q];
      return sp.fac - sq.fac || sp.course - sq.course || sp.k - sq.k;
    });
    for (const v of sorted) {
      const th = a + step / 2;
      const rr = dense && idx % 2 ? radius - 7 : radius;
      x[v] = cx + rr * Math.cos(th);
      y[v] = cy + rr * Math.sin(th);
      ang[v] = th;
      order.push(v);
      a += step;
      idx++;
    }
    arcs.push({ sec, a0, a1: a });
    a += gap;
  });
  return { size, cx, cy, r: radius, dotR, x, y, ang, order, arcs };
}

/** Nearest vertex to an SVG-space point, or -1 if none is close. */
export function hitVertex(ring: Ring, px: number, py: number, slop = 9) {
  const { order, ang, x, y } = ring;
  if (!order.length) return -1;
  let th = Math.atan2(py - ring.cy, px - ring.cx);
  const start = ang[order[0]];
  while (th < start - 0.2) th += 2 * Math.PI;
  // binary search the angular order
  let lo = 0, hi = order.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ang[order[mid]] < th) lo = mid + 1;
    else hi = mid;
  }
  let best = -1, bestD = slop * slop;
  for (let i = Math.max(0, lo - 3); i <= Math.min(order.length - 1, lo + 3); i++) {
    const v = order[i], dx = x[v] - px, dy = y[v] - py, d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}

export function arcPath(ring: Ring, a0: number, a1: number, rr: number) {
  const { cx, cy } = ring;
  const x0 = cx + rr * Math.cos(a0), y0 = cy + rr * Math.sin(a0);
  const x1 = cx + rr * Math.cos(a1), y1 = cy + rr * Math.sin(a1);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${rr} ${rr} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

/** A chord between two dots that bows toward the centre (same-arc chords bow less). */
export function chord(ring: Ring, u: number, v: number) {
  const { x, y, cx, cy } = ring;
  const mx = (x[u] + x[v]) / 2, my = (y[u] + y[v]) / 2;
  const span = Math.hypot(x[u] - x[v], y[u] - y[v]) / (2 * ring.r);
  const pull = Math.min(0.85, 0.25 + span * 0.7);
  const qx = mx + (cx - mx) * pull, qy = my + (cy - my) * pull;
  return `M${x[u].toFixed(1)} ${y[u].toFixed(1)} Q${qx.toFixed(1)} ${qy.toFixed(1)} ${x[v].toFixed(1)} ${y[v].toFixed(1)}`;
}

/** A vertex's neighbours, split by why they clash. */
export function neighbours(pb: Problem, v: number) {
  const s = pb.sessions[v];
  const sec: number[] = [], fac: number[] = [], both: number[] = [];
  for (const u of pb.secMembers[s.sec]) {
    if (u === v) continue;
    if (pb.sessions[u].fac === s.fac) both.push(u);
    else sec.push(u);
  }
  for (const u of pb.facMembers[s.fac]) {
    if (u === v || pb.sessions[u].sec === s.sec) continue;
    fac.push(u);
  }
  return { sec, fac, both, degree: sec.length + fac.length + both.length };
}

/** Theme-aware colour for a period, as a hue around the wheel. */
export const periodColor = (t: number, T: number) => `hsl(${Math.round((t / T) * 330)} 55% var(--dot-l))`;
