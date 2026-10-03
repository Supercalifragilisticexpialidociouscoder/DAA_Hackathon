import { fmt } from "../lib/labels";
import type { Solution } from "../lib/solution";
import { Section } from "./Section";

const ms = (x: number) => (x < 1 ? x.toFixed(2) : x < 10 ? x.toFixed(1) : Math.round(x).toString());

export function Complexity({ sol }: { sol: Solution }) {
  const { pb, out, ours, after } = sol;
  const { n, T, S, F, D } = pb;
  const C = pb.courses.length;
  const R = after.rooms;
  const E = pb.edges;
  const t = (k: "manual" | "welsh" | "dsatur" | "ours") => ms(out[k].ms);

  return (
    <Section
      id="complexity"
      step={10}
      title="Complexity"
      lede="Bounds read off the implementation, with this instance's numbers next to them. The conflict graph is never built as an edge list: a vertex's neighbours are its section's and its teacher's member lists."
    >
      <div className="cx-grid">
        <div>
          <table className="cx-vars">
            <thead><tr><th scope="col">Symbol</th><th scope="col">Meaning</th><th scope="col" className="r">Here</th></tr></thead>
            <tbody>
              <tr><td><code>n</code></td><td>classes (vertices)</td><td className="r num">{fmt(n)}</td></tr>
              <tr><td><code>E</code></td><td>conflict edges</td><td className="r num">{fmt(E)}</td></tr>
              <tr><td><code>T</code></td><td>periods (colors), D × P</td><td className="r num">{T}</td></tr>
              <tr><td><code>S</code>, <code>F</code></td><td>sections, teachers</td><td className="r num">{S}, {F}</td></tr>
              <tr><td><code>C</code></td><td>courses (section × subject rows)</td><td className="r num">{C}</td></tr>
              <tr><td><code>R</code></td><td>rooms used</td><td className="r num">{R}</td></tr>
            </tbody>
          </table>

          <h3 className="sub-h">DSatur: O(n² + E)</h3>
          <ul className="cx-why">
            <li><b>Selection:</b> each of the n steps scans every uncoloured vertex for the highest saturation: n × n = O(n²). Here n² = {fmt(n * n)}.</li>
            <li><b>Saturation updates:</b> after colouring v, each neighbour's count of open periods is updated once, via v's section and teacher lists; over the run that is O(n + E).</li>
            <li><b>Period choice:</b> O(T) per step, O(n·T) overall, which is within O(n²) whenever T ≤ n (here {T} ≤ {fmt(n)}).</li>
          </ul>

          <h3 className="sub-h">Space: O(n + T·(S + F) + C·D)</h3>
          <p className="cx-p">
            Per-vertex arrays (period, open count, placed flag) are O(n); the section and teacher busy maps are T × S and T × F
            bits ({fmt(T * S)} + {fmt(T * F)} here); a course-per-day counter for repeats is C × D ({fmt(C * D)}); the member
            lists hold each vertex once. Edges are never stored, so the {fmt(E)} pairs cost no memory.
          </p>
        </div>

        <table className="cx-stages">
          <thead><tr><th scope="col">Stage</th><th scope="col">Time</th><th scope="col" className="r">Measured here</th></tr></thead>
          <tbody>
            <tr><td>Problem setup (degrees, bound)</td><td><code>O(n + C)</code></td><td className="r num">—</td></tr>
            <tr><td>Fill in order</td><td><code>O(n·T)</code></td><td className="r num">{t("manual")} ms</td></tr>
            <tr><td>Largest-first (Welsh–Powell)</td><td><code>O(n log n + n·T)</code></td><td className="r num">{t("welsh")} ms</td></tr>
            <tr><td>DSatur</td><td><code>O(n² + E)</code></td><td className="r num">{t("dsatur")} ms</td></tr>
            <tr><td>LOWERBOUND (all restarts)</td><td><code>O(n² + E) + local search</code></td><td className="r num">{t("ours")} ms</td></tr>
            <tr><td>Repair</td><td>local search, capped at 20,000 iterations</td><td className="r num">{ours.moves ?? 0} moves</td></tr>
            <tr><td>Polish</td><td>local search, capped at 5,000 iterations</td><td className="r num">{ours.polishMoves ?? 0} moves</td></tr>
            <tr><td>Seeded restarts</td><td>until the floor is hit, 450 ms budget (1.8 s cap)</td><td className="r num">{ours.restarts ?? 1} run{(ours.restarts ?? 1) === 1 ? "" : "s"}</td></tr>
            <tr><td>Room assignment</td><td><code>O(n·R)</code> worst case</td><td className="r num">—</td></tr>
            <tr><td>Verification</td><td><code>O(n)</code> expected (hash sets)</td><td className="r num">—</td></tr>
          </tbody>
        </table>
      </div>
      <p className="muted small">
        The local-search stages have no tight polynomial bound: each pass is polynomial, and the iteration caps bound the total.
        Times are measured in this browser and change from run to run; the schedule does not (seed 7).
      </p>
    </Section>
  );
}
