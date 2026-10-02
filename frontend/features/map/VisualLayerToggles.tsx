"use client";

import { VISUAL_LAYERS, type VisualLayerId, type VisualLayerState } from "./visualLayers";

export function VisualLayerToggles({
  visible,
  onToggle,
}: {
  readonly visible: VisualLayerState;
  readonly onToggle: (layer: VisualLayerId) => void;
}) {
  return <nav className="visual-layer-toggles" aria-label="Globe visual layers">
    {VISUAL_LAYERS.map((layer) => <button
      key={layer.id}
      type="button"
      className={`visual-layer-toggle${visible[layer.id] ? " is-active" : ""}`}
      aria-label={layer.label}
      aria-pressed={visible[layer.id]}
      onClick={() => onToggle(layer.id)}
    >
      <span className="visual-layer-toggle-dot" aria-hidden="true" />
      <span className="visual-layer-toggle-label" aria-hidden="true">{layer.label}</span>
    </button>)}
  </nav>;
}
