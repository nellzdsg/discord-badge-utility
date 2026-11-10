import { invoke } from "@tauri-apps/api/core";
import type { Game, GamesResponse } from "../types/game";
import type { SpooferConfig, SpooferStatus } from "../types/spoofer";

export const api = {
  version: () => invoke<string>("app_version"),

  fetchGames: (force = false) => invoke<GamesResponse>("fetch_games", { force }),
  getGames: () => invoke<Game[]>("get_games"),
  discordStatus: () => invoke<boolean>("check_discord_status"),

  startSpoofer: (config: SpooferConfig) => invoke<void>("start_spoofer", { config }),
  pauseSpoofer: () => invoke<void>("pause_spoofer"),
  resumeSpoofer: () => invoke<void>("resume_spoofer"),
  stopSpoofer: () => invoke<void>("stop_spoofer"),
  spooferState: () => invoke<SpooferStatus>("get_spoofer_state"),

  getHistory: () => invoke<string[]>("get_history"),
  clearHistory: () => invoke<void>("clear_history"),
  exportHistory: () => invoke<string>("export_history"),
  importHistory: (json: string) => invoke<number>("import_history", { json }),

  setLanguage: (language: string) => invoke<void>("set_language", { language }),
  openUrl: (url: string) => invoke<void>("open_external_url", { url }),
};
