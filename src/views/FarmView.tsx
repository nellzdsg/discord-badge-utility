import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import {
  CircleStop,
  Loader2,
  Play,
  Search,
  Timer,
  TriangleAlert,
} from "lucide-react";
import { api } from "../lib/api";
import { formatDuration } from "../lib/format";
import type { FarmTick } from "../types/farm";
import type { Game } from "../types/game";

const MAX_GAMES = 20;
const STORAGE_KEY = "dbu.farm.games";

type Props = {
  tick: FarmTick | null;
  start: (gameIds: string[]) => Promise<void>;
  stop: () => Promise<void>;
};

function readSavedSelection(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is string => typeof value === "string"));
  } catch {
    return new Set();
  }
}

export function FarmView({ tick, start, stop }: Props) {
  const [games, setGames] = useState<Game[]>([]);
  const [selected, setSelected] = useState<Set<string>>(readSavedSelection);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const running = tick?.running ?? false;
  const elapsed = tick?.elapsed_secs ?? 0;
  const active = tick?.games ?? [];

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      setLoading(true);
      try {
        let list = await api.getGames();
        if (list.length === 0) {
          await api.fetchGames();
          list = await api.getGames();
        }
        if (disposed) return;

        const usable = list.filter((game) => game.method === "process" && game.rel_path);
        setGames(usable);

        setSelected((previous) => {
          const available = new Set(usable.map((game) => game.id));
          const next = [...previous].filter((id) => available.has(id)).slice(0, MAX_GAMES);
          return new Set(next);
        });
      } catch (cause) {
        if (!disposed) setError(String(cause));
      } finally {
        if (!disposed) setLoading(false);
      }
    };

    void load();

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...selected]));
    } catch {
      // Storage is optional: selection just will not survive a restart.
    }
  }, [selected]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return games;
    return games.filter(
      (game) => game.name.toLowerCase().includes(needle) || game.id === needle,
    );
  }, [games, query]);

  const toggle = (id: string) => {
    setError(null);
    if (!selected.has(id) && selected.size >= MAX_GAMES) {
      setError(`Можно выбрать не больше ${MAX_GAMES} игр одновременно.`);
      return;
    }

    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleStart = async () => {
    setError(null);
    if (selected.size === 0) {
      setError("Выберите хотя бы одну игру.");
      return;
    }

    setBusy(true);
    try {
      await start([...selected]);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setError(null);
    setBusy(true);
    try {
      await stop();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="rounded-2xl border border-white/5 bg-ink-900 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Фарм времени</h2>
            <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-zinc-500">
              Выбранные игры остаются запущенными, пока вы не остановите фарм. Discord
              считает время каждой из них, поэтому {MAX_GAMES} игр дают до {MAX_GAMES} часов
              за один час.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-white/5 bg-ink-950 px-4 py-2 text-right">
              <p className="text-[10px] uppercase tracking-wide text-zinc-600">Сессия</p>
              <p className="font-mono text-[15px] text-zinc-200">
                {running ? formatDuration(elapsed) : "—"}
              </p>
            </div>

            {!running ? (
              <button
                type="button"
                onClick={() => void handleStart()}
                disabled={busy || loading}
                className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-[12px] font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Запустить фарм
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleStop()}
                disabled={busy}
                className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-[12px] text-red-300 transition-colors hover:bg-danger/20 disabled:opacity-50"
              >
                <CircleStop className="h-4 w-4" />
                Остановить
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
          <span
            className={clsx(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1",
              running ? "bg-ok/10 text-green-300" : "bg-white/5 text-zinc-400",
            )}
          >
            <Timer className="h-3 w-3" />
            {running ? `Работает · ${active.length} процессов` : "Остановлен"}
          </span>
          <span className="rounded-full bg-white/5 px-2.5 py-1">
            Выбрано {selected.size} из {MAX_GAMES}
          </span>
          {tick && tick.failures > 0 && (
            <span className="rounded-full bg-danger/10 px-2.5 py-1 text-red-300">
              Ошибок: {tick.failures}
            </span>
          )}
          {selected.size > 0 && !running && (
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded-full border border-white/10 px-2.5 py-1 text-zinc-400 transition-colors hover:bg-white/5"
            >
              Сбросить выбор
            </button>
          )}
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-red-300">
            {error}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-white/5 bg-ink-900 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск игры"
              className="w-full rounded-lg border border-white/5 bg-ink-950 py-2 pl-9 pr-3 text-[13px] text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-brand/60"
            />
          </div>
          <span className="text-[11px] text-zinc-500">
            {loading ? "Загрузка базы…" : `Доступно игр: ${games.length}`}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-[12px] text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загружаем базу игр
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-[12px] text-zinc-500">
            {games.length === 0
              ? "База пуста. Откройте вкладку «База игр» и обновите список."
              : "Ничего не найдено."}
          </p>
        ) : (
          <ul className="scrollbar-thin mt-3 max-h-[380px] divide-y divide-white/5 overflow-y-auto rounded-xl border border-white/5">
            {filtered.map((game) => {
              const checked = selected.has(game.id);
              return (
                <li key={game.id}>
                  <label
                    className={clsx(
                      "flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors",
                      checked ? "bg-brand/5" : "hover:bg-white/5",
                      running && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(game.id)}
                      disabled={running}
                      className="h-4 w-4 accent-brand"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-zinc-200">
                        {game.name}
                      </span>
                      <span className="block truncate font-mono text-[10px] text-zinc-600">
                        {game.rel_path}
                      </span>
                    </span>
                    {game.adult && (
                      <span className="rounded bg-danger/15 px-1.5 py-0.5 text-[10px] text-red-300">
                        18+
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {running && active.length > 0 && (
        <div className="rounded-2xl border border-white/5 bg-ink-900 p-5">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">
            Запущенные процессы · {active.length}
          </p>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {active.map((game) => (
              <li
                key={`${game.id}-${game.pid}`}
                className="flex items-center gap-2 rounded-lg bg-ink-950 px-2.5 py-1.5"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ok" />
                <span className="min-w-0 flex-1 truncate text-[12px] text-zinc-300">
                  {game.name}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-zinc-600">
                  PID {game.pid}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-warn/20 bg-warn/5 px-4 py-3 text-[11px] leading-relaxed text-amber-200/80">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Не запускайте фарм вместе с играми, где работает античит. Держите Discord
          открытым: клиент должен видеть процессы. Время в профиле обновляется с задержкой
          до 24 часов.
        </span>
      </div>
    </div>
  );
}
