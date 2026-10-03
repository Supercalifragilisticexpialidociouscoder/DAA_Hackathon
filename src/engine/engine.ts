/* LOWERBOUND engine
 * Problem: place every class session into a weekly period (slot) so that
 *   - no section attends two classes in the same period
 *   - no faculty member teaches two classes in the same period
 * and minimise the number of classrooms = max classes running in any one period.
 * Lower bound (pigeonhole): rooms >= ceil(sessions / periods).
 *
 * TypeScript port of reference/engine.js. The logic is unchanged line for line;
 * tests/parity.test.ts checks both versions produce identical schedules.
 */
import type { Course, MethodFail, MethodOk, Problem, Session, SolveAll, State } from "./types";

export function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rng = (() => number) | null;
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/* ---------- problem setup ---------- */
export function prepare(courses: Course[], D: number, P: number): Problem {
  const T = D * P;
  const secIdx = new Map<string, number>(), facIdx = new Map<string, number>();
  const sections: string[] = [], faculty: string[] = [];
  const sessions: Session[] = [];
  courses.forEach((c, ci) => {
    if (!secIdx.has(c.section)) { secIdx.set(c.section, sections.length); sections.push(c.section); }
    if (!facIdx.has(c.faculty)) { facIdx.set(c.faculty, faculty.length); faculty.push(c.faculty); }
    for (let k = 0; k < c.hours; k++) {
      sessions.push({ id: sessions.length, course: ci, sec: secIdx.get(c.section)!, fac: facIdx.get(c.faculty)!, k, deg: 0 });
    }
  });
  const n = sessions.length, S = sections.length, F = faculty.length;
  const secCount: number[] = new Array(S).fill(0), facCount: number[] = new Array(F).fill(0);
  const secMembers: number[][] = Array.from({ length: S }, () => []);
  const facMembers: number[][] = Array.from({ length: F }, () => []);
  const both = new Map<number, number>();
  for (const s of sessions) {
    secCount[s.sec]++; facCount[s.fac]++;
    secMembers[s.sec].push(s.id); facMembers[s.fac].push(s.id);
    const key = s.sec * F + s.fac;
    both.set(key, (both.get(key) || 0) + 1);
  }
  // degree in the conflict graph: sessions sharing the section OR the faculty
  for (const s of sessions) s.deg = secCount[s.sec] + facCount[s.fac] - both.get(s.sec * F + s.fac)! - 1;
  const edges = sessions.reduce((a, s) => a + s.deg, 0) / 2;

  let busiestSec = 0, busiestFac = 0;
  secCount.forEach((c, i) => { if (c > secCount[busiestSec]) busiestSec = i; });
  facCount.forEach((c, i) => { if (c > facCount[busiestFac]) busiestFac = i; });

  const problems: string[] = [];
  secCount.forEach((c, i) => { if (c > T) problems.push(`${sections[i]} needs ${c} classes but the week only has ${T} periods.`); });
  facCount.forEach((c, i) => { if (c > T) problems.push(`${faculty[i]} teaches ${c} classes but the week only has ${T} periods.`); });

  return {
    courses, D, P, T, sections, faculty, sessions, n, S, F,
    secCount, facCount, secMembers, facMembers, edges,
    lb: n > 0 ? Math.ceil(n / T) : 0,
    busiestSec, busiestFac,
    problems,
  };
}

/* ---------- mutable schedule state ---------- */
function makeState(pb: Problem): State {
  return {
    slot: new Int16Array(pb.n).fill(-1),
    load: new Int32Array(pb.T),
    secBusy: new Uint8Array(pb.T * pb.S),
    facBusy: new Uint8Array(pb.T * pb.F),
    courseDay: new Uint8Array(pb.courses.length * pb.D),
    members: Array.from({ length: pb.T }, () => [] as number[]),
  };
}
const feasible = (pb: Problem, st: State, v: number, t: number) => {
  const s = pb.sessions[v];
  return !st.secBusy[t * pb.S + s.sec] && !st.facBusy[t * pb.F + s.fac];
};
const repeats = (pb: Problem, st: State, v: number, t: number) => st.courseDay[pb.sessions[v].course * pb.D + ((t / pb.P) | 0)] > 0;
function place(pb: Problem, st: State, v: number, t: number) {
  const s = pb.sessions[v];
  st.slot[v] = t; st.load[t]++;
  st.secBusy[t * pb.S + s.sec] = 1; st.facBusy[t * pb.F + s.fac] = 1;
  st.courseDay[s.course * pb.D + ((t / pb.P) | 0)]++;
  st.members[t].push(v);
}
function unplace(pb: Problem, st: State, v: number) {
  const s = pb.sessions[v], t = st.slot[v];
  st.slot[v] = -1; st.load[t]--;
  st.secBusy[t * pb.S + s.sec] = 0; st.facBusy[t * pb.F + s.fac] = 0;
  st.courseDay[s.course * pb.D + ((t / pb.P) | 0)]--;
  const m = st.members[t]; m.splice(m.indexOf(v), 1);
}
const maxLoad = (st: State) => { let m = 0; for (const x of st.load) if (x > m) m = x; return m; };
function countRepeats(_pb: Problem, st: State) {
  let r = 0;
  for (const c of st.courseDay) if (c > 1) r += c - 1;
  return r;
}

/* ---------- slot choice rules ---------- */
// "first": how timetables are usually filled by hand: earliest free period,
//          avoiding the same subject twice in a day when possible.
function chooseFirst(pb: Problem, st: State, v: number, _rng?: Rng) {
  let fallback = -1;
  for (let t = 0; t < pb.T; t++) {
    if (!feasible(pb, st, v, t)) continue;
    if (!repeats(pb, st, v, t)) return t;
    if (fallback < 0) fallback = t;
  }
  return fallback;
}
// "minload": least-busy feasible period; a same-day repeat counts as extra load.
function chooseMinLoad(pb: Problem, st: State, v: number, rng?: Rng) {
  let best = -1, bestKey = Infinity, ties = 0;
  for (let t = 0; t < pb.T; t++) {
    if (!feasible(pb, st, v, t)) continue;
    const key = st.load[t] + (repeats(pb, st, v, t) ? 1.5 : 0);
    if (key < bestKey) { bestKey = key; best = t; ties = 1; }
    else if (key === bestKey && rng) { ties++; if (rng() * ties < 1) best = t; }
  }
  return best;
}

/* ---------- greedy orders ---------- */
type Run = { ok: true; st: State } | { ok: false; st: State; failed: number };
type Chooser = (pb: Problem, st: State, v: number, rng?: Rng) => number;
function runOrdered(pb: Problem, order: number[], chooser: Chooser, rng: Rng): Run {
  const st = makeState(pb);
  for (const v of order) {
    const t = chooser(pb, st, v, rng);
    if (t < 0) return { ok: false, st, failed: v };
    place(pb, st, v, t);
  }
  return { ok: true, st };
}

// DSatur: always place the class with the fewest periods still open to it
// (= highest saturation), breaking ties by conflict-degree.
function runDSatur(pb: Problem, rng: Rng): Run {
  const st = makeState(pb);
  const n = pb.n, T = pb.T;
  const open = new Int32Array(n).fill(T);
  const placed = new Uint8Array(n);
  const stamp = new Int32Array(n);
  let tick = 0;
  for (let step = 0; step < n; step++) {
    let v = -1, ties = 0;
    for (let u = 0; u < n; u++) {
      if (placed[u]) continue;
      if (v < 0 || open[u] < open[v] || (open[u] === open[v] && pb.sessions[u].deg > pb.sessions[v].deg)) { v = u; ties = 1; }
      else if (rng && open[u] === open[v] && pb.sessions[u].deg === pb.sessions[v].deg) { ties++; if (rng() * ties < 1) v = u; }
    }
    const t = chooseMinLoad(pb, st, v, rng);
    if (t < 0) return { ok: false, st, failed: v };
    // update open-period counts of unplaced neighbours before marking t busy
    tick++;
    const s = pb.sessions[v];
    const touch = (u: number) => {
      if (placed[u] || u === v || stamp[u] === tick) return;
      stamp[u] = tick;
      if (feasible(pb, st, u, t)) open[u]--;
    };
    pb.secMembers[s.sec].forEach(touch);
    pb.facMembers[s.fac].forEach(touch);
    place(pb, st, v, t);
    placed[v] = 1;
  }
  return { ok: true, st };
}

/* ---------- repair: ejection-chain local search ---------- */
// Repeatedly takes a class out of a fullest period and moves it to a period
// at least 2 below the peak. If one class blocks it there, that blocker is
// ejected to a third period (a 2-move chain). Stops at the lower bound.
type LogEntry = Record<string, number | string>;
function repair(pb: Problem, st: State, rng: Rng, log: LogEntry[] | null) {
  const T = pb.T, lb = pb.lb;
  let moves = 0;
  for (let iter = 0; iter < 20000; iter++) {
    const peak = maxLoad(st);
    if (peak <= lb) break;
    const targets: number[] = [];
    for (let t = 0; t < T; t++) if (st.load[t] <= peak - 2) targets.push(t);
    const keyOf = (v: number, t: number) => st.load[t] + (repeats(pb, st, v, t) ? 0.5 : 0) + (rng ? rng() * 0.01 : 0);
    let done = false;
    const fullest: number[] = [];
    for (let t = 0; t < T; t++) if (st.load[t] === peak) fullest.push(t);
    outer:
    for (const A of fullest) {
      for (const v of st.members[A].slice()) {
        // direct move
        const cand = targets.filter((B) => feasible(pb, st, v, B)).sort((x, y) => keyOf(v, x) - keyOf(v, y));
        if (cand.length) {
          unplace(pb, st, v); place(pb, st, v, cand[0]);
          moves++; if (log) log.push({ kind: "move", v, from: A, to: cand[0] });
          done = true; break outer;
        }
        // one-blocker ejection chain
        const sv = pb.sessions[v];
        for (const B of targets) {
          let blocker = -1, count = 0;
          for (const u of st.members[B]) {
            const su = pb.sessions[u];
            if (su.sec === sv.sec || su.fac === sv.fac) { blocker = u; count++; if (count > 1) break; }
          }
          if (count !== 1) continue;
          for (const C of targets) {
            if (C === B || !feasible(pb, st, blocker, C)) continue;
            unplace(pb, st, blocker); place(pb, st, blocker, C);
            unplace(pb, st, v); place(pb, st, v, B);
            moves += 2;
            if (log) log.push({ kind: "eject", v, from: A, to: B, u: blocker, uTo: C });
            done = true; break outer;
          }
        }
      }
    }
    if (!done) break;
  }
  return moves;
}


/* ---------- polish: remove same-subject-twice-a-day without raising the room count ---------- */
function polish(pb: Problem, st: State, log: LogEntry[] | null) {
  const cap = maxLoad(st), T = pb.T;
  let moves = 0;
  for (let iter = 0; iter < 5000; iter++) {
    let done = false;
    outer:
    for (let v = 0; v < pb.n; v++) {
      const A = st.slot[v];
      if (st.courseDay[pb.sessions[v].course * pb.D + ((A / pb.P) | 0)] < 2) continue;
      const sv = pb.sessions[v];
      for (let B = 0; B < T; B++) {
        if (B === A || st.load[B] >= cap || repeats(pb, st, v, B)) continue;
        if (feasible(pb, st, v, B)) {
          unplace(pb, st, v); place(pb, st, v, B); moves++;
          if (log) log.push({ kind: "polish", v, from: A, to: B });
          done = true; break outer;
        }
      }
      // swap with one blocker that can move to a third period
      for (let B = 0; B < T; B++) {
        if (B === A || repeats(pb, st, v, B)) continue;
        let blocker = -1, count = 0;
        for (const u of st.members[B]) {
          const su = pb.sessions[u];
          if (su.sec === sv.sec || su.fac === sv.fac) { blocker = u; if (++count > 1) break; }
        }
        if (count !== 1) continue;
        for (let C = 0; C < T; C++) {
          if (C === B || C === A || st.load[C] >= cap) continue;
          unplace(pb, st, blocker);
          if (feasible(pb, st, blocker, C) && !repeats(pb, st, blocker, C)) {
            place(pb, st, blocker, C);
            if (feasible(pb, st, v, B) && st.load[B] < cap) {
              unplace(pb, st, v); place(pb, st, v, B); moves += 2;
              if (log) log.push({ kind: "polish-swap", v, from: A, to: B, u: blocker, uTo: C });
              done = true; break outer;
            }
            unplace(pb, st, blocker);
          }
          place(pb, st, blocker, B);
        }
      }
    }
    if (!done) break;
  }
  return moves;
}

/* ---------- rooms ---------- */
// Inside each period, keep a section in the room it already used that day,
// else its home room, else any free room.
function assignRooms(pb: Problem, slotOf: ArrayLike<number>, rooms: number, fixedBySection: boolean) {
  const room = new Int16Array(pb.n).fill(-1);
  const bySlot: number[][] = Array.from({ length: pb.T }, () => []);
  for (let v = 0; v < pb.n; v++) if (slotOf[v] >= 0) bySlot[slotOf[v]].push(v);
  if (fixedBySection) {
    for (let v = 0; v < pb.n; v++) room[v] = pb.sessions[v].sec;
  } else {
    const lastRoom = new Int16Array(pb.S).fill(-1);
    for (let t = 0; t < pb.T; t++) {
      if (t % pb.P === 0) lastRoom.fill(-1);
      const used = new Uint8Array(rooms);
      const rest: number[] = [];
      for (const v of bySlot[t]) {
        const sec = pb.sessions[v].sec;
        const pref = lastRoom[sec] >= 0 ? lastRoom[sec] : sec % rooms;
        if (!used[pref]) { used[pref] = 1; room[v] = pref; } else rest.push(v);
      }
      for (const v of rest) {
        let r = 0; while (used[r]) r++;
        used[r] = 1; room[v] = r;
      }
      for (const v of bySlot[t]) lastRoom[pb.sessions[v].sec] = room[v];
    }
  }
  // room switches: consecutive classes of a section on the same day in different rooms
  let switches = 0;
  const seq: number[][] = Array.from({ length: pb.S }, () => []);
  for (let t = 0; t < pb.T; t++) for (const v of bySlot[t]) seq[pb.sessions[v].sec].push(v);
  for (const list of seq) {
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1], b = list[i];
      const sameDay = ((slotOf[a] / pb.P) | 0) === ((slotOf[b] / pb.P) | 0);
      if (sameDay && room[a] !== room[b]) switches++;
    }
  }
  return { room, switches };
}

/* ---------- full pipeline ---------- */
function finish(pb: Problem, name: string, res: Run, ms: number, extra: Partial<MethodOk>): MethodOk | MethodFail {
  if (!res.ok) return { name, ok: false, ms, failed: res.failed };
  return {
    name, ok: true, ms,
    slot: Array.from(res.st.slot),
    rooms: maxLoad(res.st),
    repeats: countRepeats(pb, res.st),
    load: Array.from(res.st.load),
    ...extra,
  };
}

export function solveAll(pb: Problem, seed = 7, budgetMs = 450): SolveAll {
  const out = {} as SolveAll;
  const inputOrder = pb.sessions.map((s) => s.id);
  // spread input order the way a person would fill a timetable: section by section,
  // cycling through that section's subjects
  const human: number[] = [];
  pb.secMembers.forEach((list) => {
    const byCourse = new Map<number, number[]>();
    for (const v of list) {
      const c = pb.sessions[v].course;
      if (!byCourse.has(c)) byCourse.set(c, []);
      byCourse.get(c)!.push(v);
    }
    const queues = [...byCourse.values()];
    let left = list.length;
    while (left > 0) for (const q of queues) if (q.length) { human.push(q.shift()!); left--; }
  });

  let t0 = now();
  const manual = runOrdered(pb, human, chooseFirst, null);
  out.manual = finish(pb, "Fill in order", manual, now() - t0, { complexity: "O(n·T)" });

  t0 = now();
  const byDeg = inputOrder.slice().sort((a, b) => pb.sessions[b].deg - pb.sessions[a].deg || a - b);
  const wp = runOrdered(pb, byDeg, chooseMinLoad, null);
  out.welsh = finish(pb, "Largest-first greedy", wp, now() - t0, { complexity: "O(n log n + n·T)" });

  t0 = now();
  const ds = runDSatur(pb, null);
  out.dsatur = finish(pb, "DSatur", ds, now() - t0, { complexity: "O(n² + E)" });

  // ours: DSatur + ejection-chain repair, with seeded restarts until the bound is hit
  t0 = now();
  const rng = mulberry32(seed);
  let best: { res: Run; r: number; rep: number; startRooms: number } | null = null, restarts = 0, bestMoves = 0, bestPolish = 0;
  while (true) {
    const res = runDSatur(pb, restarts === 0 ? null : rng);
    restarts++;
    if (res.ok) {
      const startRooms = maxLoad(res.st);
      const moves = repair(pb, res.st, restarts === 1 ? null : rng, null);
      const pmoves = polish(pb, res.st, null);
      const r = maxLoad(res.st), rep = countRepeats(pb, res.st);
      if (!best || r < best.r || (r === best.r && rep < best.rep)) { best = { res, r, rep, startRooms }; bestMoves = moves; bestPolish = pmoves; }
      if (r <= pb.lb && rep === 0) break;
    }
    if (now() - t0 > budgetMs && best) break;
    if (now() - t0 > budgetMs * 4) break;
  }
  out.ours = best
    ? finish(pb, "DSatur + repair", best.res, now() - t0, { complexity: "O(n² + E) + local search", restarts, moves: bestMoves, polishMoves: bestPolish, startRooms: best.startRooms })
    : { name: "DSatur + repair", ok: false, ms: now() - t0 };

  // rooms
  if (out.manual.ok) Object.assign(out.manual, assignRooms(pb, out.manual.slot, pb.S, true));
  if (out.ours.ok) Object.assign(out.ours, assignRooms(pb, out.ours.slot, out.ours.rooms, false));
  return out;
}

/* ---------- validation (used by tests and the UI's self-check) ---------- */
export function verify(pb: Problem, slot: ArrayLike<number>, room?: ArrayLike<number> | null) {
  const seenSec = new Set<string>(), seenFac = new Set<string>(), seenRoom = new Set<string>();
  for (let v = 0; v < pb.n; v++) {
    const s = pb.sessions[v], t = slot[v];
    if (t < 0 || t >= pb.T) return `class ${v} unplaced`;
    const a = t + ":" + s.sec, b = t + ":" + s.fac;
    if (seenSec.has(a)) return `section clash at ${t}`;
    if (seenFac.has(b)) return `faculty clash at ${t}`;
    seenSec.add(a); seenFac.add(b);
    if (room) { const c = t + ":" + room[v]; if (seenRoom.has(c)) return `room clash at ${t}`; seenRoom.add(c); }
  }
  return null;
}

export const Engine = { prepare, solveAll, verify, mulberry32 };

/* State primitives, exported so disruption handling (disrupt.ts) can edit a
 * finished schedule with the same feasibility rules instead of re-solving. */
export const internals = {
  makeState, feasible, repeats, place, unplace, maxLoad, countRepeats,
  // the pipeline's own stages, exported unchanged so the site can run them with
  // their built-in event logs (solveAll passes null) and show what they did
  chooseMinLoad, repair, polish, assignRooms,
};
export type { LogEntry };
