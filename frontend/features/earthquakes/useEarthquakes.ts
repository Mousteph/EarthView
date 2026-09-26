import { useArrayFeed } from "@/shared/data/useArrayFeed";
import { isEarthquake } from "./model";

export function useEarthquakes() {
  const { entities, ...state } = useArrayFeed("/api/earthquakes", "Earthquake", isEarthquake, false);
  return { earthquakes: entities, ...state };
}
