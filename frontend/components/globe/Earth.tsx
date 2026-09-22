"use client";

import { useEffect, useRef } from "react";
import { MeshBasicMaterial } from "three";
import { readDesignColor } from "@/lib/designTokens";

export function Earth() {
  const material = useRef<MeshBasicMaterial>(null);

  useEffect(() => {
    material.current?.color.set(readDesignColor("--color-ocean-blue"));
  }, []);

  return (
    <mesh>
      <sphereGeometry />
      <meshBasicMaterial ref={material} />
    </mesh>
  );
}
