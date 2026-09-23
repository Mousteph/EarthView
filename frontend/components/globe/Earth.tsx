"use client";

import { useEffect, useMemo } from "react";
import type { Texture } from "three";
import { readDesignColor } from "@/lib/designTokens";
import { createReliefMaterial } from "./relief";

export function Earth({ reliefTexture }: { readonly reliefTexture: Texture }) {
  const material = useMemo(() => createReliefMaterial(reliefTexture, "ocean"), [reliefTexture]);

  useEffect(() => {
    material.color.set(readDesignColor("--color-ocean-blue"));
    return () => material.dispose();
  }, [material]);

  return (
    <mesh>
      <sphereGeometry />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
