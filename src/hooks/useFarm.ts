import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api } from "../lib/api";
import type { FarmTick } from "../types/farm";

export function useFarm() {
  const [tick, setTick] = useState<FarmTick | null>(null);

  useEffect(() => {
    let disposed = false;
    const unlisten: Array<() => void> = [];

    const register = async () => {
      const off = await listen<FarmTick>("farm_tick", (event) => {
        setTick(event.payload);
      });

      if (disposed) {
        off();
      } else {
        unlisten.push(off);
      }
    };

    void register();

    void api
      .farmState()
      .then((snapshot) => {
        if (disposed) return;
        setTick({
          running: snapshot.running,
          elapsed_secs: snapshot.elapsed_secs,
          games: snapshot.games,
          failures: 0,
        });
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      unlisten.forEach((off) => off());
    };
  }, []);

  const start = useCallback(async (gameIds: string[]) => {
    await api.startFarm(gameIds);
  }, []);

  const stop = useCallback(async () => {
    await api.stopFarm();
  }, []);

  return { tick, start, stop };
}
