import { Engine } from "./engine";
import type { Course } from "./types";

self.onmessage = (e: MessageEvent<{ courses: Course[]; D: number; P: number; seed: number }>) => {
  const { courses, D, P, seed } = e.data;
  const pb = Engine.prepare(courses, D, P);
  const out = Engine.solveAll(pb, seed);
  (self as unknown as Worker).postMessage({ out });
};
