import type { Disruption, Move, RescheduleOk } from "../engine/disrupt";
import type { Problem } from "../engine/types";
import { describeDisruption, roomName, slotLabel } from "./labels";

export interface Notice {
  key: string;
  to: string;
  lines: number;
  text: string;
}

const change = (pb: Problem, m: Move) =>
  m.from === m.to
    ? `${slotLabel(pb, m.from)}: room ${roomName(m.fromRoom)} → ${roomName(m.toRoom)}`
    : `${slotLabel(pb, m.from)} in ${roomName(m.fromRoom)} → ${slotLabel(pb, m.to)} in ${roomName(m.toRoom)}`;

/** Ready-to-send messages for every section and teacher a disruption touches. */
export function buildNotices(pb: Problem, d: Disruption, r: RescheduleOk, codes: string[]) {
  const all = [...r.moves, ...r.roomSwaps].sort((a, b) => a.from - b.from || a.v - b.v);
  const reason = describeDisruption(pb, d) + ".";
  const bySec = new Map<number, Move[]>(), byFac = new Map<number, Move[]>();
  for (const m of all) {
    const s = pb.sessions[m.v];
    if (!bySec.has(s.sec)) bySec.set(s.sec, []);
    if (!byFac.has(s.fac)) byFac.set(s.fac, []);
    bySec.get(s.sec)!.push(m);
    byFac.get(s.fac)!.push(m);
  }
  const sections: Notice[] = [...bySec.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([sec, ms]) => {
      const lines = ms.map((m) => {
        const s = pb.sessions[m.v];
        return `• ${codes[s.course]} (${pb.faculty[s.fac]}): ${change(pb, m)}`;
      });
      return {
        key: `s${sec}`,
        to: pb.sections[sec],
        lines: ms.length,
        text: [`${pb.sections[sec]}: timetable change`, reason, ...lines, "All other classes stay as they are."].join("\n"),
      };
    });
  const teachers: Notice[] = [...byFac.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([fac, ms]) => {
      const lines = ms.map((m) => {
        const s = pb.sessions[m.v];
        return `• ${pb.sections[s.sec]} ${codes[s.course]}: ${change(pb, m)}`;
      });
      const self = d.kind === "teacher" && d.who === fac;
      return {
        key: `f${fac}`,
        to: pb.faculty[fac],
        lines: ms.length,
        text: [
          `${pb.faculty[fac]}: timetable change`,
          self ? `You're marked unavailable ${describeDisruption(pb, d).split(" is unavailable ")[1]}. Your classes move:` : reason,
          ...lines,
          "Your other classes stay as they are.",
        ].join("\n"),
      };
    });
  return { sections, teachers };
}
