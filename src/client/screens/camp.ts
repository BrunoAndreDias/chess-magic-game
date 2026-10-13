import * as THREE from 'three';
import { disposeTree, seeded } from '../board/art';
import { air, dirtTexture, merged, owns, stoneTexture } from './camp-art';
import { EMBER, buildFire } from './camp-fire';
import { buildGround, buildWilds } from './camp-ground';
import { MOON_DIR, buildSky } from './camp-sky';

/** What a lock-in asks of the camp at one moment. Both at 0 is the camp at rest. */
export interface Mood {
  /** How far night closes in on the front figure: at 1 the sky, moon and fog go black and the fire burns low. */
  dark: number;
  /** How far the fire burns in the front figure's class glow instead of its own orange, 0 to 1. */
  fire: number;
}

export const CALM: Mood = { dark: 0, fire: 0 };

/** The place the party gathers: sky, ground, light and the fire they stand around. */
export interface Camp {
  /** Sets the class glow the fire may burn in. */
  tint(glow: number): void;
  /** Animates the camp `time` seconds in, under `mood`. */
  step(time: number, mood: Mood): void;
}

/** The moonlit haze where the land meets the sky; the fog fades into it so distance reads as depth. */
const HORIZON = 0x222a40;

/** Fog starts past the front figure from the resting camera, so closing the night never dims the hero. */
const FOG_NEAR = 7.2;

/** Builds the camp into `scene` around a fire at `fire`, with the key light on the front spot `front`. */
export function buildCamp(scene: THREE.Scene, fire: THREE.Vector3, front: { x: number; z: number }): Camp {
  const rnd = seeded(11), a = air(), still = window.matchMedia('(prefers-reduced-motion: reduce)'), horizon = new THREE.Color(HORIZON);
  const fog = new THREE.Fog(HORIZON, FOG_NEAR, 40);
  scene.fog = fog;
  scene.background = fog.color;

  const hemi = new THREE.HemisphereLight(0x5a6a98, 0x140e0c, 0.22 * Math.PI);
  const moon = new THREE.DirectionalLight(0x9db0e8, 0.9);
  moon.position.copy(MOON_DIR).multiplyScalar(20);

  const spot = new THREE.SpotLight(0xffd29a, 40, 14, 0.4, 0.55, 1.6);
  spot.position.set(0.6, 6.5, 5.2);
  spot.target.position.set(front.x, 0.8, front.z);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.bias = -0.0008;

  const ground = buildGround(fire, dirtTexture(rnd), rnd), pit = buildFire(a, fire, rnd);
  const grain = stoneTexture(rnd), stone = owns(new THREE.MeshStandardMaterial({ map: grain, vertexColors: true, roughness: 0.95 }), grain);
  const near = new THREE.Mesh(merged([...ground.near, ...pit.stones]), stone);
  near.castShadow = near.receiveShadow = true;
  scene.add(hemi, moon, moon.target, spot, spot.target, near, ...ground.objects, ...pit.glow);

  // The flames, the sky and the land past the stones are built in a task after the camp first draws, so the frame that
  // mounts the screen does not pay for them, and they join the scene once their shaders compile off the main thread with
  // the renderer and camera that first drew `near`. A camp disposed meanwhile has lost `near`, and frees them instead.
  let view: { renderer: THREE.WebGLRenderer; camera: THREE.Camera } | null = null;
  near.onBeforeRender = (renderer, _scene, camera) => { view ??= { renderer, camera }; };

  const arrive = (): void => {
    if (!near.parent) return;

    if (!view) {
      requestAnimationFrame(() => setTimeout(arrive));

      return;
    }

    const r = seeded(23), wilds = buildWilds(a, fire, r), later = new THREE.Group();
    later.add(new THREE.Mesh(merged(wilds.far), stone), ...buildSky(a, horizon, r), ...wilds.objects, ...pit.flames);
    void view.renderer.compileAsync(later, view.camera, scene).then(() => (near.parent ? scene.add(later) : disposeTree(later)));
  };

  requestAnimationFrame(() => setTimeout(arrive));

  const cls = new THREE.Color(EMBER), hemiK = hemi.intensity, moonK = moon.intensity, spotK = spot.intensity;

  return {
    tint(c) { cls.setHex(c); },
    step(time, mood) {
      const night = 1 - 0.9 * mood.dark;
      a.uTime.value = time;

      if (!still.matches) a.uDrift.value = time;
      a.uDark.value = mood.dark;
      a.uFire.value = mood.fire;
      a.uGlow.value.copy(cls);
      hemi.intensity = hemiK * night;
      moon.intensity = moonK * night;
      spot.intensity = spotK * (1 - 0.6 * mood.dark);
      fog.color.copy(horizon).multiplyScalar(1 - 0.95 * mood.dark);
      fog.far = THREE.MathUtils.lerp(40, 12, mood.dark);
      const rune = THREE.MathUtils.lerp(0.45 * (1 - 0.8 * mood.dark), 1.7, mood.fire) * (0.85 + 0.15 * Math.sin(time * 1.7));
      ground.runes.color.copy(cls).multiplyScalar(rune);
      pit.step(time, mood, cls);
    },
  };
}
