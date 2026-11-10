import { useEffect, useState } from "react";
import { clsx } from "clsx";
import {
  Download,
  FolderOpen,
  Github,
  Info,
  Loader2,
  ShieldCheck,
  Trash2,
  Upload,
  WifiOff,
} from "lucide-react";
import { api } from "../lib/api";
import type { Settings } from "../types/settings";

type Props = {
  settings: Settings;
  version: string;
  onUpdate: (next: Settings) => Promise<void>;
};

type Message = { tone: "ok" | "error"; text: string };

export function SettingsView({ settings, version, onUpdate }: Props) {
  const [historyCount, setHistoryCount] = useState<number | null>(null);
  const [exported, setExported] = useState("");
  const [importText, setImportText] = useState("");
  const [folder, setFolder] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);

  const refreshHistory = async () => {
    try {
      const ids = await api.getHistory();
      setHistoryCount(ids.length);
    } catch {
      setHistoryCount(null);
    }
  };

  useEffect(() => {
    void refreshHistory();
    void api
      .dataFolder()
      .then(setFolder)
      .catch(() => setFolder(""));
  }, []);

  const update = async (patch: Partial<Settings>) => {
    setMessage(null);
    setBusy(true);
    try {
      await onUpdate({ ...settings, ...patch });
    } catch (cause) {
      setMessage({ tone: "error", text: String(cause) });
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    setMessage(null);
    try {
      const json = await api.exportHistory();
      setExported(json);
      setMessage({ tone: "ok", text: "История выгружена в поле ниже." });
    } catch (cause) {
      setMessage({ tone: "error", text: String(cause) });
    }
  };

  const handleImport = async () => {
    setMessage(null);
    if (importText.trim() === "") {
      setMessage({ tone: "error", text: "Вставьте JSON-массив ID игр." });
      return;
    }
    try {
      const added = await api.importHistory(importText);
      setMessage({ tone: "ok", text: `Добавлено новых записей: ${added}.` });
      setImportText("");
      await refreshHistory();
    } catch (cause) {
      setMessage({ tone: "error", text: String(cause) });
    }
  };

  const handleClear = async () => {
    setMessage(null);
    try {
      await api.clearHistory();
      setHistoryCount(0);
      setConfirmClear(false);
      setMessage({ tone: "ok", text: "История очищена." });
    } catch (cause) {
      setMessage({ tone: "error", text: String(cause) });
    }
  };

  const copyExported = async () => {
    try {
      await navigator.clipboard.writeText(exported);
      setMessage({ tone: "ok", text: "Скопировано в буфер обмена." });
    } catch {
      setMessage({ tone: "error", text: "Не удалось скопировать — выделите текст вручную." });
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <section className="rounded-2xl border border-white/5 bg-ink-900 p-5">
        <h2 className="text-sm font-semibold text-white">Режим работы</h2>

        <label className="mt-4 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={settings.offline}
            onChange={(event) => void update({ offline: event.target.checked })}
            disabled={busy}
            className="mt-0.5 h-4 w-4 accent-brand"
          />
          <span>
            <span className="flex items-center gap-2 text-[13px] text-zinc-200">
              <WifiOff className="h-3.5 w-3.5 text-zinc-500" />
              Офлайн-режим
            </span>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-zinc-500">
              Приложение не делает ни одного сетевого запроса и берёт базу игр только из
              локального кэша. Если кэша нет, сначала загрузите базу при выключенном
              офлайн-режиме.
            </span>
          </span>
        </label>

        <div className="mt-4 flex items-center gap-2 rounded-lg bg-ink-950 px-3 py-2 text-[11px] text-zinc-500">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-green-400" />
          Токен, пароль и файлы Discord не используются — приложение работает только с
          собственными процессами.
        </div>
      </section>

      <section className="rounded-2xl border border-white/5 bg-ink-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-white">История игр</h2>
            <p className="text-[11px] text-zinc-500">
              {historyCount === null
                ? "Проверка…"
                : `Обработано игр: ${historyCount.toLocaleString("ru-RU")}`}
            </p>
          </div>

          {!confirmClear ? (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-zinc-300 transition-colors hover:bg-white/5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Очистить
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleClear()}
                className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-1.5 text-[12px] text-red-300 transition-colors hover:bg-danger/20"
              >
                Точно очистить
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-zinc-400 transition-colors hover:bg-white/5"
              >
                Отмена
              </button>
            </div>
          )}
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
          История помогает не запускать уже обработанные игры. Её можно сохранить в файл и
          перенести на другой компьютер.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleExport()}
            className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-zinc-300 transition-colors hover:bg-white/5"
          >
            <Download className="h-3.5 w-3.5" />
            Экспорт
          </button>
          {exported && (
            <button
              type="button"
              onClick={() => void copyExported()}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-zinc-300 transition-colors hover:bg-white/5"
            >
              Скопировать JSON
            </button>
          )}
        </div>

        {exported && (
          <textarea
            value={exported}
            readOnly
            rows={5}
            onFocus={(event) => event.currentTarget.select()}
            className="scrollbar-thin mt-3 w-full rounded-lg border border-white/5 bg-ink-950 p-3 font-mono text-[11px] text-zinc-300 outline-none"
          />
        )}

        <div className="mt-4 border-t border-white/5 pt-4">
          <label className="text-[11px] text-zinc-500">
            Импорт: вставьте JSON-массив ID игр
          </label>
          <textarea
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            rows={4}
            placeholder='["1091500", "271590"]'
            className="scrollbar-thin mt-1.5 w-full rounded-lg border border-white/5 bg-ink-950 p-3 font-mono text-[11px] text-zinc-300 outline-none placeholder:text-zinc-700 focus:border-brand/60"
          />
          <button
            type="button"
            onClick={() => void handleImport()}
            className="mt-2 flex items-center gap-2 rounded-lg bg-brand px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-brand-hover"
          >
            <Upload className="h-3.5 w-3.5" />
            Импортировать
          </button>
        </div>

        {message && (
          <p
            className={clsx(
              "mt-3 rounded-lg px-3 py-2 text-[12px]",
              message.tone === "ok"
                ? "bg-ok/10 text-green-300"
                : "border border-danger/30 bg-danger/10 text-red-300",
            )}
          >
            {message.text}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-white/5 bg-ink-900 p-5">
        <h2 className="text-sm font-semibold text-white">Данные приложения</h2>
        <p className="mt-2 break-all rounded-lg bg-ink-950 px-3 py-2 font-mono text-[11px] text-zinc-400">
          {folder || "…"}
        </p>
        <button
          type="button"
          onClick={() => void api.openDataFolder().catch(() => undefined)}
          className="mt-2 flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-zinc-300 transition-colors hover:bg-white/5"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Открыть папку
        </button>
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
          Здесь лежат только <code>history.json</code>, <code>settings.json</code> и кэш
          базы игр. Папка Discord не затрагивается.
        </p>
      </section>

      <section className="rounded-2xl border border-white/5 bg-ink-900 p-5">
        <h2 className="text-sm font-semibold text-white">О программе</h2>
        <p className="mt-1 flex items-center gap-2 text-[11px] text-zinc-500">
          <Info className="h-3.5 w-3.5" />
          Discord Badge Utility v{version} · MIT
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
          Не связано с Discord Inc. Эмуляция игровой активности нарушает ToS Discord.
          Используйте на свой риск.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              void api
                .openUrl("https://github.com/nellzdsg/discord-badge-utility")
                .catch(() => undefined)
            }
            className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-zinc-300 transition-colors hover:bg-white/5"
          >
            <Github className="h-3.5 w-3.5" />
            Исходный код
          </button>
          <button
            type="button"
            onClick={() =>
              void api
                .openUrl("https://github.com/nellzdsg/discord-badge-utility/blob/main/LICENSE")
                .catch(() => undefined)
            }
            className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-zinc-300 transition-colors hover:bg-white/5"
          >
            Лицензия
          </button>
        </div>
      </section>

      {busy && (
        <p className="flex items-center gap-2 text-[11px] text-zinc-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Сохраняем настройки…
        </p>
      )}
    </div>
  );
}
