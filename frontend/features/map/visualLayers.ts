export const VISUAL_LAYERS = [
  { id: "labels", label: "Labels" },
  { id: "surface", label: "Surface" },
] as const;

export type VisualLayerId = (typeof VISUAL_LAYERS)[number]["id"];

export type VisualLayerState = Readonly<Record<VisualLayerId, boolean>>;

export const INITIAL_VISUAL_LAYER_STATE: VisualLayerState = {
  labels: false,
  surface: false,
};

export function toggleVisualLayer(state: VisualLayerState, layer: VisualLayerId): VisualLayerState {
  return { ...state, [layer]: !state[layer] };
}
