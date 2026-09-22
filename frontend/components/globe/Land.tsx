import type { BufferGeometry, MeshBasicMaterial } from "three";

type LandProps = {
  readonly geometry: BufferGeometry;
  readonly material: MeshBasicMaterial;
};

export function Land({ geometry, material }: LandProps) {
  return <mesh geometry={geometry} material={material} />;
}
