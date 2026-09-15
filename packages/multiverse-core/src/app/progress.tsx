import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loadJson, saveJson } from './persist';
import { EMPTY_DAILY, withSolvedDay, type DailyProgress } from '../daily';

const KEY = 'progress.v1';

interface Progress {
  solved: string[];
  badges: string[];
  daily: DailyProgress;
}

interface ProgressApi {
  solved: ReadonlySet<string>;
  markSolved: (id: string) => void;
  /** Achievements earned so far. */
  badges: ReadonlySet<string>;
  /** Adds any that are new; already-earned ones are left alone. */
  award: (ids: readonly string[]) => void;
  daily: DailyProgress;
  markDailySolved: (iso: string) => void;
}

const Ctx = createContext<ProgressApi>({
  solved: new Set(),
  markSolved: () => {},
  badges: new Set(),
  award: () => {},
  daily: EMPTY_DAILY,
  markDailySolved: () => {},
});

/** What the player has done so far — puzzles, badges, the daily run — across launches. */
export function ProgressProvider({ children }: { children: React.ReactNode }) {
  const [solved, setSolved] = useState<Set<string>>(new Set());
  const [badges, setBadges] = useState<Set<string>>(new Set());
  const [daily, setDaily] = useState<DailyProgress>(EMPTY_DAILY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    loadJson<Partial<Progress>>(KEY).then((p) => {
      if (!alive) return;
      // Records written before badges and the daily existed carry only `solved`.
      if (p && Array.isArray(p.solved)) setSolved(new Set(p.solved));
      if (p && Array.isArray(p.badges)) setBadges(new Set(p.badges));
      if (p && p.daily && typeof p.daily.streak === 'number') setDaily({ ...EMPTY_DAILY, ...p.daily });
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (ready) void saveJson(KEY, { solved: [...solved], badges: [...badges], daily });
  }, [solved, badges, daily, ready]);

  const markSolved = useCallback((id: string) => {
    setSolved((s) => (s.has(id) ? s : new Set([...s, id])));
  }, []);

  const award = useCallback((ids: readonly string[]) => {
    setBadges((b) => (ids.every((id) => b.has(id)) ? b : new Set([...b, ...ids])));
  }, []);

  const markDailySolved = useCallback((iso: string) => {
    setDaily((d) => withSolvedDay(d, iso));
  }, []);

  const api = useMemo(
    () => ({ solved, markSolved, badges, award, daily, markDailySolved }),
    [solved, markSolved, badges, award, daily, markDailySolved],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useProgress(): ProgressApi {
  return useContext(Ctx);
}
