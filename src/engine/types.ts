export interface Course {
  section: string;
  subject: string;
  faculty: string;
  hours: number;
}

export interface Dataset {
  name: string;
  courses: Course[];
  D: number;
  P: number;
}

/** One weekly class meeting: the k-th hour of a course. */
export interface Session {
  id: number;
  course: number;
  sec: number;
  fac: number;
  k: number;
  /** degree in the conflict graph */
  deg: number;
}

export interface Problem {
  courses: Course[];
  D: number;
  P: number;
  T: number;
  sections: string[];
  faculty: string[];
  sessions: Session[];
  n: number;
  S: number;
  F: number;
  secCount: number[];
  facCount: number[];
  secMembers: number[][];
  facMembers: number[][];
  edges: number;
  lb: number;
  busiestSec: number;
  busiestFac: number;
  problems: string[];
}

export interface State {
  slot: Int16Array;
  load: Int32Array;
  secBusy: Uint8Array;
  facBusy: Uint8Array;
  courseDay: Uint8Array;
  members: number[][];
}

export interface MethodOk {
  name: string;
  ok: true;
  ms: number;
  slot: number[];
  rooms: number;
  repeats: number;
  load: number[];
  complexity?: string;
  restarts?: number;
  moves?: number;
  polishMoves?: number;
  startRooms?: number;
  room?: Int16Array;
  switches?: number;
}

export interface MethodFail {
  name: string;
  ok: false;
  ms: number;
  failed?: number;
}

export type MethodResult = MethodOk | MethodFail;

export interface SolveAll {
  manual: MethodResult;
  welsh: MethodResult;
  dsatur: MethodResult;
  ours: MethodResult;
}

/** A placed timetable: period and room for every class. */
export interface Schedule {
  slot: number[];
  room: number[];
  rooms: number;
}
