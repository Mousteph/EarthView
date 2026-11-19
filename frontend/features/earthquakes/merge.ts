import type { Earthquake, MergedEarthquake, EarthquakeSource, EarthquakeAlert } from './model.ts';
import type { SevereEvent } from '../severe-events/model.ts';

export const EARTHQUAKE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const EARTHQUAKE_REFRESH_MS = 6 * 60 * 1000;
export const EARTHQUAKE_SOURCES: readonly EarthquakeSource[] = ['USGS', 'GDACS'];
const levels: readonly EarthquakeAlert[] = ['Green', 'Orange', 'Red'];

function distanceKm(a: Earthquake, b: SevereEvent) {
  const radians = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * radians / 2) ** 2
    + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin((b.lon - a.lon) * radians / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function composeEarthquake(usgs: Earthquake | null, gdacs: SevereEvent | null, matchBasis: MergedEarthquake['matchBasis'] = null): MergedEarthquake {
  if (!usgs && !gdacs) throw new Error('An earthquake requires a source');
  const id = usgs?.id ?? gdacs!.id;
  return {
    id, aliases: [...new Set([id, ...(usgs?.sourceIds ?? []), ...(gdacs ? [gdacs.id, ...(gdacs.earthquake?.sourceIds ?? [])] : [])])],
    place: usgs?.place ?? gdacs!.title, location: usgs?.location ?? gdacs!.title,
    lat: usgs?.lat ?? gdacs!.lat, lon: usgs?.lon ?? gdacs!.lon,
    time: usgs?.time ?? gdacs!.startedAt,
    magnitude: usgs?.magnitude ?? gdacs?.earthquake?.magnitude ?? null,
    depth: usgs?.depth ?? gdacs?.earthquake?.depth ?? null,
    usgs, gdacs, matchBasis,
  };
}

export function mergeEarthquakes(usgsFeed: readonly Earthquake[], gdacsFeed: readonly SevereEvent[], now = Date.now()): MergedEarthquake[] {
  const recent = (time: number) => time >= now - EARTHQUAKE_WINDOW_MS && time <= now;
  const usgs = usgsFeed.filter((e) => recent(e.time));
  const gdacs = gdacsFeed.filter((e) => e.eventType === 'EQ' && recent(e.startedAt));
  const pairs = new Map<number, { index: number; basis: 'id' | 'inferred' }>();
  const used = new Set<number>();
  const exact = gdacs.map((g) => usgs.flatMap((u, index) =>
    g.earthquake?.sourceIds.some((id) => [u.id, ...(u.sourceIds ?? [])].includes(id)) ? [index] : []));
  function claim(candidates: readonly (readonly number[])[], basis: 'id' | 'inferred') {
    const frequency = new Map<number, number>();
    for (const indexes of candidates) for (const index of indexes) frequency.set(index, (frequency.get(index) ?? 0) + 1);
    candidates.forEach((indexes, g) => {
      if (indexes.length === 1 && frequency.get(indexes[0]) === 1) {
        pairs.set(g, { index: indexes[0], basis });
        used.add(indexes[0]);
      }
    });
  }
  claim(exact, 'id');
  // Inference is deliberately one-to-one: nearby aftershocks must not collapse.
  const inferred = gdacs.map((g, index) => pairs.has(index) || exact[index].length || g.earthquake?.sourceIds.length ? [] : usgs.flatMap((u, uIndex) => {
    const magnitude = g.earthquake?.magnitude;
    return !used.has(uIndex) && magnitude != null
      && Math.abs(u.time - g.startedAt) <= 60_000
      && Math.abs(u.magnitude - magnitude) <= 0.5
      && distanceKm(u, g) <= 50 ? [uIndex] : [];
  }));
  claim(inferred, 'inferred');
  return [
    ...gdacs.map((g, index) => { const pair = pairs.get(index); return composeEarthquake(pair ? usgs[pair.index] : null, g, pair?.basis ?? null); }),
    ...usgs.filter((_, index) => !used.has(index)).map((u) => composeEarthquake(u, null)),
  ].sort((a, b) => b.time - a.time);
}

export function earthquakeSources(event: MergedEarthquake): readonly EarthquakeSource[] {
  return [...(event.usgs ? ['USGS' as const] : []), ...(event.gdacs ? ['GDACS' as const] : [])];
}
export function earthquakeAlert(event: MergedEarthquake): EarthquakeAlert | null {
  return event.gdacs ? event.gdacs.alertLevel ?? 'Unknown' : null;
}
export function earthquakeAlertOptions(events: readonly MergedEarthquake[]): readonly EarthquakeAlert[] {
  return [...levels, ...(events.some((e) => earthquakeAlert(e) === 'Unknown') ? ['Unknown' as const] : [])];
}
export function filterEarthquakes(events: readonly MergedEarthquake[], sources: readonly EarthquakeSource[], alerts: readonly EarthquakeAlert[]): MergedEarthquake[] {
  return events.filter((event) => (!sources.length || earthquakeSources(event).some((source) => sources.includes(source)))
    && (!alerts.length || earthquakeAlert(event) !== null && alerts.includes(earthquakeAlert(event)!)));
}
