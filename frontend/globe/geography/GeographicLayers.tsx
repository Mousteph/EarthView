"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { LineBasicMaterial, MeshBasicMaterial, type Texture } from "three";
import { DESIGN_COLOR_TOKENS, readDesignColor } from "@/shared/designTokens";
import { CountryBorders } from "./CountryBorders";
import { Coastlines } from "./Coastlines";
import {
  createGeographyGeometries,
  loadPreparedGeography,
  nextGeographicLod,
  type GeographicLod,
} from "./geography";
import { Land } from "./Land";
import { Lakes } from "./Lakes";
import { createReliefMaterial } from "../relief/relief";
import { SurfaceLand } from "../surface/SurfaceLand";

type GeographicLayersProps = {
  readonly onActiveLodChange: (lod: GeographicLod) => void;
  readonly reliefTexture: Texture;
  readonly surfaceVisible: boolean;
};

type GeographyGeometries = ReturnType<typeof createGeographyGeometries>;

export function GeographicLayers({ onActiveLodChange, reliefTexture, surfaceVisible }: GeographicLayersProps) {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const [requestedLod, setRequestedLod] = useState<GeographicLod>("50m");
  const [geometries, setGeometries] = useState<GeographyGeometries | null>(null);
  const geometriesByLod = useRef(new Map<GeographicLod, GeographyGeometries>());
  const prefetchedCloseLod = useRef(false);
  const isMounted = useRef(false);
  const landMaterial = useMemo(() => createReliefMaterial(reliefTexture, "land"), [reliefTexture]);
  const lakeMaterial = useMemo(() => new MeshBasicMaterial(), []);
  const borderMaterial = useMemo(() => {
    const material = new LineBasicMaterial({
      depthTest: false,
      depthWrite: false,
    });

    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec3 vEarthWorldPosition;",
        )
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvEarthWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec3 vEarthWorldPosition;",
        )
        .replace(
          "#include <clipping_planes_fragment>",
          "#include <clipping_planes_fragment>\nif (dot(normalize(vEarthWorldPosition), normalize(cameraPosition - vEarthWorldPosition)) <= 0.0) discard;",
        );
    };
    material.customProgramCacheKey = () => "earthview-front-hemisphere-lines-v1";
    return material;
  }, []);

  useFrame(() => {
    const distance = camera.position.length();

    if (!surfaceVisible && !prefetchedCloseLod.current && distance < 3.5) {
      prefetchedCloseLod.current = true;
      void loadPreparedGeography("10m")
        .then((prepared) => {
          if (!isMounted.current || geometriesByLod.current.has("10m")) return;
          geometriesByLod.current.set("10m", createGeographyGeometries(prepared));
        })
        .catch(() => {
          prefetchedCloseLod.current = false;
        });
    }

    const nextLod = nextGeographicLod(requestedLod, distance, surfaceVisible);
    if (nextLod !== requestedLod) setRequestedLod(nextLod);
  });

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    landMaterial.color.set(readDesignColor(DESIGN_COLOR_TOKENS.land));
    lakeMaterial.color.set(readDesignColor(DESIGN_COLOR_TOKENS.ocean));
    borderMaterial.color.set(readDesignColor(DESIGN_COLOR_TOKENS.countryLine));
  }, [borderMaterial, lakeMaterial, landMaterial]);

  useEffect(() => {
    let isCurrent = true;
    let scheduledFrame: number | undefined;

    loadPreparedGeography(requestedLod).then((prepared) => {
      if (!isCurrent) return;
      let nextGeometries = geometriesByLod.current.get(requestedLod);
      if (!nextGeometries) {
        nextGeometries = createGeographyGeometries(prepared);
        geometriesByLod.current.set(requestedLod, nextGeometries);
      }
      setGeometries(nextGeometries);
      onActiveLodChange(requestedLod);
      invalidate();
      scheduledFrame = requestAnimationFrame(() => invalidate());
    });

    return () => {
      isCurrent = false;
      if (scheduledFrame !== undefined) cancelAnimationFrame(scheduledFrame);
    };
  }, [invalidate, onActiveLodChange, requestedLod]);

  useEffect(() => () => {
    for (const cached of geometriesByLod.current.values()) {
      cached.land.dispose();
      cached.lakes.dispose();
      cached.coastlines.dispose();
      cached.borders.dispose();
    }
    geometriesByLod.current.clear();
  }, []);

  useEffect(
    () => () => {
      landMaterial.dispose();
      lakeMaterial.dispose();
      borderMaterial.dispose();
    },
    [borderMaterial, lakeMaterial, landMaterial],
  );

  if (!geometries) return null;

  return (
    <>
      {surfaceVisible
        ? <Suspense fallback={<Land geometry={geometries.land} material={landMaterial} />}>
          <SurfaceLand geometry={geometries.land} baseLandMaterial={landMaterial} />
        </Suspense>
        : <Land geometry={geometries.land} material={landMaterial} />}
      <Lakes geometry={geometries.lakes} material={lakeMaterial} />
      <CountryBorders geometry={geometries.borders} material={borderMaterial} />
      <Coastlines geometry={geometries.coastlines} material={borderMaterial} />
    </>
  );
}
