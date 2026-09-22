"use client";

import { useEffect, useRef } from "react";
import { MeshBasicMaterial } from "three";
import { readDesignColor } from "@/lib/designTokens";

export function Earth() {
  const material = useRef<MeshBasicMaterial>(null);

  useEffect(() => {
    material.current?.color.set(readDesignColor("--color-petrol"));
  }, []);

  return (
    <mesh>
      <sphereGeometry args={[1, 96, 96]} />
      <meshBasicMaterial ref={material} />
    </mesh>
  );
}
