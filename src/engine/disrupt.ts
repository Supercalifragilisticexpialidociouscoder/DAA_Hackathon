/* Disruptions: a teacher is out, a room is closed, a section is away.
 *
 * We never re-solve. Starting from the current timetable we take out only the
 * classes that now sit in a blocked period (or in a closed room when that period
 * has run out of rooms), then put each one back with the engine's own state
 * primitives, cheapest first:
 *   1. a free period (no clash, a room still open),
 *   2. an ejection chain: take the period anyway and push the one or two classes
 *      in the way to other periods, the same move the repair step uses, with
 *      chains allowed to grow up to MAX_DEPTH links.
 * Goals in order: zero clashes, no more rooms than before, as few classes moved
 * as possible. Only if a class cannot fit anywhere do we try one extra room, and
 * the result says so.
 */
import { internals, verify } from "./engine";
import type { Problem, Schedule } from "./types";

const { makeState, feasible, repeats, place, unplace } = internals;
const MAX_DEPTH = 3;
const NODE_BUDGET = 40000;
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export type DisruptionKind = "teacher" | "room" | "section";

export interface Disruption {
  kind: DisruptionKind;
  /** faculty index, room index or section index, depending on kind */
  who: number;
  day: number;
  /** periods within the day (0-based); empty means the whole day */
  periods: number[];
}

/** Week periods covered by one disruption. */
export function disruptionSlots(pb: Problem, d: Disruption): number[] {
  const ps = d.periods.length ? d.periods : Array.from({ length: pb.P }, (_, p) => p);
  return ps.map((p) => d.day * pb.P + p);
}

/** Blocked slots, stored as bitmaps in the same layout as the engine's busy maps. */
export interface Blocks {
  sec: Uint8Array; // T × S
  fac: Uint8Array; // T × F
  room: Uint8Array; // T × roomCols
  roomCols: number;
}

export function buildBlocks(pb: Problem, list: Disruption[], roomCols: number): Blocks {
  const b: Blocks = {
    sec: new Uint8Array(pb.T * pb.S),
    fac: new Uint8Array(pb.T * pb.F),
    room: new Uint8Array(pb.T * roomCols),
    roomCols,
  };
  for (const d of list) {
    for (const t of disruptionSlots(pb, d)) {
      if (d.kind === "section") b.sec[t * pb.S + d.who] = 1;
      else if (d.kind === "teacher") b.fac[t * pb.F + d.who] = 1;
      else if (d.who < roomCols) b.room[t * roomCols + d.who] = 1;
    }
  }
  return b;
}

export const roomClosed = (b: Blocks, t: number, r: number) => r < b.roomCols && b.room[t * b.roomCols + r] === 1;

export interface Move {
  v: number;
  from: number;
  to: number;
  fromRoom: number;
  toRoom: number;
}

export interface RescheduleOk {
  ok: true;
  schedule: Schedule;
  /** classes that changed period */
  moves: Move[];
  /** classes that kept their period but changed room */
  roomSwaps: Move[];
  /** classes the disruption landed on directly */
  hit: number;
  /** classes moved only to make space (ejection chains) */
  chained: number;
  extraRoom: boolean;
  /** Engine.verify on the new timetable: null = no clashes */
  check: string | null;
  /** true when no class sits in a blocked period or a closed room */
  respectsBlocks: boolean;
  ms: number;
}
export interface RescheduleFail {
  ok: false;
  reason: string;
  ms: number;
}
export type RescheduleResult = RescheduleOk | RescheduleFail;

export function reschedule(pb: Problem, base: Schedule, list: Disruption[]): RescheduleResult {
  const t0 = now();
  const { T, S, F, P } = pb;
  const roomCols = base.rooms + 1;
  const blocks = buildBlocks(pb, list, roomCols);
  const fail = (reason: string): RescheduleFail => ({ ok: false, reason, ms: now() - t0 });

  // Can it work at all? Each section and teacher needs as many open periods as classes.
  for (let s = 0; s < S; s++) {
    let open = 0;
    for (let t = 0; t < T; t++) if (!blocks.sec[t * S + s]) open++;
    if (open < pb.secCount[s]) return fail(`${pb.sections[s]} has ${pb.secCount[s]} classes a week, but only ${open} periods stay open.`);
  }
  for (let f = 0; f < F; f++) {
    let open = 0;
    for (let t = 0; t < T; t++) if (!blocks.fac[t * F + f]) open++;
    if (open < pb.facCount[f]) return fail(`${pb.faculty[f]} teaches ${pb.facCount[f]} classes a week, but only ${open} periods stay open.`);
  }

  const st = makeState(pb);
  for (let v = 0; v < pb.n; v++) place(pb, st, v, base.slot[v]);

  let rooms = base.rooms;
  const cap = new Int32Array(T);
  const setCaps = () => {
    for (let t = 0; t < T; t++) {
      let c = 0;
      for (let r = 0; r < rooms; r++) if (!roomClosed(blocks, t, r)) c++;
      cap[t] = c;
    }
  };
  setCaps();
  let roomTotal = 0;
  for (let t = 0; t < T; t++) roomTotal += cap[t];
  if (roomTotal + T < pb.n) return fail(`Only ${roomTotal} room-periods stay open this week for ${pb.n} classes.`);

  // 1. Classes whose section or teacher is now blocked in their period.
  const out: number[] = [];
  for (let v = 0; v < pb.n; v++) {
    const s = pb.sessions[v], t = base.slot[v];
    if (blocks.sec[t * S + s.sec] || blocks.fac[t * F + s.fac]) out.push(v);
  }
  for (const v of out) unplace(pb, st, v);
  // 2. Periods left with more classes than open rooms: classes in the closed rooms leave.
  for (let t = 0; t < T; t++) {
    let excess = st.load[t] - cap[t];
    if (excess <= 0) continue;
    const inClosed = st.members[t].filter((v) => roomClosed(blocks, t, base.room[v])).sort((a, b) => a - b);
    for (const v of inClosed) {
      if (excess-- <= 0) break;
      unplace(pb, st, v);
      out.push(v);
    }
  }
  const hitSet = new Set(out);

  // 3. A blocked period counts as busy for that section or teacher, so the engine's
  //    own feasibility test keeps everyone out of it. (Nothing placed sits there now.)
  for (let i = 0; i < blocks.sec.length; i++) if (blocks.sec[i]) st.secBusy[i] = 1;
  for (let i = 0; i < blocks.fac.length; i++) if (blocks.fac[i]) st.facBusy[i] = 1;

  // Journal of edits so a failed chain can be rolled back exactly.
  const journal: [number, number][] = [];
  const doPlace = (v: number, t: number) => { journal.push([v, -1]); place(pb, st, v, t); };
  const doUnplace = (v: number) => { journal.push([v, st.slot[v]]); unplace(pb, st, v); };
  const rollback = (mark: number) => {
    while (journal.length > mark) {
      const [v, before] = journal.pop()!;
      if (st.slot[v] >= 0) unplace(pb, st, v);
      if (before >= 0) place(pb, st, v, before);
    }
  };
  const isBlocked = (v: number, t: number) => {
    const s = pb.sessions[v];
    return blocks.sec[t * S + s.sec] === 1 || blocks.fac[t * F + s.fac] === 1;
  };

  let nodes = 0;
  // Try to put v somewhere, allowing chains of up to `depth` further links.
  const search = (v: number, depth: number, tabu: Set<number>): boolean => {
    const sv = pb.sessions[v];
    const homeDay = (base.slot[v] / P) | 0;
    // prefer no same-subject repeat that day, then days close to the original, then periods with a free room
    const key = (t: number) =>
      (repeats(pb, st, v, t) ? 10 : 0) + Math.abs(((t / P) | 0) - homeDay) + (st.load[t] >= cap[t] ? 0.5 : 0) + t * 1e-4;
    const opts: number[] = [];
    for (let t = 0; t < T; t++) if (!isBlocked(v, t)) opts.push(t);
    opts.sort((a, b) => key(a) - key(b));

    for (const t of opts) {
      if (feasible(pb, st, v, t) && st.load[t] < cap[t]) { doPlace(v, t); return true; }
    }
    if (depth === 0) return false;

    for (const t of opts) {
      if (++nodes > NODE_BUDGET) return false;
      const inWay = st.members[t].filter((u) => {
        const su = pb.sessions[u];
        return su.sec === sv.sec || su.fac === sv.fac;
      });
      if (inWay.some((u) => tabu.has(u))) continue;
      const full = st.load[t] - inWay.length >= cap[t];
      // a full period also needs one more class to step out
      const extras = full ? st.members[t].filter((u) => !inWay.includes(u) && !tabu.has(u)) : [-1];
      for (const x of extras) {
        const ejected = x >= 0 ? [...inWay, x] : inWay;
        if (!ejected.length) continue;
        const mark = journal.length;
        for (const u of ejected) doUnplace(u);
        doPlace(v, t);
        tabu.add(v);
        let ok = true;
        for (const u of ejected) if (!search(u, depth - 1, tabu)) { ok = false; break; }
        tabu.delete(v);
        if (ok) return true;
        rollback(mark);
      }
    }
    return false;
  };
  const insert = (v: number) => {
    for (let depth = 0; depth <= MAX_DEPTH; depth++) {
      nodes = 0;
      if (search(v, depth, new Set([v]))) return true;
    }
    return false;
  };

  // 4. Re-place the displaced classes, most constrained first.
  const openCount = (v: number) => {
    let c = 0;
    for (let t = 0; t < T; t++) if (feasible(pb, st, v, t)) c++;
    return c;
  };
  const opens = new Map(out.map((v) => [v, openCount(v)]));
  const order = out.slice().sort((a, b) => opens.get(a)! - opens.get(b)! || pb.sessions[b].deg - pb.sessions[a].deg || a - b);
  const failed = order.filter((v) => !insert(v));
  if (failed.length) {
    // last resort: one more room, reported in the result as extraRoom
    rooms += 1;
    setCaps();
    const still = failed.filter((v) => !insert(v));
    if (still.length) {
      const s = pb.sessions[still[0]], c = pb.courses[s.course];
      return fail(
        `${c.section}'s ${c.subject} class with ${c.faculty} has nowhere to go: every open period clashes with ${c.section} or ${c.faculty}, even with an extra room.`,
      );
    }
  }

  const slot = Array.from(st.slot);
  const room = keepRooms(pb, base, slot, rooms, blocks);
  const usedRooms = Math.max(base.rooms, room.reduce((m, r) => Math.max(m, r + 1), 0));
  const moves: Move[] = [], roomSwaps: Move[] = [];
  let chained = 0;
  for (let v = 0; v < pb.n; v++) {
    const m = { v, from: base.slot[v], to: slot[v], fromRoom: base.room[v], toRoom: room[v] };
    if (m.from !== m.to) { moves.push(m); if (!hitSet.has(v)) chained++; }
    else if (m.fromRoom !== m.toRoom) roomSwaps.push(m);
  }
  let respectsBlocks = true;
  for (let v = 0; v < pb.n; v++) if (isBlocked(v, slot[v]) || roomClosed(blocks, slot[v], room[v])) respectsBlocks = false;

  return {
    ok: true,
    schedule: { slot, room, rooms: usedRooms },
    moves,
    roomSwaps,
    hit: hitSet.size,
    chained,
    extraRoom: usedRooms > base.rooms,
    check: verify(pb, slot, room),
    respectsBlocks,
    ms: now() - t0,
  };
}

/* Rooms after a disruption: a class that kept its period keeps its room (unless
 * that room is closed); everyone else prefers the room their section is using
 * in the neighbouring period, then their section's usual room, then any open one. */
function keepRooms(pb: Problem, base: Schedule, slot: number[], rooms: number, blocks: Blocks): number[] {
  const { n, T, S, P } = pb;
  const room: number[] = new Array(n).fill(-1);
  const used = new Uint8Array(T * rooms);
  for (let v = 0; v < n; v++) {
    const t = slot[v], r = base.room[v];
    if (t === base.slot[v] && r < rooms && !roomClosed(blocks, t, r) && !used[t * rooms + r]) {
      room[v] = r;
      used[t * rooms + r] = 1;
    }
  }
  const home = new Array(S).fill(-1);
  for (let s = 0; s < S; s++) {
    const count = new Map<number, number>();
    let best = -1;
    for (const v of pb.secMembers[s]) {
      const c = (count.get(base.room[v]) || 0) + 1;
      count.set(base.room[v], c);
      if (best < 0 || c > count.get(best)!) best = base.room[v];
    }
    home[s] = best;
  }
  const secAt = new Int32Array(T * S).fill(-1);
  for (let v = 0; v < n; v++) secAt[slot[v] * S + pb.sessions[v].sec] = v;
  const rest = [];
  for (let v = 0; v < n; v++) if (room[v] < 0) rest.push(v);
  rest.sort((a, b) => slot[a] - slot[b] || a - b);
  for (const v of rest) {
    const t = slot[v], s = pb.sessions[v].sec;
    const prefs: number[] = [];
    if (t % P > 0 && secAt[(t - 1) * S + s] >= 0) prefs.push(room[secAt[(t - 1) * S + s]]);
    if (t % P < P - 1 && secAt[(t + 1) * S + s] >= 0) prefs.push(room[secAt[(t + 1) * S + s]]);
    prefs.push(base.room[v], home[s]);
    let pick = prefs.find((r) => r >= 0 && r < rooms && !roomClosed(blocks, t, r) && !used[t * rooms + r]);
    if (pick === undefined) {
      pick = 0;
      while (pick < rooms && (used[t * rooms + pick] || roomClosed(blocks, t, pick))) pick++;
    }
    room[v] = pick;
    used[t * rooms + pick] = 1;
  }
  return room;
}
