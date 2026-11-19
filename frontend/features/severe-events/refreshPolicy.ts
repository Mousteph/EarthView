export const SEVERE_EVENT_REFRESH_INTERVAL_MS = 6 * 60 * 1000;

export function shouldRefreshSevereEvents(hasLoaded: boolean, lastRequestAt: number, now: number) {
  return !hasLoaded || now - lastRequestAt >= SEVERE_EVENT_REFRESH_INTERVAL_MS;
}
