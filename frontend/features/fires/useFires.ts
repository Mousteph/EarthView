import { useArrayFeed } from "@/shared/data/useArrayFeed";
import { isFire } from "./model";

export function useFires(enabled: boolean) {
  const { entities, ...state } = useArrayFeed("/api/fires", "Active fire", isFire, enabled);
  return { fires: entities, ...state };
}
