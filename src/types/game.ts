export type SpoofMethod = "process" | "rpc";

export interface Game {
  id: string;
  name: string;
  rel_path: string | null;
  arguments: string | null;
  icon_hash: string | null;
  method: SpoofMethod;
  adult: boolean;
}

export interface GamesResponse {
  total: number;
  process_count: number;
  rpc_count: number;
  played_count: number;
  from_cache: boolean;
}
