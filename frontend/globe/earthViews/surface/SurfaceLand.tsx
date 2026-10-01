"use client";

import { useEffect, useMemo } from "react";
import { useLoader, useThree } from "@react-three/fiber";
import type { BufferGeometry, MeshStandardMaterial } from "three";
import { KTX2Loader } from "three-stdlib";
import { createSurfaceMaterial } from "./surfaceMaterial";

export const SURFACE_TEXTURE_PATH = "/data/earth-views/surface/cross-blended-hypso.ktx2";

type SurfaceLandProps = {
  readonly geometry: BufferGeometry;
  readonly editorialMaterial: MeshStandardMaterial;
};

/** Reuses existing Natural Earth land geometry and inherited GEBCO shading. */
export function SurfaceLand({ geometry, editorialMaterial }: SurfaceLandProps) {
  const renderer = useThree((state) => state.gl);
  const texture = useLoader(
    KTX2Loader,
    SURFACE_TEXTURE_PATH,
    (loader) => loader.setTranscoderPath("/basis/").detectSupport(renderer),
  );
  const material = useMemo(
    () => createSurfaceMaterial(editorialMaterial, texture),
    [editorialMaterial, texture],
  );

  useEffect(() => () => material.dispose(), [material]);

  return <mesh geometry={geometry} material={material} />;
}
