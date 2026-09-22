"use client";

import { useEffect, useState } from "react";
import { BufferGeometry, DoubleSide } from "three";
import { createLandGeometry, loadNaturalEarthData } from "./geography";

export function Land() {
  const [geometry, setGeometry] = useState<BufferGeometry | null>(null);

  useEffect(() => {
    let isCurrent = true;

    loadNaturalEarthData().then((data) => {
      const nextGeometry = createLandGeometry(data.countries);

      if (isCurrent) setGeometry(nextGeometry);
      else nextGeometry.dispose();
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial
        color="#e5e4e0"
        polygonOffset
        polygonOffsetFactor={1}
        polygonOffsetUnits={1}
        side={DoubleSide}
      />
    </mesh>
  );
}
