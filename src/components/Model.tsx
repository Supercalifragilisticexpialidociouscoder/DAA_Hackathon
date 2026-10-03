import { useMemo, useState } from "react";
import type { Problem } from "../engine/types";
import { fmt, plural, shortName, slotLabel } from "../lib/labels";
import type { Solution } from "../lib/solution";
import { Section } from "./Section";

/* Three real classes from the data: a section edge, a teacher edge, and a non-edge. */
function pickExample(pb: Problem) {
  const s0 = pb.sessions.find((s) => pb.courses[s.course].subject.toLowerCase().includes("algorithms")) ?? pb.sessions[0];
  const sameSec = pb.secMembers[s0.sec].map((v) => pb.sessions[v]).filter((s) => s.course !== s0.course && s.fac !== s0.fac);
  const u1 = sameSec.find((s) => pb.courses[s.course].subject.toLowerCase().includes("probab")) ?? sameSec[0];
  const u2 = pb.facMembers[s0.fac].map((v) => pb.sessions[v]).find((s) => s.sec !== s0.sec);
  if (!u1 || !u2 || u1.fac === u2.fac || u1.sec === u2.sec) return null;
  return { a: s0, b: u1, c: u2 };
}

export function Model({ sol }: { sol: Solution }) {
  const { pb, codes, after } = sol;
  const ex = useMemo(() => pickExample(pb), [pb]);
  const [colored, setColored] = useState(false);
  const counts = useMemo(() => {
    const c = new Array(pb.T).fill(0);
    for (const t of after.slot) c[t]++;
    return c;
  }, [pb, after]);
  const maxClass = Math.max(...counts);

  const name = (s: { sec: number; course: number }) => `${pb.sections[s.sec]} · ${codes[s.course]}`;
  const teacher = (s: { fac: number }) => shortName(pb.faculty[s.fac]);

  return (
    <Section
      id="model"
      step={1}
      title="The problem is graph coloring"
      lede="Every weekly class is a vertex. Two classes are joined by an edge when they cannot run in the same period, because they share a section (the same students) or a teacher. Choosing periods is coloring the graph with the week's periods; rooms needed is the size of the largest color class."
    >
      <div className="model-grid">
        <table className="map-table">
          <thead>
            <tr><th scope="col">Timetable</th><th scope="col">Graph</th><th scope="col" className="r">This instance</th></tr>
          </thead>
          <tbody>
            <tr><td>A class (one weekly hour)</td><td><i className="glyph g-vertex" />vertex</td><td className="r num">n = {fmt(pb.n)}</td></tr>
            <tr><td>Two classes that clash (same section or teacher)</td><td><i className="glyph g-edge" />edge</td><td className="r num">E = {fmt(pb.edges)}</td></tr>
            <tr><td>A period of the week</td><td><i className="glyph g-color" />color</td><td className="r num">T = {pb.T}</td></tr>
            <tr><td>Rooms needed</td><td><i className="glyph g-class" />largest color class</td><td className="r num">{maxClass}</td></tr>
          </tbody>
        </table>

        <pre className="formal" aria-label="Formal model">
{`G = (V, E)          V = classes, |V| = n = ${fmt(pb.n)}
(u, v) ∈ E   ⇔   section(u) = section(v)  or  teacher(u) = teacher(v)
c : V → {1 … T}     T = ${pb.T} periods,   c(u) ≠ c(v) for every (u, v) ∈ E
rooms(c) = max over t of |{ v : c(v) = t }|        minimize rooms(c)`}
        </pre>
      </div>

      {ex && (
        <figure className="example">
          <div className="example-head">
            <figcaption>Three real classes from this timetable</figcaption>
            <div className="seg sm" role="radiogroup" aria-label="Example view">
              <button role="radio" aria-checked={!colored} onClick={() => setColored(false)}>Edges</button>
              <button role="radio" aria-checked={colored} onClick={() => setColored(true)}>A valid coloring</button>
            </div>
          </div>
          <svg viewBox="0 0 640 230" className="example-svg" role="img"
            aria-label={`${name(ex.a)} clashes with ${name(ex.b)} (same section) and ${name(ex.c)} (same teacher); ${name(ex.b)} and ${name(ex.c)} do not clash.`}>
            <g className="ex-edges">
              <line x1="190" y1="62" x2="110" y2="170" className="ex-edge" />
              <line x1="450" y1="62" x2="530" y2="170" className="ex-edge" />
              <line x1="190" y1="190" x2="450" y2="190" className="ex-nonedge" />
            </g>
            <text x="112" y="104" className="ex-label" textAnchor="end">same section</text>
            <text x="112" y="120" className="ex-sub" textAnchor="end">{pb.sections[ex.a.sec]}</text>
            <text x="528" y="104" className="ex-label">same teacher</text>
            <text x="528" y="120" className="ex-sub">{teacher(ex.a)}</text>
            <text x="320" y="214" className="ex-sub" textAnchor="middle">no edge: these two may share a period</text>
            {[
              { s: ex.a, x: 320, y: 46, period: 0 },
              { s: ex.b, x: 110, y: 190, period: 1 },
              { s: ex.c, x: 530, y: 190, period: 1 },
            ].map(({ s, x, y, period }) => (
              <g key={s.id} transform={`translate(${x} ${y})`}>
                <rect x="-96" y="-24" width="192" height="48" rx="8" className={colored ? `ex-node c${period}` : "ex-node"} />
                <text y="-3" textAnchor="middle" className="ex-name">{name(s)}</text>
                <text y="15" textAnchor="middle" className="ex-sub">
                  {colored ? `color: ${slotLabel(pb, period)}` : teacher(s)}
                </text>
              </g>
            ))}
          </svg>
          <p className="example-note">
            {colored ? (
              <>
                {name(ex.a)} takes {slotLabel(pb, 0)}. The other two are not adjacent, so both may take {slotLabel(pb, 1)}: that
                color class has 2 classes, so {slotLabel(pb, 1)} needs 2 rooms. Over the whole week, the largest color class
                decides the rooms.
              </>
            ) : (
              <>
                Edges come from the data: the same students, or the same teacher, can't be in two places in one period.
                With {pb.T} periods there are {pb.T} colors, and {plural(pb.n, "vertex", "vertices")} to color.
              </>
            )}
          </p>
        </figure>
      )}
    </Section>
  );
}
