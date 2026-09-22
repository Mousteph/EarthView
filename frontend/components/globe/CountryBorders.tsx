import type { BufferGeometry, LineBasicMaterial } from "three";

type CountryBordersProps = {
  geometry: BufferGeometry;
  material: LineBasicMaterial;
};

export function CountryBorders({ geometry, material }: CountryBordersProps) {
  return <lineSegments geometry={geometry} material={material} renderOrder={1} />;
}
