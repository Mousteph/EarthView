import { useArrayFeed } from "@/shared/data/useArrayFeed";
import { isFire } from "./model";

export function useFires() {
  const { entities, ...state } = useArrayFeed("/api/fires", "Active fire", isFire, false);
  return { fires: entities, ...state };
}
