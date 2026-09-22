import type { BufferGeometry, LineBasicMaterial } from "three";

type CountryBordersProps = {
  readonly geometry: BufferGeometry;
  readonly material: LineBasicMaterial;
};

export function CountryBorders({ geometry, material }: CountryBordersProps) {
  return (
    <lineSegments {...{ geometry, material, renderOrder: 1 }} />
  );
}
