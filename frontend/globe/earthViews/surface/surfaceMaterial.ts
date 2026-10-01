import { MeshStandardMaterial, type Texture } from "three";

/**
 * Builds a land material for the Surface view while retaining the existing
 * GEBCO normal/shading shader. The source texture is equirectangular, with
 * north at the top and longitude 0 at the horizontal center.
 *
 * The returned material is owned by the caller and should be disposed when the
 * view material is replaced. The input texture remains owned by its loader.
 */
export function createSurfaceMaterial(
  editorialMaterial: MeshStandardMaterial,
  surfaceTexture: Texture,
) {
  const material = editorialMaterial.clone();
  material.color.setRGB(1, 1, 1);
  material.map = null;
  material.needsUpdate = true;

  const inheritedCompile = editorialMaterial.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    inheritedCompile.call(material, shader, renderer);
    shader.uniforms.surfaceMap = { value: surfaceTexture };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vSurfacePosition;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvSurfacePosition = position;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vSurfacePosition;\nuniform sampler2D surfaceMap;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec3 surfacePosition = normalize(vSurfacePosition);
        float surfaceLongitude = atan(surfacePosition.x, surfacePosition.z);
        float surfaceLatitude = asin(clamp(surfacePosition.y, -1.0, 1.0));
        vec2 surfaceUv = vec2(0.5 + surfaceLongitude / (2.0 * PI), 0.5 + surfaceLatitude / PI);
        vec3 surfaceColor = texture2D(surfaceMap, surfaceUv).rgb;
        surfaceColor *= vec3(1.03, 0.99, 0.82);
        diffuseColor.rgb *= surfaceColor;`,
      );
  };
  material.customProgramCacheKey = () => "earthview-surface-land-with-gebco-v3";

  return material;
}
