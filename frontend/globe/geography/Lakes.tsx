import type { BufferGeometry, MeshBasicMaterial } from "three";

type LakesProps = {
  readonly geometry: BufferGeometry;
  readonly material: MeshBasicMaterial;
};

export function Lakes({ geometry, material }: LakesProps) {
  return <mesh geometry={geometry} material={material} renderOrder={1} />;
}
