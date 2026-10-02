import { useCallback, useEffect, useMemo, useState } from "react";
import { Data } from "./engine/data";
import { reschedule, type Disruption, type Move } from "./engine/disrupt";
import type { Dataset } from "./engine/types";
import { ConflictGraph } from "./components/ConflictGraph";
import { DataDialog } from "./components/DataDialog";
import type { Applied } from "./components/Disruptions";
import { Hero } from "./components/Hero";
import { Methods } from "./components/Methods";
import { Proof } from "./components/Proof";
import { Timetable } from "./components/Timetable";
import { useReducedMotion } from "./lib/hooks";
import { solveInWorker, solveNow, type Solution } from "./lib/solution";

type Theme = "dark" | "light";

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem("lowerbound-theme");
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    /* storage unavailable */
  }
  return "dark";
}

function initialSolution(): Solution {
  const res = solveNow(Data.sample());
  if (!res.ok) throw new Error(res.errors.join(" "));
  return res.solution;
}

export default function App() {
  const [sol, setSol] = useState<Solution>(initialSolution);
  const [history, setHistory] = useState<Applied[]>([]);
  const [dialog, setDialog] = useState(false);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const reduced = useReducedMotion();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("lowerbound-theme", theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);

  const current = history.length ? history[history.length - 1].result.schedule : sol.after;

  const apply = useCallback(
    (d: Disruption) => {
      const base = history.length ? history[history.length - 1].result.schedule : sol.after;
      const list = [...history.map((h) => h.d), d];
      const result = reschedule(sol.pb, base, list);
      if (result.ok) setHistory([...history, { d, base, result }]);
      return result;
    },
    [history, sol],
  );
  const undo = useCallback(() => {
    const last = history[history.length - 1];
    setHistory(history.slice(0, -1));
    return last;
  }, [history]);
  const clear = useCallback(() => setHistory([]), []);

  const loadDataset = useCallback(async (ds: Dataset) => {
    const res = await solveInWorker(ds);
    if (res.ok) {
      setSol(res.solution);
      setHistory([]);
      window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    }
    return res;
  }, [reduced]);

  const latestMoves: Move[] = useMemo(() => {
    const last = history[history.length - 1];
    return last ? [...last.result.moves, ...last.result.roomSwaps] : [];
  }, [history]);

  return (
    <>
      <a className="skip" href="#main">Skip to the demo</a>
      <header className="top">
        <div className="wrap top-inner">
          <a className="logo" href="#main" aria-label="LOWERBOUND, home">
            <span className="logo-br" aria-hidden>⌈</span>LOWERBOUND<span className="logo-br" aria-hidden>⌉</span>
          </a>
          <nav className="nav" aria-label="Sections">
            <a href="#proof">Proof</a>
            <a href="#method">Method</a>
            <a href="#graph">Graph</a>
            <a href="#timetable">Timetable</a>
          </nav>
          <div className="top-actions">
            <span className="dataset" title={sol.dataset.name}>{sol.dataset.name}</span>
            <button className="btn btn-quiet sm" onClick={() => setDialog(true)}>Change data</button>
            <button
              className="icon-btn"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label={theme === "dark" ? "Switch to light ledger theme" : "Switch to dark chalkboard theme"}
              title={theme === "dark" ? "Ledger paper" : "Chalkboard"}
            >
              {theme === "dark" ? (
                <svg viewBox="0 0 20 20" aria-hidden><rect x="3.5" y="3" width="13" height="14" rx="1.5" /><path d="M6.5 7h7M6.5 10h7M6.5 13h5" /></svg>
              ) : (
                <svg viewBox="0 0 20 20" aria-hidden><rect x="2.5" y="4" width="15" height="10" rx="1" /><path d="M5 17h10M7 9.5c1.5-2 3-2 4.5 0" /></svg>
              )}
            </button>
          </div>
        </div>
      </header>

      <main id="main" className="wrap">
        <Hero sol={sol} history={history} reduced={reduced} onApply={apply} onUndo={undo} onClear={clear} />
        <Proof sol={sol} current={current} />
        <Methods sol={sol} />
        <ConflictGraph sol={sol} />
        <Timetable sol={sol} current={current} disruptions={history.map((h) => h.d)} moved={latestMoves} />
      </main>

      <footer className="foot wrap">
        <p>
          LOWERBOUND · built for the DAA hackathon. Everything runs in your browser with a fixed seed ({7}), so the same data
          gives the same timetable every time.
        </p>
      </footer>

      <DataDialog open={dialog} onClose={() => setDialog(false)} onApply={loadDataset} />
    </>
  );
}
