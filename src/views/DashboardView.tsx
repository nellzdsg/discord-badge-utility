import { useEffect, useState } from "react";
import { clsx } from "clsx";
import {
  Database,
  Loader2,
  Pause,
  Play,
  Square,
  TriangleAlert,
} from "lucide-react";
import { api } from "../lib/api";
import { formatDuration } from "../lib/format";
import type { Game } from "../types/game";
import type { SpooferConfig, SpooferStatus, TickEvent } from "../types/spoofer";

type Props = {
  status: SpooferStatus;
  tick: TickEvent | null;
  start: (config: SpooferConfig) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
  onOpenDatabase: () => void;
};

const STATUS_LABEL: Record<SpooferStatus, string> = {
  idle: "Готов к запуску",
  running: "Работает",
  paused: "Пауза",
  finished: "Завершено",
  error: "Ошибка",
};

export function DashboardView({
  status,
  tick,
  start,
  pause,
  resume,
  stop,
  onOpenDatabase,
}: Props) {
  const [batchSize, setBatchSize] = useState(8);
  const [holdSecs, setHoldSecs] = useState(15);
  const [limit, setLimit] = useState("");
  const [skipPlayed, setSkipPlayed] = useState(true);
  const [excludeAdult, setExcludeAdult] = useState(true);
  const [cooldownEvery, setCooldownEvery] = useState(25);
  const [cooldownSecs, setCooldownSecs] = useState(30);
  const [jitter, setJitter] = useState(false);
  const [gamesCount, setGamesCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let disposed = false;

    const countProcessGames = (games: Game[]) =>
      games.filter((game) => game.method === "process" && game.rel_path).length;

    const load = async () => {
      try {
        const games = await api.getGames();
        if (games.length > 0) {
          if (!disposed) setGamesCount(countProcessGames(games));
          return;
        }

        // First launch in this session: pull the list from the local cache or
        // from Discord, so the dashboard is ready without visiting the tab.
        const response = await api.fetchGames();
        if (!disposed) setGamesCount(response.process_count);
      } catch {
        if (!disposed) setGamesCount(0);
      }
    };

    void load();

    return () => {
      disposed = true;
    };
  }, []);

  const running = status === "running" || status === "paused";
  const progress = tick && tick.total > 0 ? Math.min(100, (tick.current / tick.total) * 100) : 0;

  const handleStart = async () => {
    setError(null);

    if (!gamesCount) {
      setError("Сначала загрузите базу игр.");
      return;
    }

    const parsedLimit = limit.trim() === "" ? null : Number(limit);
    if (parsedLimit !== null && (!Number.isFinite(parsedLimit) || parsedLimit <= 0)) {
      setError("Лимит должен быть положительным числом или пустым.");
      return;
    }

    setBusy(true);
    try {
      await start({
        batch_size: batchSize,
        hold_secs: holdSecs,
        limit: parsedLimit,
        skip_played: skipPlayed,
        exclude_adult: excludeAdult,
        cooldown_every: cooldownEvery,
        cooldown_secs: cooldownSecs,
        jitter,
      });
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  const invoke = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(String(cause));
    }
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="rounded-2xl border border-white/5 bg-ink-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Перебор игр</h2>
            <p className="text-[11px] text-zinc-500">
              {gamesCount === null
                ? "Проверка базы…"
                : gamesCount > 0
                  ? `В базе ${gamesCount.toLocaleString("ru-RU")} игр`
                  : "База не загружена"}
            </p>
          </div>

          {gamesCount === 0 && (
            <button
              type="button"
              onClick={onOpenDatabase}
              className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-zinc-300 transition-colors hover:bg-white/5"
            >
              <Database className="h-3.5 w-3.5" />
              Открыть базу
            </button>
          )}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Slider
            label="Игр в батче"
            value={batchSize}
            min={1}
            max={20}
            onChange={setBatchSize}
          />
          <Slider
            label="Удержание"
            value={holdSecs}
            min={5}
            max={60}
            step={5}
            suffix=" с"
            onChange={setHoldSecs}
          />

          <label className="block">
            <span className="text-[11px] text-zinc-500">Лимит игр (пусто — все)</span>
            <input
              value={limit}
              onChange={(event) => setLimit(event.target.value.replace(/[^0-9]/g, ""))}
              placeholder="все"
              inputMode="numeric"
              className="mt-1.5 w-full rounded-lg border border-white/5 bg-ink-950 px-3 py-1.5 text-[12px] text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-brand/60"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] text-zinc-500">Кулдаун каждые</span>
              <input
                value={cooldownEvery}
                onChange={(event) => setCooldownEvery(Number(event.target.value.replace(/[^0-9]/g, "")))}
                inputMode="numeric"
                className="mt-1.5 w-full rounded-lg border border-white/5 bg-ink-950 px-3 py-1.5 text-[12px] text-zinc-200 outline-none focus:border-brand/60"
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-zinc-500">Длительность, с</span>
              <input
                value={cooldownSecs}
                onChange={(event) => setCooldownSecs(Number(event.target.value.replace(/[^0-9]/g, "")))}
                inputMode="numeric"
                className="mt-1.5 w-full rounded-lg border border-white/5 bg-ink-950 px-3 py-1.5 text-[12px] text-zinc-200 outline-none focus:border-brand/60"
              />
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          <Toggle label="Пропускать уже обработанные" checked={skipPlayed} onChange={setSkipPlayed} />
          <Toggle label="Исключить 18+" checked={excludeAdult} onChange={setExcludeAdult} />
          <Toggle label="Разброс времени" checked={jitter} onChange={setJitter} />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {!running && (
            <button
              type="button"
              onClick={() => void handleStart()}
              disabled={busy}
              className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[12px] font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              Запустить
            </button>
          )}

          {status === "running" && (
            <button
              type="button"
              onClick={() => void invoke(pause)}
              className="flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-[12px] text-zinc-200 transition-colors hover:bg-white/5"
            >
              <Pause className="h-3.5 w-3.5" />
              Пауза
            </button>
          )}

          {status === "paused" && (
            <button
              type="button"
              onClick={() => void invoke(resume)}
              className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[12px] font-medium text-white transition-colors hover:bg-brand-hover"
            >
              <Play className="h-3.5 w-3.5" />
              Продолжить
            </button>
          )}

          {running && (
            <button
              type="button"
              onClick={() => void invoke(stop)}
              className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2 text-[12px] text-red-300 transition-colors hover:bg-danger/20"
            >
              <Square className="h-3.5 w-3.5" />
              Остановить
            </button>
          )}

          <span className="ml-auto text-[11px] text-zinc-500">{STATUS_LABEL[status]}</span>
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-red-300">
            {error}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-white/5 bg-ink-900 p-5">
        <div className="flex items-center justify-between text-[11px] text-zinc-500">
          <span>Прогресс</span>
          <span className="font-mono text-zinc-400">
            {tick
              ? `${tick.current.toLocaleString("ru-RU")} / ${tick.total.toLocaleString("ru-RU")}`
              : "—"}
          </span>
        </div>

        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Успешно" value={(tick?.succeeded ?? 0).toLocaleString("ru-RU")} tone="ok" />
          <Metric label="Ошибки" value={(tick?.failed ?? 0).toLocaleString("ru-RU")} tone="danger" />
          <Metric label="Прошло" value={formatDuration(tick?.elapsed_secs ?? 0)} />
          <Metric label="Осталось" value={tick ? formatDuration(tick.eta_secs) : "—"} />
        </div>
      </div>

      {tick && tick.active.length > 0 && (
        <div className="rounded-2xl border border-white/5 bg-ink-900 p-5">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">
            Активный батч · {tick.active.length}
          </p>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {tick.active.map((game) => (
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
          Не запускайте одновременно с играми, где работает античит. Discord обновляет значки
          с задержкой до 24 часов.
        </span>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-[11px] text-zinc-500">
        {label}
        <span className="font-mono text-zinc-300">
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full accent-brand"
      />
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[12px] text-zinc-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3.5 w-3.5 accent-brand"
      />
      {label}
    </label>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "danger";
}) {
  return (
    <div className="rounded-lg bg-ink-950 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-zinc-600">{label}</p>
      <p
        className={clsx(
          "mt-0.5 font-mono text-[13px]",
          tone === "ok" ? "text-green-300" : tone === "danger" ? "text-red-300" : "text-zinc-200",
        )}
      >
        {value}
      </p>
    </div>
  );
}
