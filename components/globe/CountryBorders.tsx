"use client";

import { useEffect, useMemo, useState } from "react";
import { BufferGeometry, LineBasicMaterial } from "three";
import { createCountryBorderGeometry, loadNaturalEarthData } from "./geography";

export function CountryBorders() {
  const [geometry, setGeometry] = useState<BufferGeometry | null>(null);
  const material = useMemo(
    () => new LineBasicMaterial({ color: "#73726f", transparent: true, opacity: 1, depthWrite: false }),
    [],
  );

  useEffect(() => {
    let isCurrent = true;

    loadNaturalEarthData().then((data) => {
      const nextGeometry = createCountryBorderGeometry(data.countries);

      if (isCurrent) setGeometry(nextGeometry);
      else nextGeometry.dispose();
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => () => geometry?.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  if (!geometry) return null;

  return <lineSegments geometry={geometry} material={material} renderOrder={1} />;
}
