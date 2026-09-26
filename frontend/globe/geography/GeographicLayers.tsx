"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import { LineBasicMaterial, type Texture } from "three";
import { readDesignColor } from "@/shared/designTokens";
import { CountryBorders } from "./CountryBorders";
import {
  createGeographyGeometries,
  GEOGRAPHY_LOD_THRESHOLDS,
  loadPreparedGeography,
  type GeographicLod,
} from "./geography";
import { Land } from "./Land";
import { createReliefMaterial } from "../relief/relief";

type GeographicLayersProps = {
  readonly onActiveLodChange: (lod: GeographicLod) => void;
  readonly reliefTexture: Texture;
};

type GeographyGeometries = ReturnType<typeof createGeographyGeometries>;

export function GeographicLayers({ onActiveLodChange, reliefTexture }: GeographicLayersProps) {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const [requestedLod, setRequestedLod] = useState<GeographicLod>("50m");
  const [geometries, setGeometries] = useState<GeographyGeometries | null>(null);
  const landMaterial = useMemo(() => createReliefMaterial(reliefTexture, "land"), [reliefTexture]);
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

    if (requestedLod === "50m" && distance < GEOGRAPHY_LOD_THRESHOLDS.enterCloseDistance) {
      setRequestedLod("10m");
    } else if (
      requestedLod === "10m"
      && distance > GEOGRAPHY_LOD_THRESHOLDS.exitCloseDistance
    ) {
      setRequestedLod("50m");
    }
  });

  useEffect(() => {
    landMaterial.color.set(readDesignColor("--color-land"));
    borderMaterial.color.set(readDesignColor("--color-country-line"));
  }, [borderMaterial, landMaterial]);

  useEffect(() => {
    let isCurrent = true;
    let scheduledFrame: number | undefined;

    loadPreparedGeography(requestedLod).then((prepared) => {
      if (!isCurrent) return;
      setGeometries(createGeographyGeometries(prepared));
      onActiveLodChange(requestedLod);
      invalidate();
      scheduledFrame = requestAnimationFrame(() => invalidate());
    });

    return () => {
      isCurrent = false;
      if (scheduledFrame !== undefined) cancelAnimationFrame(scheduledFrame);
    };
  }, [invalidate, onActiveLodChange, requestedLod]);

  useEffect(
    () => () => {
      geometries?.land.dispose();
      geometries?.borders.dispose();
    },
    [geometries],
  );

  useEffect(
    () => () => {
      landMaterial.dispose();
      borderMaterial.dispose();
    },
    [borderMaterial, landMaterial],
  );

  if (!geometries) return null;

  return (
    <>
      <Land geometry={geometries.land} material={landMaterial} />
      <CountryBorders geometry={geometries.borders} material={borderMaterial} />
    </>
  );
}
