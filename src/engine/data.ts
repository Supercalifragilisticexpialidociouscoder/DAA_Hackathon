/* Datasets: the sample semester, seeded random colleges, and CSV in/out.
 * TypeScript port of reference/data.js. Logic is unchanged, with two changes:
 * - parseCSV reports the line number as it appears in the pasted text
 *   (the original counted after dropping blank and # comment lines);
 * - sample() is a different dataset: one semester across the university instead of
 *   the original 9-section B.Tech block (still in reference/data.js for the parity test). */
import { mulberry32 } from "./engine";
import type { Course, Dataset } from "./types";

// Sample: one semester across the university. CSE, CSE-DS and CSM take the same six
// subjects; ECE, IoT/R&AI and BBA have their own. Faculty names are fictional.
// CSE-G and CSE-H are always taught together, so they are ONE section, "CSE-G+H":
// one group of students attending every class together, in one room.
// Teachers take different groups of sections, and a few teach across departments
// (ECE faculty in IoT/R&AI, maths faculty in ECE and BBA, an English trainer in BBA),
// so the conflict graph links the branches the way a real allocation does.
const CSE = ["CSE-A", "CSE-B", "CSE-C", "CSE-D", "CSE-E", "CSE-F", "CSE-G+H"];
const CSE_DS = ["CSE-DS-A", "CSE-DS-B", "CSE-DS-C", "CSE-DS-D", "CSE-DS-E", "CSE-DS-F"];
const CSM = ["CSM-A", "CSM-B", "CSM-C", "CSM-D", "CSM-E", "CSM-F", "CSM-G", "CSM-H"];
const ECE = ["ECE-A", "ECE-B", "ECE-C"];
const IOT = ["IoT/R&AI"];
const BBA = ["BBA-A", "BBA-B"];

type Subject = { name: string; hours: number; teachers: [string, string[]][] };
const BRANCHES: { sections: string[]; subjects: Subject[] }[] = [
  {
    sections: [...CSE, ...CSE_DS, ...CSM],
    subjects: [
      {
        name: "Probability and Statistics", hours: 5,
        teachers: [
          ["Dr. Ananya Rao", ["CSE-A", "CSE-B", "CSE-C"]],
          ["Dr. Kiran Varma", ["CSE-D", "CSE-E", "CSE-F"]],
          ["Prof. Meera Nair", ["CSE-G+H", "CSE-DS-A", "CSE-DS-B"]],
          ["Dr. Suresh Naidu", ["CSE-DS-C", "CSE-DS-D", "CSE-DS-E"]],
          ["Dr. Padma Latha", ["CSE-DS-F", "CSM-A", "CSM-B"]],
          ["Prof. Ramesh Chandra", ["CSM-C", "CSM-D", "CSM-E"]],
          ["Dr. Shalini Gupta", ["CSM-F", "CSM-G", "CSM-H"]],
        ],
      },
      {
        name: "Digital Electronics", hours: 5,
        teachers: [
          ["Prof. Arjun Reddy", ["CSE-A", "CSE-DS-A", "CSM-B"]],
          ["Dr. Sneha Kapoor", ["CSE-B", "CSE-DS-B", "CSM-C"]],
          ["Prof. Rahul Menon", ["CSE-C", "CSE-DS-C", "CSM-D"]],
          ["Dr. Harish Kumar", ["CSE-D", "CSE-DS-D", "CSM-E"]],
          ["Prof. Deepa Krishnan", ["CSE-E", "CSE-DS-E", "CSM-F"]],
          ["Dr. Manoj Saxena", ["CSE-F", "CSE-DS-F", "CSM-G"]],
          ["Prof. Swati Deshmukh", ["CSE-G+H", "CSM-A", "CSM-H"]],
        ],
      },
      {
        name: "Design and Analysis of Algorithms", hours: 5,
        teachers: [
          ["Dr. Lakshmi Iyer", ["CSE-B", "CSE-C", "CSE-D"]],
          ["Prof. Vikram Joshi", ["CSE-E", "CSE-F", "CSE-G+H"]],
          ["Dr. Farah Siddiqui", ["CSE-DS-A", "CSE-DS-B", "CSE-DS-C"]],
          ["Prof. Anil Kumar", ["CSE-DS-D", "CSE-DS-E", "CSE-DS-F"]],
          ["Dr. Revathi Subramanian", ["CSM-A", "CSM-B", "CSM-C"]],
          ["Prof. Gautham Pai", ["CSM-D", "CSM-E", "CSM-F"]],
          ["Dr. Nandini Rao", ["CSM-G", "CSM-H", "CSE-A"]],
        ],
      },
      {
        name: "Backend Web Development", hours: 5,
        teachers: [
          ["Prof. Nikhil Bhat", ["CSE-A", "CSE-DS-B", "CSM-D"]],
          ["Dr. Priya Raman", ["CSE-B", "CSE-DS-C", "CSM-E"]],
          ["Prof. Sameer Kulkarni", ["CSE-C", "CSE-DS-D", "CSM-F"]],
          ["Dr. Aditi Sharma", ["CSE-D", "CSE-DS-E", "CSM-G"]],
          ["Prof. Karthik Raju", ["CSE-E", "CSE-DS-F", "CSM-H"]],
          ["Dr. Pooja Malhotra", ["CSE-F", "CSE-DS-A", "CSM-A"]],
          ["Prof. Varun Chopra", ["CSE-G+H", "CSM-B", "CSM-C"]],
        ],
      },
      {
        name: "Advanced Communication Skills", hours: 3,
        teachers: [
          ["Ms. Divya Thomas", ["CSE-A", "CSE-B", "CSE-C", "CSE-D", "CSE-E"]],
          ["Mr. Arvind Pillai", ["CSE-F", "CSE-G+H", "CSE-DS-A", "CSE-DS-B", "CSE-DS-C"]],
          ["Ms. Shreya Bose", ["CSE-DS-D", "CSE-DS-E", "CSE-DS-F", "CSM-A", "CSM-B"]],
          ["Mr. Joseph Mathew", ["CSM-C", "CSM-D", "CSM-E"]],
          ["Ms. Farida Begum", ["CSM-F", "CSM-G", "CSM-H"]],
        ],
      },
      {
        name: "Logical Reasoning and Analytical Skills", hours: 3,
        teachers: [
          ["Mr. Rohan Das", ["CSE-A", "CSE-F", "CSE-DS-D", "CSM-C", "CSM-H"]],
          ["Ms. Kavya Hegde", ["CSE-B", "CSE-G+H", "CSE-DS-E", "CSM-D"]],
          ["Mr. Sandeep Rao", ["CSE-C", "CSE-DS-A", "CSE-DS-F", "CSM-E"]],
          ["Ms. Anjali Verma", ["CSE-D", "CSE-DS-B", "CSM-A", "CSM-F"]],
          ["Mr. Imran Qureshi", ["CSE-E", "CSE-DS-C", "CSM-B", "CSM-G"]],
        ],
      },
    ],
  },
  {
    sections: ECE,
    subjects: [
      { name: "Electronic Circuit Analysis", hours: 5, teachers: [["Dr. Venkat Rao", ECE]] },
      { name: "Analog and Digital Communications", hours: 5, teachers: [["Prof. Kavitha Reddy", ECE]] },
      { name: "Linear and Digital IC Applications", hours: 4, teachers: [["Dr. Srikanth Varma", ECE]] },
      { name: "Electromagnetic Fields and Waves", hours: 4, teachers: [["Prof. Mohan Kumar", ECE]] },
      {
        name: "Signals and Systems", hours: 4,
        teachers: [["Dr. Harish Kumar", ["ECE-A"]], ["Dr. Aparna Joshi", ["ECE-B", "ECE-C"]]],
      },
      {
        name: "Probability Theory and Stochastic Processes", hours: 4,
        teachers: [["Dr. Suresh Naidu", ["ECE-A"]], ["Prof. Uma Shankar", ["ECE-B", "ECE-C"]]],
      },
    ],
  },
  {
    sections: IOT,
    subjects: [
      { name: "Sensors and Actuators", hours: 5, teachers: [["Dr. Aparna Joshi", IOT]] },
      { name: "Embedded Systems", hours: 5, teachers: [["Dr. Srikanth Varma", IOT]] },
      { name: "Introduction to Robotics", hours: 4, teachers: [["Prof. Ravi Kiran", IOT]] },
      { name: "Artificial Intelligence Fundamentals", hours: 4, teachers: [["Prof. Gautham Pai", IOT]] },
      { name: "Wireless Sensor Networks", hours: 4, teachers: [["Dr. Nikita Sharma", IOT]] },
      { name: "Control Systems for Robotics", hours: 4, teachers: [["Prof. Ravi Kiran", IOT]] },
    ],
  },
  {
    sections: BBA,
    subjects: [
      { name: "Financial Management", hours: 5, teachers: [["Dr. Rakesh Bhatia", BBA]] },
      { name: "Marketing Management", hours: 5, teachers: [["Prof. Neha Agarwal", BBA]] },
      { name: "Human Resource Management", hours: 4, teachers: [["Dr. Sunita Menon", BBA]] },
      { name: "Organisational Behaviour", hours: 4, teachers: [["Dr. Sunita Menon", BBA]] },
      { name: "Business Statistics", hours: 4, teachers: [["Prof. Uma Shankar", BBA]] },
      { name: "Business Communication", hours: 4, teachers: [["Mr. Joseph Mathew", BBA]] },
    ],
  },
];

function sample(): Dataset {
  const courses: Course[] = [];
  for (const b of BRANCHES) {
    for (const section of b.sections) {
      for (const s of b.subjects) {
        const teacher = s.teachers.find(([, secs]) => secs.includes(section));
        if (!teacher) throw new Error(`No ${s.name} teacher for ${section}`);
        courses.push({ section, subject: s.name, faculty: teacher[0], hours: s.hours });
      }
    }
  }
  return { name: "University semester sample", courses, D: 6, P: 6 };
}

// The original sample from reference/data.js: a III-year B.Tech block, 245 classes.
// Kept because it is harder (DSatur stops one room above the floor), so the site can
// show the repair and polish stages doing real work. tests/trace.test.ts checks it
// matches reference/data.js exactly.
type Legacy = [string, number, string[]];
const legacyBranches: { sections: string[]; subjects: Legacy[] }[] = [
  {
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
  {
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
  {
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
];

function original(): Dataset {
  const courses: Course[] = [];
  for (const b of legacyBranches) {
    b.sections.forEach((sec, si) => {
      for (const [subject, hours, teachers] of b.subjects) {
        // teachers split sections: first teacher takes the first half, etc.
        const tIdx = Math.min(teachers.length - 1, Math.floor((si * teachers.length) / b.sections.length));
        courses.push({ section: sec, subject, faculty: teachers[tIdx], hours });
      }
    });
  }
  return { name: "Original 245-class sample", courses, D: 6, P: 6 };
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

export const Data = { sample, original, random, parseCSV, toCSV };
