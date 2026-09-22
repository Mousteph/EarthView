import type { BufferGeometry, MeshBasicMaterial } from "three";

type LandProps = {
  geometry: BufferGeometry;
  material: MeshBasicMaterial;
};

export function Land({ geometry, material }: LandProps) {
  return <mesh geometry={geometry} material={material} />;
}
