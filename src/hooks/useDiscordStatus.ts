import { useEffect, useState } from "react";
import { api } from "../lib/api";

/** Polls the backend for a running Discord desktop client. */
export function useDiscordStatus(intervalMs = 5000) {
  const [running, setRunning] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;

    const tick = async () => {
      try {
        const value = await api.discordStatus();
        if (alive) setRunning(value);
      } catch {
        if (alive) setRunning(null);
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), intervalMs);

    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [intervalMs]);

  return running;
}
