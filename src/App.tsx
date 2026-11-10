import { useEffect, useState } from "react";
import { clsx } from "clsx";
import {
  Database,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Terminal,
  Timer,
} from "lucide-react";
import { api } from "./lib/api";
import { useDiscordStatus } from "./hooks/useDiscordStatus";
import { useSpoofer } from "./hooks/useSpoofer";
import { ConsoleView } from "./views/ConsoleView";
import { DashboardView } from "./views/DashboardView";
import { DatabaseView } from "./views/DatabaseView";
import { PlaceholderView } from "./views/PlaceholderView";

type TabId = "dashboard" | "farm" | "database" | "settings" | "console";

type NavItem = {
  id: TabId;
  label: string;
  hint: string;
  icon: typeof LayoutDashboard;
  stage: string;
};

const NAV: NavItem[] = [
  { id: "dashboard", label: "Универсал", hint: "Перебор игр", icon: LayoutDashboard, stage: "M2" },
  { id: "farm", label: "Фарм часов", hint: "Время в играх", icon: Timer, stage: "M4" },
  { id: "database", label: "База игр", hint: "Список Discord", icon: Database, stage: "M1" },
  { id: "settings", label: "Настройки", hint: "История и язык", icon: Settings, stage: "M4" },
  { id: "console", label: "Консоль", hint: "Логи", icon: Terminal, stage: "M2" },
];

export default function App() {
  const [tab, setTab] = useState<TabId>("dashboard");
  const [version, setVersion] = useState("…");
  const discord = useDiscordStatus();
  const spoofer = useSpoofer();

  const active = NAV.find((item) => item.id === tab) ?? NAV[0];

  useEffect(() => {
    api
      .version()
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
            <span
              className={clsx(
                "h-2 w-2 rounded-full",
                discord === true ? "bg-ok" : discord === false ? "bg-danger" : "bg-zinc-600",
              )}
            />
            {discord === true
              ? "Discord запущен"
              : discord === false
                ? "Discord не найден"
                : "Проверка…"}
          </div>
        </header>

        <section className="scrollbar-thin flex-1 overflow-y-auto p-6">
          {tab === "dashboard" && (
            <DashboardView
              status={spoofer.status}
              tick={spoofer.tick}
              start={spoofer.start}
              pause={spoofer.pause}
              resume={spoofer.resume}
              stop={spoofer.stop}
              onOpenDatabase={() => setTab("database")}
            />
          )}

          {tab === "database" && <DatabaseView />}

          {tab === "console" && (
            <ConsoleView logs={spoofer.logs} onClear={spoofer.clearLogs} />
          )}

          {tab !== "dashboard" && tab !== "database" && tab !== "console" && (
            <PlaceholderView title={active.label} stage={active.stage} />
          )}
        </section>
      </main>
    </div>
  );
}
