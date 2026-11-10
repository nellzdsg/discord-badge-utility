import { invoke } from "@tauri-apps/api/core";
import type { FarmSnapshot } from "../types/farm";
import type { Game, GamesResponse } from "../types/game";
import type { Settings } from "../types/settings";
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

  startFarm: (gameIds: string[]) => invoke<void>("start_farm", { gameIds }),
  stopFarm: () => invoke<void>("stop_farm"),
  farmState: () => invoke<FarmSnapshot>("get_farm_state"),

  getSettings: () => invoke<Settings>("get_settings"),
  saveSettings: (settings: Settings) => invoke<void>("save_settings", { settings }),
  dataFolder: () => invoke<string>("data_folder"),
  openDataFolder: () => invoke<void>("open_data_folder"),

  getHistory: () => invoke<string[]>("get_history"),
  clearHistory: () => invoke<void>("clear_history"),
  exportHistory: () => invoke<string>("export_history"),
  importHistory: (json: string) => invoke<number>("import_history", { json }),

  setLanguage: (language: string) => invoke<void>("set_language", { language }),
  openUrl: (url: string) => invoke<void>("open_external_url", { url }),
};
