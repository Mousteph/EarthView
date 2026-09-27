import {
  FrontSide,
  MeshStandardMaterial,
  NoColorSpace,
  RepeatWrapping,
  type Texture,
} from "three";

export const RELIEF = {
  texturePath: "/data/gebco/relief-4096.ktx2",
  landStrength: 0.85,
  bathymetryStrength: 0.65,
  ambientIntensity: 2.5,
  directionalIntensity: 2.4,
} as const;

export function createReliefMaterial(texture: Texture, surface: "land" | "ocean") {
  texture.colorSpace = NoColorSpace;
  texture.wrapS = RepeatWrapping;
  const material = new MeshStandardMaterial({
    side: FrontSide,
    roughness: 1,
    metalness: 0,
  });
  const strength = surface === "land" ? RELIEF.landStrength : RELIEF.bathymetryStrength;
  const channels = surface === "land" ? "rg" : "ba";

  material.onBeforeCompile = (shader) => {
    shader.uniforms.reliefMap = { value: texture };
    shader.uniforms.reliefStrength = { value: strength };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vReliefPosition;\nvarying vec3 vReliefEast;\nvarying vec3 vReliefNorth;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvReliefPosition = position;\nvec3 reliefEast = vec3(position.z, 0.0, -position.x);\nreliefEast = length(reliefEast) < 0.00001 ? vec3(1.0, 0.0, 0.0) : normalize(reliefEast);\nvReliefEast = normalMatrix * reliefEast;\nvReliefNorth = normalMatrix * cross(normalize(position), reliefEast);",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vReliefPosition;\nvarying vec3 vReliefEast;\nvarying vec3 vReliefNorth;\nuniform sampler2D reliefMap;\nuniform float reliefStrength;",
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        vec3 reliefPosition = normalize(vReliefPosition);
        float longitude = atan(reliefPosition.x, reliefPosition.z);
        float latitude = asin(clamp(reliefPosition.y, -1.0, 1.0));
        vec2 reliefUv = vec2(0.5 + longitude / (2.0 * PI), 0.5 + latitude / PI);
        vec2 reliefSlope = texture2D(reliefMap, reliefUv).${channels} * 2.0 - 1.0;
        vec3 east = normalize(vReliefEast);
        vec3 north = normalize(vReliefNorth);
        normal = normalize(normal - reliefStrength * (east * reliefSlope.x + north * reliefSlope.y));
        ${surface === "land" ? "diffuseColor.rgb *= 1.0 - min(length(reliefSlope) * 0.28, 0.34);" : ""}`,
      );
  };
  material.customProgramCacheKey = () => `earthview-relief-${surface}-v1`;
  return material;
}
