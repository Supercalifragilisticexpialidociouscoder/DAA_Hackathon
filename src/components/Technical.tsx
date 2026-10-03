import type { Solution } from "../lib/solution";
import { Section } from "./Section";

const REPO = "https://github.com/Supercalifragilisticexpialidociouscoder/DAA_Hackathon";

export function Technical({ sol }: { sol: Solution }) {
  const { pb } = sol;
  return (
    <Section id="technical" step={13} title="Technical details">
      <div className="tech-grid">
        <div>
          <h3 className="sub-h">Architecture</h3>
          <ul className="tech-list">
            <li><code>engine/engine.ts</code>: <code>prepare</code> (conflict degrees, bound), <code>solveAll</code> (four methods), <code>verify</code>. A TypeScript port of the original <code>engine.js</code> with the same logic.</li>
            <li><code>engine/disrupt.ts</code>: incremental repair on top of the engine's own state functions.</li>
            <li><code>engine/trace.ts</code>: the visualization layer. A step-recording copy of DSatur, plus the engine's repair and polish run with their event logs on.</li>
            <li><code>engine/solver.worker.ts</code>: solves new data in a Web Worker. Everything runs in the browser; there is no server.</li>
            <li>React + TypeScript + Vite, no UI kit. Fonts are bundled, so the demo works offline.</li>
          </ul>
        </div>
        <div>
          <h3 className="sub-h">Testing</h3>
          <ul className="tech-list">
            <li><b>Parity:</b> the TypeScript engine gives identical schedules to the original <code>engine.js</code> on the original sample, this dataset and random colleges.</li>
            <li><b>Trace:</b> the traced DSatur colors every vertex exactly like the engine; replaying the repair and polish logs reproduces the final timetable.</li>
            <li><b>Dataset:</b> branch structure, subjects per branch, shared teachers, solve to the floor with <code>verify</code> = null, determinism.</li>
            <li><b>Disruptions:</b> every teacher, section and room blocked on every day: zero clashes, blocked periods kept clear, untouched classes unchanged.</li>
          </ul>
        </div>
        <div>
          <h3 className="sub-h">Limitations</h3>
          <ul className="tech-list">
            <li>The lower bound counts classes, not clashes. When the solver can't reach it, the gap is shown and optimality is not claimed.</li>
            <li>Room size isn't modelled: any room fits any class, including the combined CSE-G+H.</li>
            <li>Every class is one period; multi-period labs aren't modelled.</li>
            <li>On very hard random data, the seeded restarts stop at a time budget, so results can differ by machine. This dataset reaches the floor on the first pass.</li>
            <li>With {pb.S} sections the 12 section colours repeat; labels tell them apart.</li>
          </ul>
        </div>
        <div>
          <h3 className="sub-h">Source</h3>
          <p><a href={REPO}>{REPO.replace("https://", "")}</a></p>
          <p className="muted small">Run it with <code>npm install</code>, <code>npm run dev</code>; <code>npm test</code> runs every check above.</p>
        </div>
      </div>
    </Section>
  );
}
