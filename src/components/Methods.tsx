import type { MethodResult } from "../engine/types";
import { fmt, plural } from "../lib/labels";
import type { Solution } from "../lib/solution";

const ABOUT: Record<string, string> = {
  manual: "How timetables get made by hand: section by section, each class in the earliest free period.",
  welsh: "Welsh–Powell order: the most-clashing classes go first, each into the least busy period.",
  dsatur: "Always place the class with the fewest periods still open to it, then the most clashes.",
  ours: "DSatur, then ejection-chain repair that empties the busiest periods until it reaches the floor.",
};

const ms = (x: number) => (x < 1 ? x.toFixed(2) : x < 10 ? x.toFixed(1) : Math.round(x).toString());

function RoomBar({ rooms, lb }: { rooms: number; lb: number }) {
  return (
    <span className="roombar" aria-hidden>
      {Array.from({ length: rooms }, (_, i) => (
        <i key={i} className={i < lb ? "" : "over"} />
      ))}
    </span>
  );
}

export function Methods({ sol }: { sol: Solution }) {
  const { pb, out, ours } = sol;
  const rows: [keyof typeof out, MethodResult][] = [
    ["manual", out.manual],
    ["welsh", out.welsh],
    ["dsatur", out.dsatur],
    ["ours", out.ours],
  ];
  const start = ours.startRooms ?? ours.rooms;
  const switches = ours.switches ?? 0;

  return (
    <section className="section" id="method" aria-labelledby="method-title">
      <h2 id="method-title">How we got there</h2>
      <p className="section-lede">
        Four ways to fill the same week, on the same data. Rooms needed is the busiest period: the most classes running at
        once.
      </p>
      <div className="table-scroll">
        <table className="methods">
          <thead>
            <tr>
              <th scope="col">Method</th>
              <th scope="col" className="r">Rooms</th>
              <th scope="col" className="r">Gap to floor</th>
              <th scope="col" className="r">Time</th>
              <th scope="col">Complexity</th>
              <th scope="col">How it works</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([key, r]) => (
              <tr key={key} className={key === "ours" ? "ours" : ""}>
                <th scope="row">{r.name}{key === "ours" && <span className="tag tag-accent">ours</span>}</th>
                {r.ok ? (
                  <>
                    <td className="r">
                      <span className="stencil-num">{r.rooms}</span>
                      <RoomBar rooms={r.rooms} lb={pb.lb} />
                    </td>
                    <td className={`r ${r.rooms - pb.lb === 0 ? "gap0" : "gapn"}`}>{r.rooms - pb.lb === 0 ? "0" : `+${r.rooms - pb.lb}`}</td>
                  </>
                ) : (
                  <td className="r" colSpan={2}>ran out of periods</td>
                )}
                <td className="r num">{ms(r.ms)} ms</td>
                <td className="mono">{r.ok ? r.complexity : ""}</td>
                <td className="about">{ABOUT[key]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="sub">Our pipeline, with this week's numbers</h3>
      <ol className="pipeline">
        <li>
          <h4>Build the conflict graph</h4>
          <p>
            Every class is a vertex: <b>{fmt(pb.n)}</b>. Two classes are joined if they share a section or a teacher, since they
            can never run in the same period: <b>{fmt(pb.edges)}</b> edges.
          </p>
        </li>
        <li>
          <h4>DSatur</h4>
          <p>
            Color the graph with {pb.T} periods, most constrained class first, each into the least busy period it can take.
            First pass: <b>{plural(start, "room")}</b>.
          </p>
        </li>
        <li>
          <h4>Repair</h4>
          <p>
            {ours.moves ? (
              <>
                Take a class out of the fullest period and move it to a quieter one; if one class blocks the spot, push that
                one to a third period (an ejection chain). <b>{plural(ours.moves, "move")}</b>: {start} → <b>{plural(ours.rooms, "room")}</b>.
              </>
            ) : (
              <>Nothing to repair: the first pass already used {plural(ours.rooms, "room")}.</>
            )}
            {ours.restarts && ours.restarts > 1 ? ` Best of ${ours.restarts} seeded restarts.` : ""}
          </p>
        </li>
        <li>
          <h4>Polish</h4>
          <p>
            Move classes so no subject meets twice in one day, never letting a period exceed {ours.rooms} classes.{" "}
            <b>{plural(ours.polishMoves ?? 0, "move")}</b>; {ours.repeats === 0 ? "no repeats left" : `${plural(ours.repeats, "repeat")} left that couldn't be removed`}.
          </p>
        </li>
        <li>
          <h4>Room assignment</h4>
          <p>
            Inside each period, a section keeps the room it used the period before, else its home room. Across the week that's{" "}
            <b>{plural(switches, "room change")}</b>, about {(switches / Math.max(1, pb.S)).toFixed(1)} per section.
          </p>
        </li>
      </ol>
    </section>
  );
}
