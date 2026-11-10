import type { ActiveGame } from "./spoofer";

export interface FarmTick {
  running: boolean;
  elapsed_secs: number;
  games: ActiveGame[];
  failures: number;
}

export interface FarmSnapshot {
  running: boolean;
  elapsed_secs: number;
  games: ActiveGame[];
}
