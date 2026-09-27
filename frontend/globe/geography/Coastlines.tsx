import type { BufferGeometry, LineBasicMaterial } from "three";

type CoastlinesProps = {
  readonly geometry: BufferGeometry;
  readonly material: LineBasicMaterial;
};

export function Coastlines({ geometry, material }: CoastlinesProps) {
  return <lineSegments geometry={geometry} material={material} renderOrder={2} />;
}
