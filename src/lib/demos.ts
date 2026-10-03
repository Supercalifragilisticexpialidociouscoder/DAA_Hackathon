/* Harder instances for showing the repair and polish stages at work. On the
 * university sample DSatur already reaches the floor, so those stages make no moves;
 * these instances run the same engine code and do need them. Computed on first use. */
import { Data } from "../engine/data";
import { Engine } from "../engine/engine";
import { tracePipeline, type PipelineTrace } from "../engine/trace";
import type { Problem } from "../engine/types";
import { subjectCodes } from "./labels";

export interface Instance {
  key: string;
  label: string;
  note: string;
  pb: Problem;
  codes: string[];
  trace: PipelineTrace | null;
}

const RANDOM_EJECT = { sections: 16, hours: 24, share: 4, D: 5, P: 6, seed: 1 };
const cache = new Map<string, Instance>();

function build(key: string, label: string, note: string, make: () => { courses: Parameters<typeof Engine.prepare>[0]; D: number; P: number }) {
  const hit = cache.get(key);
  if (hit) return hit;
  const ds = make();
  const pb = Engine.prepare(ds.courses, ds.D, ds.P);
  const inst = { key, label, note, pb, codes: subjectCodes(pb), trace: tracePipeline(pb) };
  cache.set(key, inst);
  return inst;
}

export const originalInstance = () =>
  build("original", "Original 245-class sample", "The project's first sample: 9 sections, 6 days × 6 periods.", () => Data.original());

export const ejectInstance = () =>
  build(
    "eject",
    "Random 16-section week",
    "Data.random({ sections: 16, hours: 24, share: 4, days: 5, periods: 6, seed: 1 }) from the Change data dialog.",
    () => Data.random(RANDOM_EJECT),
  );
