export type SpooferStatus = "idle" | "running" | "paused" | "finished" | "error";

export interface SpooferConfig {
  batch_size: number;
  hold_secs: number;
  limit: number | null;
  skip_played: boolean;
  exclude_adult: boolean;
  cooldown_every: number;
  cooldown_secs: number;
  jitter: boolean;
}

export interface ActiveGame {
  id: string;
  name: string;
  executable: string;
  pid: number | null;
}

export interface TickEvent {
  current: number;
  total: number;
  active: ActiveGame[];
  elapsed_secs: number;
  eta_secs: number;
  rate: number;
  succeeded: number;
  failed: number;
}

export type LogLevel = "info" | "success" | "warn" | "error";

export interface LogEvent {
  level: LogLevel;
  message: string;
}

export interface StatusEvent {
  status: SpooferStatus;
  message: string | null;
}
