import type { BufferGeometry, MeshStandardMaterial } from "three";

type LandProps = {
  readonly geometry: BufferGeometry;
  readonly material: MeshStandardMaterial;
};

export function Land({ geometry, material }: LandProps) {
  return <mesh geometry={geometry} material={material} />;
}
