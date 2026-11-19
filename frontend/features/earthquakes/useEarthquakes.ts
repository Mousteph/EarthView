import { useCallback, useEffect, useRef, useState } from 'react';
import { useArrayFeed } from '@/shared/data/useArrayFeed';
import { isEarthquake } from './model';
import { EARTHQUAKE_REFRESH_MS } from './merge';

export function useEarthquakes(enabled: boolean) {
  const { entities, ...state } = useArrayFeed('/api/earthquakes', 'Earthquake', isEarthquake, false);
  const request = state.refresh;
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  const loaded = useRef(false);
  const requestedAt = useRef(0);
  const refresh = useCallback(async () => {
    requestedAt.current = Date.now();
    setCheckedAt(requestedAt.current);
    const result = await request();
    if (result) loaded.current = true;
    return result;
  }, [request]);
  useEffect(() => {
    if (!enabled) return;
    if (!loaded.current || Date.now() - requestedAt.current >= EARTHQUAKE_REFRESH_MS) void refresh();
    const interval = window.setInterval(() => void refresh(), EARTHQUAKE_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [enabled, refresh]);
  return { checkedAt, earthquakes: entities, ...state, refresh, stale: state.hasLoaded && state.error !== null };
}
