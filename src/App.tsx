import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { clsx } from "clsx";
import {
  Database,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Terminal,
  Timer,
} from "lucide-react";

type TabId = "dashboard" | "farm" | "database" | "settings" | "console";

type NavItem = {
  id: TabId;
  label: string;
  hint: string;
  icon: typeof LayoutDashboard;
};

const NAV: NavItem[] = [
  { id: "dashboard", label: "Универсал", hint: "Перебор игр", icon: LayoutDashboard },
  { id: "farm", label: "Фарм часов", hint: "Время в играх", icon: Timer },
  { id: "database", label: "База игр", hint: "Список Discord", icon: Database },
  { id: "settings", label: "Настройки", hint: "История и язык", icon: Settings },
  { id: "console", label: "Консоль", hint: "Логи", icon: Terminal },
];

const ROADMAP = [
  "M1 — загрузка и кэш базы игр Discord",
  "M2 — движок эмуляции процессов",
  "M3 — Dashboard и консоль",
  "M4 — фарм, база и настройки",
  "M5 — дисклеймер, документация, релиз",
];

export default function App() {
  const [tab, setTab] = useState<TabId>("dashboard");
  const [version, setVersion] = useState("…");

  const active = NAV.find((item) => item.id === tab) ?? NAV[0];
  const ActiveIcon = active.icon;

  useEffect(() => {
    invoke<string>("app_version")
      .then(setVersion)
      .catch(() => setVersion("unknown"));
  }, []);

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-white/5 bg-ink-900">
        <div className="flex items-center gap-3 px-4 py-5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand shadow-lg shadow-brand/25">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">Badge Utility</p>
            <p className="text-[11px] text-zinc-500">v{version}</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-2 py-2">
          {NAV.map(({ id, label, hint, icon: Icon }) => {
            const isActive = id === tab;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={clsx(
                  "group flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                  isActive ? "bg-white/10" : "hover:bg-white/5",
                )}
              >
                <Icon
                  className={clsx(
                    "h-4 w-4 shrink-0",
                    isActive ? "text-brand" : "text-zinc-500 group-hover:text-zinc-300",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={clsx(
                      "block truncate text-[13px] font-medium",
                      isActive ? "text-white" : "text-zinc-300",
                    )}
                  >
                    {label}
                  </span>
                  <span className="block truncate text-[10px] text-zinc-500">{hint}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <p className="border-t border-white/5 px-4 py-3 text-[11px] leading-relaxed text-zinc-600">
          Не связано с Discord Inc.
        </p>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/5 px-6">
          <div>
            <h1 className="text-sm font-semibold text-white">{active.label}</h1>
            <p className="text-[11px] text-zinc-500">{active.hint}</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/5 bg-ink-900 px-3 py-1.5 text-[11px] text-zinc-400">
            <span className="h-2 w-2 rounded-full bg-zinc-600" />
            Проверка Discord появится в M2
          </div>
        </header>

        <section className="scrollbar-thin flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-2xl rounded-2xl border border-white/5 bg-ink-900 p-6">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand/15">
                <ActiveIcon className="h-4 w-4 text-brand" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Каркас собран</h2>
                <p className="text-[11px] text-zinc-500">Этап M0 завершён</p>
              </div>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-zinc-400">
              Интерфейс и Rust-бэкенд связаны: версия бэкенда{" "}
              <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-zinc-300">
                {version}
              </span>
              . Функциональность появится на следующих этапах.
            </p>

            <ul className="mt-4 space-y-1.5">
              {ROADMAP.map((line) => (
                <li key={line} className="flex items-start gap-2 text-[13px] text-zinc-400">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
