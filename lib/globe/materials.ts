// lib/globe/materials.ts
//
// Матеріали глобуса. Рельєф уже намальований у текстурах, тому поверхня
// не освітлюється: світло сцени лише зіпсувало б відмивку, затемнивши
// півкулю.

import {
  Color,
  DoubleSide,
  MeshBasicMaterial,
  ShaderMaterial,
  Vector4,
  type Texture,
} from "three";
import { GLOBE_PALETTE } from "./palette";
import { REGION, REGION_FADE_DEG } from "./region";

const regionBounds = () =>
  new Vector4(REGION.lngMin, REGION.lngMax, REGION.latMin, REGION.latMax);

/**
 * Серпанок: що більш навскіс ми дивимося на поверхню, то більше вона
 * тоне в кольорі неба. Так горизонт розчиняється в тлі сторінки, як на
 * макеті, а не обривається різким краєм.
 */
const HAZE_GLSL = /* glsl */ `
  uniform vec3 hazeColor;
  uniform float hazeStrength;
  uniform float hazeRange;

  vec3 applyHaze(vec3 color, vec3 worldPos, vec3 worldNormal) {
    vec3 viewDir = normalize(cameraPosition - worldPos);
    float facing = clamp(dot(normalize(worldNormal), viewDir), 0.0, 1.0);
    float haze = (1.0 - smoothstep(0.0, hazeRange, facing)) * hazeStrength;
    return mix(color, hazeColor, haze);
  }
`;

const hazeUniforms = () => ({
  hazeColor: { value: new Color(GLOBE_PALETTE.haze) },
  hazeStrength: { value: 0.9 },
  hazeRange: { value: 0.55 },
});

/**
 * Поверхня Землі: загальна текстура плюс детальна латка навколо
 * України. Латка кладеться за географічними координатами фрагмента й
 * тане на краях, тож шва між ними не видно.
 */
export const createSurfaceMaterial = (worldMap: Texture, regionMap: Texture) =>
  new ShaderMaterial({
    uniforms: {
      worldMap: { value: worldMap },
      regionMap: { value: regionMap },
      regionBounds: { value: regionBounds() },
      regionFade: { value: REGION_FADE_DEG },
      ...hazeUniforms(),
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      void main() {
        vUv = uv;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        vWorldNormal = mat3(modelMatrix) * normal;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D worldMap;
      uniform sampler2D regionMap;
      uniform vec4 regionBounds;
      uniform float regionFade;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      ${HAZE_GLSL}

      void main() {
        // UV сфери лінійні за довготою й широтою, як і рівнокутна текстура.
        float lng = vUv.x * 360.0 - 180.0;
        float lat = vUv.y * 180.0 - 90.0;
        vec2 regionUv = vec2(
          (lng - regionBounds.x) / (regionBounds.y - regionBounds.x),
          (lat - regionBounds.z) / (regionBounds.w - regionBounds.z)
        );
        float edge = min(
          min(lng - regionBounds.x, regionBounds.y - lng),
          min(lat - regionBounds.z, regionBounds.w - lat)
        );
        float inside = smoothstep(0.0, regionFade, edge);

        // Обидві вибірки поза умовою: похідні для mip-рівнів мають бути
        // однаковими в сусідніх пікселях.
        vec3 world = texture2D(worldMap, vUv).rgb;
        vec3 region = texture2D(regionMap, regionUv).rgb;
        vec3 color = mix(world, region, inside);

        gl_FragColor = vec4(applyHaze(color, vWorldPos, vWorldNormal), 1.0);
        #include <colorspace_fragment>
      }
    `,
  });

/**
 * Верх плато України. Під ним та сама детальна текстура, але вибілена
 * в колір плато: річки й водосховища просвічують, рельєф ледь помітний.
 * Координати рахуються з позиції фрагмента, бо в геометрії полігона
 * немає UV.
 */
export const createCapMaterial = (regionMap: Texture) =>
  new ShaderMaterial({
    uniforms: {
      regionMap: { value: regionMap },
      regionBounds: { value: regionBounds() },
      capColor: { value: new Color(GLOBE_PALETTE.ukraineCap) },
      capMix: { value: 0.62 },
      ...hazeUniforms(),
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;

      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D regionMap;
      uniform vec4 regionBounds;
      uniform vec3 capColor;
      uniform float capMix;
      varying vec3 vWorldPos;
      ${HAZE_GLSL}

      void main() {
        // Обернене до polar2Cartesian з three-globe.
        vec3 dir = normalize(vWorldPos);
        float lat = degrees(asin(clamp(dir.y, -1.0, 1.0)));
        float lng = degrees(atan(dir.x, dir.z));
        vec2 regionUv = vec2(
          (lng - regionBounds.x) / (regionBounds.y - regionBounds.x),
          (lat - regionBounds.z) / (regionBounds.w - regionBounds.z)
        );
        vec3 ground = texture2D(regionMap, regionUv).rgb;
        vec3 color = mix(ground, capColor, capMix);
        gl_FragColor = vec4(applyHaze(color, vWorldPos, dir), 1.0);
        #include <colorspace_fragment>
      }
    `,
  });

/**
 * Стінки плато: суцільний синій, як зріз на макеті. Без освітлення:
 * з камери видно лише південні стінки, і під світлом з північного
 * заходу вони всі були б однаково в тіні.
 */
export const createSideMaterial = () =>
  new MeshBasicMaterial({
    color: GLOBE_PALETTE.ukraineSide,
    side: DoubleSide,
  });
