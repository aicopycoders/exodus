// #2988: the types of the one export the Trigger worker calls. The script is
// plain JS so the CLI can run it with `node` and no build.

export class FirstCutError extends Error {
  constructor(code: 1 | 2, message: string);
  readonly code: 1 | 2;
}

export interface FirstCutOptions {
  /** A folder written by `exodus video pull`. */
  dir: string;
  /** Defaults to <dir>/cut.mp4. */
  out?: string;
  skip?: Set<number>;
  /** The music bed, when the pull has one. Defaults to on, as the CLI does. */
  music?: boolean;
}

export interface FirstCut {
  out: string;
  durationSec: number;
  /** The music file the cut used, or null. */
  music: string | null;
  timeline: { spine: Array<{ sceneIndex: number }>; left: string[] };
}

export function firstCut(options: FirstCutOptions): FirstCut;
