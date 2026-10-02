import type { Disruption } from "../engine/disrupt";
import type { Problem } from "../engine/types";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const dayShort = (d: number) => DAYS[d] ?? `Day ${d + 1}`;
export const dayLong = (d: number) => DAYS_LONG[d] ?? `Day ${d + 1}`;
export const roomName = (r: number) => `R${r + 1}`;
export const slotDay = (pb: Problem, t: number) => (t / pb.P) | 0;
export const slotPeriod = (pb: Problem, t: number) => t % pb.P;
export const slotLabel = (pb: Problem, t: number) => `${dayShort(slotDay(pb, t))} P${slotPeriod(pb, t) + 1}`;
export const slotLong = (pb: Problem, t: number) => `${dayLong(slotDay(pb, t))}, period ${slotPeriod(pb, t) + 1}`;

export const fmt = (x: number) => x.toLocaleString("en-IN");
export const plural = (n: number, one: string, many = one + "s") => `${fmt(n)} ${n === 1 ? one : many}`;

/* Subject short codes, the way they're written on a college timetable. */
const KNOWN: Record<string, string> = {
  "design & analysis of algorithms": "DAA",
  "operating systems": "OS",
  "computer networks": "CN",
  "database management systems": "DBMS",
  "software engineering": "SE",
  "cloud computing": "CC",
  "constitution of india": "COI",
  "machine learning": "ML",
  "natural language processing": "NLP",
  "deep learning": "DL",
  "digital signal processing": "DSP",
  "vlsi design": "VLSI",
  "microprocessors & microcontrollers": "MPMC",
  "antennas & wave propagation": "AWP",
  "control systems": "CS",
  "internet of things": "IoT",
  algorithms: "ALGO",
  networks: "NET",
  databases: "DB",
  compilers: "CD",
  signals: "S&S",
  vlsi: "VLSI",
  microcontrollers: "MC",
  probability: "P&S",
  "discrete maths": "DM",
  economics: "ECO",
  ethics: "ETH",
};
const SMALL = new Set(["&", "and", "of", "the", "for", "to", "in"]);

function guessCode(subject: string) {
  const known = KNOWN[subject.trim().toLowerCase()];
  if (known) return known;
  const words = subject.split(/[\s/-]+/).filter((w) => w && !SMALL.has(w.toLowerCase()));
  if (words.length >= 2) return words.map((w) => w[0]).join("").toUpperCase().slice(0, 5);
  const w = words[0] ?? subject;
  return w.length <= 5 ? w.toUpperCase() : w.slice(0, 4).toUpperCase();
}

/** One short code per course index, unique across the dataset. */
export function subjectCodes(pb: Problem): string[] {
  const bySubject = new Map<string, string>();
  const taken = new Map<string, string>();
  for (const c of pb.courses) {
    if (bySubject.has(c.subject)) continue;
    let code = guessCode(c.subject), k = 2;
    const stem = code;
    while (taken.has(code) && taken.get(code) !== c.subject) code = `${stem}${k++}`;
    taken.set(code, c.subject);
    bySubject.set(c.subject, code);
  }
  return pb.courses.map((c) => bySubject.get(c.subject)!);
}

/** "Dr. K. Srinivas Rao" → "Srinivas Rao"; "Mr. K. Rao" → "K. Rao". */
export function shortName(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  const rest = parts.filter((p, i) => !(i === 0 && /^(dr|mr|mrs|ms|prof)\.?$/i.test(p)));
  const words = rest.filter((p) => !/^[A-Za-z]{1,2}\.$/.test(p));
  if (words.length >= 2) return words.join(" ");
  return rest.join(" ") || name;
}

export function periodsText(pb: Problem, periods: number[]) {
  if (!periods.length || periods.length === pb.P) return "all day";
  const ps = [...periods].sort((a, b) => a - b).map((p) => p + 1);
  const contiguous = ps.every((p, i) => i === 0 || p === ps[i - 1] + 1);
  if (ps.length === 1) return `period ${ps[0]}`;
  if (contiguous) return `periods ${ps[0]}–${ps[ps.length - 1]}`;
  return `periods ${ps.slice(0, -1).join(", ")} and ${ps[ps.length - 1]}`;
}

export function disruptionWho(pb: Problem, d: Disruption) {
  if (d.kind === "teacher") return pb.faculty[d.who];
  if (d.kind === "section") return pb.sections[d.who];
  return roomName(d.who);
}

/** Sentence used in notices: "Dr. X is unavailable on Tuesday (periods 2–4)." */
export function describeDisruption(pb: Problem, d: Disruption) {
  const when = !d.periods.length || d.periods.length === pb.P ? `on ${dayLong(d.day)}` : `on ${dayLong(d.day)}, ${periodsText(pb, d.periods)}`;
  const who = disruptionWho(pb, d);
  if (d.kind === "teacher") return `${who} is unavailable ${when}`;
  if (d.kind === "section") return `${who} is away ${when}`;
  return `Room ${who} is closed ${when}`;
}

/** "P2–4", "P1, P3", from 0-based periods. */
function periodsShort(periods: number[]) {
  const ps = [...periods].sort((a, b) => a - b).map((p) => p + 1);
  const contiguous = ps.every((p, i) => i === 0 || p === ps[i - 1] + 1);
  if (ps.length > 1 && contiguous) return `P${ps[0]}–${ps[ps.length - 1]}`;
  return ps.map((p) => `P${p}`).join(", ");
}

/** Short chip label: "Srinivas Rao out Tue". */
export function disruptionChip(pb: Problem, d: Disruption) {
  const when = `${dayShort(d.day)}${!d.periods.length || d.periods.length === pb.P ? "" : " " + periodsShort(d.periods)}`;
  if (d.kind === "teacher") return `${shortName(pb.faculty[d.who])} out ${when}`;
  if (d.kind === "section") return `${pb.sections[d.who]} away ${when}`;
  return `${roomName(d.who)} closed ${when}`;
}
