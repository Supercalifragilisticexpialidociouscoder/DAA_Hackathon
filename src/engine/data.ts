/* Datasets: the sample college, seeded random colleges, and CSV in/out.
 * TypeScript port of reference/data.js. Logic is unchanged, with one fix:
 * parseCSV reports the line number as it appears in the pasted text
 * (the original counted after dropping blank and # comment lines). */
import { mulberry32 } from "./engine";
import type { Course, Dataset } from "./types";

// Sample: a III-year B.Tech block with 9 sections. Faculty names are illustrative.
type Subject = [string, number, string[]];
const branches: Record<string, { sections: string[]; subjects: Subject[] }> = {
  CSE: {
    sections: ["CSE-A", "CSE-B", "CSE-C", "CSE-D"],
    subjects: [
      ["Design & Analysis of Algorithms", 5, ["Dr. K. Srinivas Rao", "Mrs. P. Lavanya"]],
      ["Operating Systems", 5, ["Mr. B. Ravi Kumar", "Ms. G. Sravani"]],
      ["Computer Networks", 4, ["Dr. M. Swathi", "Mr. T. Naresh"]],
      ["Database Management Systems", 5, ["Dr. V. Ramesh", "Mrs. S. Anitha"]],
      ["Software Engineering", 3, ["Mr. Ch. Sai Kiran"]],
      ["Cloud Computing", 3, ["Dr. N. Padmaja", "Mr. A. Vamshi"]],
      ["Constitution of India", 2, ["Dr. R. Lakshmi"]],
    ],
  },
  CSM: {
    sections: ["CSM-A", "CSM-B"],
    subjects: [
      ["Design & Analysis of Algorithms", 5, ["Mrs. P. Lavanya"]],
      ["Machine Learning", 5, ["Dr. J. Harika"]],
      ["Operating Systems", 5, ["Ms. G. Sravani"]],
      ["Database Management Systems", 5, ["Mrs. S. Anitha"]],
      ["Natural Language Processing", 3, ["Mr. K. Abhinav"]],
      ["Deep Learning", 3, ["Dr. J. Harika"]],
      ["Constitution of India", 2, ["Dr. R. Lakshmi"]],
    ],
  },
  ECE: {
    sections: ["ECE-A", "ECE-B", "ECE-C"],
    subjects: [
      ["Digital Signal Processing", 5, ["Dr. S. Venkatesh", "Mrs. M. Divya"]],
      ["VLSI Design", 5, ["Mr. P. Mahesh"]],
      ["Microprocessors & Microcontrollers", 4, ["Dr. L. Ramana", "Ms. Y. Keerthi"]],
      ["Antennas & Wave Propagation", 5, ["Mr. D. Suresh"]],
      ["Control Systems", 3, ["Mrs. K. Bhavani"]],
      ["Internet of Things", 3, ["Mr. U. Pavan"]],
      ["Constitution of India", 2, ["Mr. E. Gopal"]],
    ],
  },
};

function sample(): Dataset {
  const courses: Course[] = [];
  for (const b of Object.values(branches)) {
    b.sections.forEach((sec, si) => {
      for (const [subject, hours, teachers] of b.subjects) {
        // teachers split sections: first teacher takes the first half, etc.
        const tIdx = Math.min(teachers.length - 1, Math.floor((si * teachers.length) / b.sections.length));
        courses.push({ section: sec, subject, faculty: teachers[tIdx], hours });
      }
    });
  }
  return { name: "III-year B.Tech sample", courses, D: 6, P: 6 };
}

const pool = [
  "Algorithms", "Operating Systems", "Networks", "Databases", "Compilers", "Machine Learning",
  "Software Engineering", "Cloud Computing", "Signals", "VLSI", "Microcontrollers", "Control Systems",
  "Probability", "Discrete Maths", "Economics", "Ethics",
];
const first = ["K.", "P.", "B.", "G.", "M.", "T.", "V.", "S.", "N.", "R.", "J.", "L.", "D.", "Y.", "A.", "C."];
const last = ["Rao", "Reddy", "Kumar", "Sravani", "Swathi", "Naresh", "Ramesh", "Anitha", "Padmaja", "Lakshmi",
  "Harika", "Venkatesh", "Divya", "Mahesh", "Keerthi", "Suresh", "Bhavani", "Pavan", "Gopal", "Abhinav",
  "Vamshi", "Lavanya", "Kiran", "Ramana", "Priya", "Sandeep", "Teja", "Manasa", "Rohith", "Spandana"];

export interface RandomOptions {
  sections?: number;
  D?: number;
  P?: number;
  hours?: number;
  share?: number;
  seed?: number;
}

function random({ sections = 10, D = 6, P = 6, hours = 26, share = 2, seed = 1 }: RandomOptions): Dataset {
  const rng = mulberry32(seed * 7919 + sections * 31 + hours);
  const nSub = Math.max(4, Math.min(9, Math.round(hours / 4)));
  const subjects: string[] = [];
  const used = new Set<string>();
  while (subjects.length < nSub) {
    const s = pool[Math.floor(rng() * pool.length)];
    if (!used.has(s)) { used.add(s); subjects.push(s); }
  }
  // split weekly hours across subjects
  const hrs: number[] = new Array(nSub).fill(Math.floor(hours / nSub));
  const extra = hours - hrs.reduce((a, b) => a + b, 0);
  for (let i = 0; i < extra; i++) hrs[i % nSub]++;
  const names = new Set<string>();
  const mkName = () => {
    let nm: string;
    do nm = `${rng() < 0.4 ? "Dr." : rng() < 0.5 ? "Mr." : "Ms."} ${first[Math.floor(rng() * first.length)]} ${last[Math.floor(rng() * last.length)]}`;
    while (names.has(nm));
    names.add(nm); return nm;
  };
  const secNames = Array.from({ length: sections }, (_, i) => `Sec-${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ""}`);
  const courses: Course[] = [];
  subjects.forEach((sub, j) => {
    let teacher: string | null = null, taught = 0;
    secNames.forEach((sec) => {
      if (!teacher || taught >= share) { teacher = mkName(); taught = 0; }
      courses.push({ section: sec, subject: sub, faculty: teacher, hours: hrs[j] });
      taught++;
    });
  });
  return { name: `Random college (${sections} sections)`, courses, D, P };
}

function parseCSV(text: string): { courses: Course[]; errors: string[] } {
  const lines = text.split(/\r?\n/)
    .map((l, i) => ({ text: l.trim(), no: i + 1 }))
    .filter((l) => l.text && !l.text.startsWith("#"));
  const errors: string[] = [], courses: Course[] = [];
  if (!lines.length) return { courses, errors: ["Paste at least one row: section, subject, faculty, hours."] };
  let start = 0;
  if (/section/i.test(lines[0].text) && /hour/i.test(lines[0].text)) start = 1;
  for (let i = start; i < lines.length; i++) {
    const no = lines[i].no;
    const cells = lines[i].text.split(",").map((c) => c.trim());
    if (cells.length < 4) { errors.push(`Line ${no} has ${cells.length} values; it needs section, subject, faculty, hours.`); continue; }
    const hours = Number(cells[3]);
    if (!Number.isInteger(hours) || hours < 1 || hours > 40) { errors.push(`Line ${no}: hours must be a whole number from 1 to 40.`); continue; }
    if (!cells[0] || !cells[1] || !cells[2]) { errors.push(`Line ${no} has an empty section, subject or faculty.`); continue; }
    courses.push({ section: cells[0], subject: cells[1], faculty: cells[2], hours });
  }
  return { courses, errors };
}

function toCSV(courses: Course[]) {
  return "section,subject,faculty,hours\n" + courses.map((c) => `${c.section},${c.subject},${c.faculty},${c.hours}`).join("\n");
}

export const Data = { sample, random, parseCSV, toCSV };
