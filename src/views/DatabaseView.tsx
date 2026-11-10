import { useCallback, useEffect, useMemo, useState } from "react";
import { Database, RefreshCw, Search, ShieldAlert } from "lucide-react";
import { clsx } from "clsx";
import { api } from "../lib/api";
import type { Game, GamesResponse } from "../types/game";

const VISIBLE_LIMIT = 300;

type MethodFilter = "all" | "process" | "rpc";

const METHOD_LABELS: Record<MethodFilter, string> = {
  all: "Все",
  process: "Процессы",
  rpc: "RPC",
};

export function DatabaseView() {
  const [games, setGames] = useState<Game[]>([]);
  const [played, setPlayed] = useState<Set<string>>(new Set());
  const [info, setInfo] = useState<GamesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState<MethodFilter>("all");
  const [onlyUnplayed, setOnlyUnplayed] = useState(false);

  const load = useCallback(async (force: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.fetchGames(force);
      const [list, playedIds] = await Promise.all([api.getGames(), api.getHistory()]);
      setInfo(response);
      setGames(list);
      setPlayed(new Set(playedIds));
    } catch (cause) {
      setError(String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return games.filter((game) => {
      if (method !== "all" && game.method !== method) return false;
      if (onlyUnplayed && played.has(game.id)) return false;
      if (!needle) return true;
      return game.name.toLowerCase().includes(needle) || game.id === needle;
    });
  }, [games, method, onlyUnplayed, played, query]);

  const visible = filtered.slice(0, VISIBLE_LIMIT);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="rounded-2xl border border-white/5 bg-ink-900 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск по названию или ID"
              className="w-full rounded-lg border border-white/5 bg-ink-950 py-2 pl-9 pr-3 text-[13px] text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-brand/60"
            />
          </div>

          <div className="flex rounded-lg border border-white/5 bg-ink-950 p-1">
            {(Object.keys(METHOD_LABELS) as MethodFilter[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMethod(value)}
                className={clsx(
                  "rounded-md px-2.5 py-1 text-[12px] transition-colors",
                  method === value
                    ? "bg-white/10 text-white"
                    : "text-zinc-400 hover:text-zinc-200",
                )}
              >
                {METHOD_LABELS[value]}
              </button>
            ))}
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-zinc-400">
            <input
              type="checkbox"
              checked={onlyUnplayed}
              onChange={(event) => setOnlyUnplayed(event.target.checked)}
              className="h-3.5 w-3.5 accent-brand"
            />
            Только новые
          </label>

          <button
            type="button"
            onClick={() => void load(true)}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-[12px] font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
          >
            <RefreshCw className={clsx("h-3.5 w-3.5", loading && "animate-spin")} />
            {loading ? "Загрузка…" : "Обновить базу"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
          <Stat label="Всего" value={info?.total} />
          <Stat label="Процессы" value={info?.process_count} />
          <Stat label="RPC" value={info?.rpc_count} />
          <Stat label="В истории" value={info?.played_count} />
          {info?.from_cache && (
            <span className="rounded-full bg-white/5 px-2 py-0.5">из кэша</span>
          )}
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-red-300">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="break-words">{error}</span>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/5 bg-ink-900">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5 text-[11px] uppercase tracking-wide text-zinc-500">
          <span>Игры</span>
          <span>{filtered.length.toLocaleString("ru-RU")}</span>
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-16 text-center text-zinc-500">
            <Database className="h-8 w-8 text-zinc-700" />
            <p className="text-[13px]">
              {games.length === 0 ? "База ещё не загружена" : "Ничего не найдено"}
            </p>
            {games.length === 0 && (
              <p className="text-[11px] text-zinc-600">
                Нажмите «Обновить базу», чтобы скачать список игр Discord
              </p>
            )}
          </div>
        ) : (
          <ul className="scrollbar-thin max-h-[calc(100vh-330px)] divide-y divide-white/5 overflow-y-auto">
            {visible.map((game) => (
              <li key={game.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/5 text-[12px] font-semibold text-zinc-400">
                  {game.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-zinc-200">{game.name}</p>
                  <p className="truncate font-mono text-[10px] text-zinc-600">
                    {game.rel_path ?? "Discord IPC"}
                  </p>
                </div>
                {game.adult && (
                  <span className="rounded bg-danger/15 px-1.5 py-0.5 text-[10px] text-red-300">
                    18+
                  </span>
                )}
                {played.has(game.id) && (
                  <span className="rounded bg-ok/15 px-1.5 py-0.5 text-[10px] text-green-300">
                    было
                  </span>
                )}
                <span
                  className={clsx(
                    "rounded px-1.5 py-0.5 text-[10px]",
                    game.method === "process"
                      ? "bg-brand/15 text-indigo-300"
                      : "bg-white/5 text-zinc-400",
                  )}
                >
                  {game.method === "process" ? "exe" : "rpc"}
                </span>
              </li>
            ))}
          </ul>
        )}

        {filtered.length > visible.length && (
          <p className="border-t border-white/5 px-4 py-2 text-[11px] text-zinc-600">
            Показано {visible.length} из {filtered.length.toLocaleString("ru-RU")} — уточните поиск.
          </p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <span className="rounded-full bg-white/5 px-2 py-0.5">
      {label}: <span className="text-zinc-300">{value?.toLocaleString("ru-RU") ?? "—"}</span>
    </span>
  );
}
