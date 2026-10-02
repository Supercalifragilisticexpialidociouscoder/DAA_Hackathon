import { useEffect, useMemo, useRef, useState } from "react";
import { Data } from "../engine/data";
import { Engine } from "../engine/engine";
import type { Dataset } from "../engine/types";
import { fmt, plural } from "../lib/labels";
import type { SolveOutcome } from "../lib/solution";

type Tab = "sample" | "random" | "csv";

const CSV_EXAMPLE = `section,subject,faculty,hours
CSE-A,Design & Analysis of Algorithms,Dr. K. Srinivas Rao,5
CSE-A,Operating Systems,Mr. B. Ravi Kumar,5
CSE-B,Design & Analysis of Algorithms,Dr. K. Srinivas Rao,5
CSE-B,Operating Systems,Ms. G. Sravani,5`;

function Slider({ label, value, min, max, onChange, hint }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void; hint?: string;
}) {
  return (
    <label className="slider">
      <span className="slider-top">
        <span>{label}</span>
        <output className="num">{value}</output>
      </span>
      <input type="range" min={min} max={max} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <span className="slider-hint">{hint}</span>}
    </label>
  );
}

function Preview({ ds }: { ds: Dataset | null }) {
  const pb = useMemo(() => (ds && ds.courses.length ? Engine.prepare(ds.courses, ds.D, ds.P) : null), [ds]);
  if (!ds || !pb) return null;
  return (
    <div className="preview" aria-live="polite">
      <p>
        {plural(pb.S, "section")}, {plural(pb.F, "teacher")}, <b>{fmt(pb.n)}</b> classes into {pb.D} × {pb.P} ={" "}
        <b>{pb.T}</b> periods. Floor: ⌈{fmt(pb.n)} ÷ {pb.T}⌉ = <b>{pb.lb}</b> {pb.lb === 1 ? "room" : "rooms"}.
      </p>
      {pb.problems.length > 0 && (
        <ul className="errors" role="alert">
          {pb.problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
    </div>
  );
}

export function DataDialog({ open, onClose, onApply }: {
  open: boolean;
  onClose: () => void;
  onApply: (ds: Dataset) => Promise<SolveOutcome>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<Tab>("sample");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string[] | null>(null);
  const [rnd, setRnd] = useState({ sections: 12, hours: 28, share: 2, D: 6, P: 6, seed: 1 });
  const [csv, setCsv] = useState("");
  const [csvD, setCsvD] = useState(6);
  const [csvP, setCsvP] = useState(6);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setFailure(null);
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open]);

  const sample = useMemo(() => Data.sample(), []);
  const random = useMemo(() => Data.random(rnd), [rnd]);
  const parsed = useMemo(() => Data.parseCSV(csv), [csv]);
  const csvSet = useMemo<Dataset | null>(
    () =>
      parsed.courses.length
        ? { name: `Pasted timetable (${new Set(parsed.courses.map((c) => c.section)).size} sections)`, courses: parsed.courses, D: csvD, P: csvP }
        : null,
    [parsed, csvD, csvP],
  );

  const chosen = tab === "sample" ? sample : tab === "random" ? random : csvSet;
  const chosenProblems = useMemo(() => (chosen ? Engine.prepare(chosen.courses, chosen.D, chosen.P).problems : []), [chosen]);
  const blocked = !chosen || chosenProblems.length > 0 || (tab === "csv" && parsed.errors.length > 0) || busy;

  const apply = async () => {
    if (!chosen || blocked) return;
    setBusy(true);
    setFailure(null);
    const res = await onApply(chosen);
    setBusy(false);
    if (res.ok) onClose();
    else setFailure(res.errors);
  };

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="data-title"
      onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }}
      onClick={(e) => { if (e.target === ref.current && !busy) onClose(); }}
    >
      <div className="dialog-body">
        <div className="dialog-head">
          <h2 id="data-title">Change data</h2>
          <button className="btn btn-quiet sm" onClick={onClose} disabled={busy} aria-label="Close">Close</button>
        </div>
        <div className="seg" role="tablist" aria-label="Data source">
          {(
            [
              ["sample", "Sample"],
              ["random", "Random"],
              ["csv", "Paste CSV"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setFailure(null); }}>
              {l}
            </button>
          ))}
        </div>

        <div className="dialog-panel" role="tabpanel">
          {tab === "sample" && (
            <>
              <p>
                A III-year B.Tech block: CSE, CSM and ECE, {plural(9, "section")}, 23 teachers, 245 classes over 6 days × 6
                periods. Faculty names are illustrative.
              </p>
              <Preview ds={sample} />
            </>
          )}
          {tab === "random" && (
            <>
              <div className="sliders">
                <Slider label="Sections" value={rnd.sections} min={4} max={24} onChange={(v) => setRnd({ ...rnd, sections: v })} />
                <Slider label="Classes per section a week" value={rnd.hours} min={12} max={36} onChange={(v) => setRnd({ ...rnd, hours: v })} />
                <Slider label="Sections per teacher" value={rnd.share} min={1} max={4} onChange={(v) => setRnd({ ...rnd, share: v })} />
                <Slider label="Days" value={rnd.D} min={5} max={6} onChange={(v) => setRnd({ ...rnd, D: v })} />
                <Slider label="Periods a day" value={rnd.P} min={4} max={8} onChange={(v) => setRnd({ ...rnd, P: v })} />
                <div className="slider seed">
                  <span className="slider-top">
                    <span>Shuffle seed</span>
                    <output className="num">{rnd.seed}</output>
                  </span>
                  <div className="seed-row">
                    <input
                      type="range" min={1} max={99} value={rnd.seed} aria-label="Shuffle seed"
                      onChange={(e) => setRnd({ ...rnd, seed: Number(e.target.value) })}
                    />
                    <button className="btn btn-quiet sm" onClick={() => setRnd({ ...rnd, seed: (rnd.seed % 99) + 1 })}>
                      Next
                    </button>
                  </div>
                </div>
              </div>
              <Preview ds={random} />
            </>
          )}
          {tab === "csv" && (
            <>
              <label className="field">
                <span>One row per subject per section: section, subject, faculty, weekly hours</span>
                <textarea
                  value={csv}
                  onChange={(e) => setCsv(e.target.value)}
                  placeholder={CSV_EXAMPLE}
                  rows={9}
                  spellCheck={false}
                  aria-describedby="csv-errors"
                />
              </label>
              <div className="csv-row">
                <label className="field inline">
                  <span>Days</span>
                  <select value={csvD} onChange={(e) => setCsvD(Number(e.target.value))}>
                    <option value={5}>5, Mon–Fri</option>
                    <option value={6}>6, Mon–Sat</option>
                  </select>
                </label>
                <label className="field inline">
                  <span>Periods a day</span>
                  <select value={csvP} onChange={(e) => setCsvP(Number(e.target.value))}>
                    {[4, 5, 6, 7, 8].map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
                <button className="link" onClick={() => setCsv(Data.toCSV(sample.courses))}>Fill with the sample</button>
              </div>
              <div id="csv-errors" aria-live="polite">
                {csv.trim() && parsed.errors.length > 0 && (
                  <ul className="errors">
                    {parsed.errors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}
                    {parsed.errors.length > 8 && <li>…and {parsed.errors.length - 8} more.</li>}
                  </ul>
                )}
              </div>
              {parsed.errors.length === 0 && <Preview ds={csvSet} />}
            </>
          )}
        </div>

        {failure && (
          <ul className="errors" role="alert">
            {failure.map((f) => <li key={f}>{f}</li>)}
          </ul>
        )}

        <div className="dialog-foot">
          <button className="btn btn-quiet" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-chalk" onClick={apply} disabled={blocked}>
            {busy ? "Solving…" : "Apply and solve"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
