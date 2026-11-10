import { invoke } from "@tauri-apps/api/core";
import type { Game, GamesResponse } from "../types/game";

export const api = {
  version: () => invoke<string>("app_version"),
  fetchGames: (force = false) => invoke<GamesResponse>("fetch_games", { force }),
  getGames: () => invoke<Game[]>("get_games"),
  getHistory: () => invoke<string[]>("get_history"),
  clearHistory: () => invoke<void>("clear_history"),
  exportHistory: () => invoke<string>("export_history"),
  importHistory: (json: string) => invoke<number>("import_history", { json }),
  discordStatus: () => invoke<boolean>("check_discord_status"),
  setLanguage: (language: string) => invoke<void>("set_language", { language }),
  openUrl: (url: string) => invoke<void>("open_external_url", { url }),
};
