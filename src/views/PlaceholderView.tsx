import { Construction } from "lucide-react";

type Props = {
  title: string;
  stage: string;
};

export function PlaceholderView({ title, stage }: Props) {
  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-white/5 bg-ink-900 p-6">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand/15">
          <Construction className="h-4 w-4 text-brand" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <p className="text-[11px] text-zinc-500">Появится на этапе {stage}</p>
        </div>
      </div>
      <p className="mt-4 text-[13px] leading-relaxed text-zinc-400">
        Раздел уже есть в навигации, но логика ещё не подключена. Сейчас работает вкладка
        «База игр»: она скачивает список игр Discord и кэширует его локально.
      </p>
    </div>
  );
}
