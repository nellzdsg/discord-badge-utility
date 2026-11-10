import { useState } from "react";
import { Loader2, ShieldAlert, TriangleAlert } from "lucide-react";

export function DisclaimerOverlay({ onAccept }: { onAccept: () => Promise<void> }) {
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    setError(null);
    setBusy(true);
    try {
      await onAccept();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-ink-900 p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-warn/15">
            <ShieldAlert className="h-5 w-5 text-amber-300" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">Перед началом</h2>
            <p className="text-[11px] text-zinc-500">Прочитайте один раз — это важно</p>
          </div>
        </div>

        <ul className="mt-5 space-y-2.5 text-[12px] leading-relaxed text-zinc-300">
          <li className="flex gap-2">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            Приложение не связано с Discord Inc. и не одобрено Discord.
          </li>
          <li className="flex gap-2">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            Эмуляция игровой активности нарушает Terms of Service Discord. Аккаунт
            теоретически может получить ограничение.
          </li>
          <li className="flex gap-2">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            Не запускайте программу одновременно с играми, где работает античит
            (Valorant, CS2, Rust, Fortnite, Apex и т.п.).
          </li>
          <li className="flex gap-2">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            Приложение не просит токен, не читает папку Discord и не внедряется в клиент.
            Оно запускает только собственные процессы-пустышки.
          </li>
          <li className="flex gap-2">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            Значки обновляются с задержкой до 24 часов, результат не гарантирован.
          </li>
        </ul>

        <label className="mt-5 flex cursor-pointer items-start gap-2.5 rounded-lg border border-white/5 bg-ink-950 px-3 py-2.5 text-[12px] text-zinc-300">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-brand"
          />
          Я понимаю риски и использую программу на свой риск.
        </label>

        {error && (
          <p className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-red-300">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => void accept()}
          disabled={!confirmed || busy}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Понятно, продолжить
        </button>
      </div>
    </div>
  );
}
