import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api } from "../lib/api";
import type {
  LogEvent,
  SpooferConfig,
  SpooferStatus,
  StatusEvent,
  TickEvent,
} from "../types/spoofer";

export interface LogEntry extends LogEvent {
  id: number;
  time: string;
}

const MAX_LOG_ENTRIES = 500;

export function useSpoofer() {
  const [status, setStatus] = useState<SpooferStatus>("idle");
  const [tick, setTick] = useState<TickEvent | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const counter = useRef(0);

  useEffect(() => {
    let disposed = false;
    const unlisten: Array<() => void> = [];

    const register = async () => {
      const offStatus = await listen<StatusEvent>("spoofer_status", (event) => {
        setStatus(event.payload.status);
      });

      const offTick = await listen<TickEvent>("spoofer_tick", (event) => {
        setTick(event.payload);
      });

      const offLog = await listen<LogEvent>("spoofer_log", (event) => {
        counter.current += 1;
        const entry: LogEntry = {
          ...event.payload,
          id: counter.current,
          time: new Date().toLocaleTimeString("ru-RU"),
        };
        setLogs((previous) =>
          previous.length >= MAX_LOG_ENTRIES
            ? [...previous.slice(-(MAX_LOG_ENTRIES - 1)), entry]
            : [...previous, entry],
        );
      });

      if (disposed) {
        offStatus();
        offTick();
        offLog();
      } else {
        unlisten.push(offStatus, offTick, offLog);
      }
    };

    void register();
    void api.spooferState().then(setStatus).catch(() => undefined);

    return () => {
      disposed = true;
      unlisten.forEach((off) => off());
    };
  }, []);

  const start = useCallback(async (config: SpooferConfig) => {
    await api.startSpoofer(config);
  }, []);

  const pause = useCallback(async () => {
    await api.pauseSpoofer();
  }, []);

  const resume = useCallback(async () => {
    await api.resumeSpoofer();
  }, []);

  const stop = useCallback(async () => {
    await api.stopSpoofer();
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  return { status, tick, logs, start, pause, resume, stop, clearLogs };
}
