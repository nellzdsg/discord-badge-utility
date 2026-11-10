import { useEffect, useRef } from "react";
import { clsx } from "clsx";
import { Trash2 } from "lucide-react";
import type { LogEntry } from "../hooks/useSpoofer";
import type { LogLevel } from "../types/spoofer";

const LEVEL_COLOR: Record<LogLevel, string> = {
  info: "text-sky-300",
  success: "text-green-300",
  warn: "text-amber-300",
  error: "text-red-300",
};

export function ConsoleView({ logs, onClear }: { logs: LogEntry[]; onClear: () => void }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [logs.length]);

  return (
    <div className="mx-auto flex h-[calc(100vh-150px)] max-w-5xl flex-col">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] text-zinc-500">События движка в реальном времени</p>
        <button
          type="button"
          onClick={onClear}
          className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-zinc-300 transition-colors hover:bg-white/5"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Очистить
        </button>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto rounded-2xl border border-white/5 bg-ink-950 p-3 font-mono text-[11.5px] leading-relaxed">
        {logs.length === 0 ? (
          <p className="text-zinc-600">
            Пока пусто. Запустите эмуляцию — здесь появятся логи.
          </p>
        ) : (
          logs.map((entry) => (
            <div key={entry.id} className="flex gap-2 py-0.5">
              <span className="shrink-0 text-zinc-600">{entry.time}</span>
              <span className={clsx("w-14 shrink-0 uppercase", LEVEL_COLOR[entry.level])}>
                {entry.level}
              </span>
              <span className="break-words text-zinc-300">{entry.message}</span>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
