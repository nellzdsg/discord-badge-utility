export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return "—";
  }

  const seconds = Math.floor(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;

  if (hours > 0) {
    return `${hours} ч ${String(minutes).padStart(2, "0")} мин`;
  }
  if (minutes > 0) {
    return `${minutes} мин ${String(rest).padStart(2, "0")} с`;
  }
  return `${rest} с`;
}
