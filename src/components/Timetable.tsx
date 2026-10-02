import { useMemo, useState } from "react";
import { buildBlocks, roomClosed, type Disruption, type Move } from "../engine/disrupt";
import type { Schedule } from "../engine/types";
import { copyText, useFlash } from "../lib/hooks";
import { dayLong, dayShort, plural, roomName, shortName, slotLabel } from "../lib/labels";
import type { Solution } from "../lib/solution";

type View = "section" | "teacher" | "room";

export function Timetable({ sol, current, disruptions, moved }: {
  sol: Solution;
  current: Schedule;
  disruptions: Disruption[];
  moved: Move[];
}) {
  const { pb, codes } = sol;
  const [view, setView] = useState<View>("section");
  const [pick, setPick] = useState({ section: 0, teacher: 0, room: 0 });
  const [copied, flash] = useFlash();
  const who = Math.min(pick[view], (view === "section" ? pb.S : view === "teacher" ? pb.F : current.rooms) - 1);

  const blocks = useMemo(() => buildBlocks(pb, disruptions, current.rooms + 1), [pb, disruptions, current.rooms]);
  const movedFrom = useMemo(() => new Map(moved.map((m) => [m.v, m])), [moved]);

  const cells = useMemo(() => {
    const at = new Int32Array(pb.T).fill(-1);
    for (let v = 0; v < pb.n; v++) {
      const s = pb.sessions[v];
      const mine = view === "section" ? s.sec === who : view === "teacher" ? s.fac === who : current.room[v] === who;
      if (mine) at[current.slot[v]] = v;
    }
    return at;
  }, [pb, current, view, who]);

  const blockedAt = (t: number) =>
    view === "section" ? blocks.sec[t * pb.S + who] === 1 : view === "teacher" ? blocks.fac[t * pb.F + who] === 1 : roomClosed(blocks, t, who);

  const options =
    view === "section" ? pb.sections : view === "teacher" ? pb.faculty : Array.from({ length: current.rooms }, (_, r) => roomName(r));

  const summary = useMemo(() => {
    const list = [...cells].filter((v) => v >= 0);
    if (view === "room") return `${plural(list.length, "class", "classes")} · empty ${pb.T - list.length} of ${pb.T} periods`;
    const rooms = new Set(list.map((v) => current.room[v]));
    return `${plural(list.length, "class", "classes")} · ${rooms.size === 1 ? "always in" : "rooms"} ${[...rooms].sort((a, b) => a - b).map(roomName).join(", ")}`;
  }, [cells, view, current, pb]);

  const copyCSV = async () => {
    const rows = pb.sessions
      .map((s) => s.id)
      .sort((a, b) => current.slot[a] - current.slot[b] || current.room[a] - current.room[b]);
    const lines = rows.map((v) => {
      const s = pb.sessions[v], c = pb.courses[s.course], t = current.slot[v];
      return [dayLong((t / pb.P) | 0), (t % pb.P) + 1, roomName(current.room[v]), c.section, c.subject, c.faculty].join(",");
    });
    if (await copyText(["day,period,room,section,subject,faculty", ...lines].join("\n"))) flash("csv");
  };

  const blockedWord = view === "section" ? "away" : view === "teacher" ? "out" : "closed";

  return (
    <section className="section" id="timetable" aria-labelledby="tt-title">
      <h2 id="tt-title">The timetable</h2>
      <p className="section-lede">
        The minimized week{disruptions.length ? ", with this week's disruptions applied" : ""}. Pick a section, a teacher or a
        room.
      </p>
      <div className="tt-bar">
        <div className="seg" role="tablist" aria-label="View by">
          {(
            [
              ["section", "By section"],
              ["teacher", "By teacher"],
              ["room", "By room"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={view === k} aria-controls="tt-grid" onClick={() => setView(k)}>
              {l}
            </button>
          ))}
        </div>
        <label className="field inline">
          <span className="sr-only">{view === "section" ? "Section" : view === "teacher" ? "Teacher" : "Room"}</span>
          <select value={who} onChange={(e) => setPick({ ...pick, [view]: Number(e.target.value) })}>
            {options.map((o, i) => (
              <option key={i} value={i}>{o}</option>
            ))}
          </select>
        </label>
        <span className="tt-summary">{summary}</span>
        <button className="btn btn-quiet" onClick={copyCSV}>
          {copied === "csv" ? `Copied ${pb.n} rows` : "Copy as CSV"}
        </button>
      </div>
      <div className="table-scroll" id="tt-grid" role="tabpanel">
        <table className="tt">
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">Day</span></th>
              {Array.from({ length: pb.P }, (_, p) => (
                <th key={p} scope="col">P{p + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: pb.D }, (_, d) => (
              <tr key={d}>
                <th scope="row">{dayShort(d)}</th>
                {Array.from({ length: pb.P }, (_, p) => {
                  const t = d * pb.P + p;
                  const v = cells[t];
                  const blocked = blockedAt(t);
                  if (v < 0)
                    return (
                      <td key={p} className={blocked ? "blocked" : view === "room" ? "empty waste" : "empty"}>
                        {blocked ? blockedWord : ""}
                      </td>
                    );
                  const s = pb.sessions[v], c = pb.courses[s.course];
                  const m = movedFrom.get(v);
                  return (
                    <td
                      key={p}
                      className={m ? "cls moved" : "cls"}
                      style={{ ["--c" as string]: `var(--c${s.sec % 12})` }}
                      title={`${c.subject}, ${c.faculty}, ${pb.sections[s.sec]}${m ? ` (was ${slotLabel(pb, m.from)}, ${roomName(m.fromRoom)})` : ""}`}
                    >
                      <span className="tt-code">{codes[s.course]}</span>
                      <span className="tt-line">{view === "section" ? shortName(c.faculty) : pb.sections[s.sec]}</span>
                      {view === "room" ? (
                        <span className="tt-line">{shortName(c.faculty)}</span>
                      ) : (
                        <span className="plate sm">{roomName(current.room[v])}</span>
                      )}
                      {m && <span className="tt-moved">moved</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
