import * as THREE from 'three';

type Axis = 'x' | 'y' | 'z';

const SIDE = { x: 0, y: 1, z: 2 } as const;

/** One uv coordinate of a rounded box vertex: which side length it runs along, whether it is flipped, and where it sits on its arc. */
interface ArcUv { side: 0 | 1 | 2; flip: boolean; rising: boolean; angle: number }

/**
 * The size-free half of three's RoundedBoxGeometry with one segment: per vertex, the corner it leans to, its normal and its
 * place on each uv arc, worked out once with three's own steps. Size and radius only scale these, so a block costs one pass.
 */
const ROUNDED = (() => {
  const unit = new THREE.BoxGeometry(1, 1, 1, 3, 3, 3).toNonIndexed(), pos = unit.attributes.position!.array, half = 0.5 / 3, quarter = Math.PI / 4;
  const p = new THREE.Vector3(), n = new THREE.Vector3(), flat = new THREE.Vector3(), face = new THREE.Vector3();
  const sign: number[] = [], normal: number[] = [], uv: ArcUv[] = [];

  // As getUv in RoundedBoxGeometry.js, with the side length left for later.
  const arc = (along: Axis, drop: Axis, flip: boolean): ArcUv => {
    flat.copy(n);
    flat[drop] = 0;
    flat.normalize();

    return { side: SIDE[along], flip, rising: Math.sign(flat[along]) === 1, angle: 1.0 - flat.angleTo(face) / quarter };
  };

  // Per face of the box, in its vertex order: the face's direction and its two uv coordinates as RoundedBoxGeometry lays them.
  const FACES: readonly [[number, number, number], [Axis, Axis, boolean], [Axis, Axis, boolean]][] = [
    [[1, 0, 0], ['z', 'y', false], ['y', 'z', true]], [[-1, 0, 0], ['z', 'y', true], ['y', 'z', true]],
    [[0, 1, 0], ['x', 'z', true], ['z', 'x', false]], [[0, -1, 0], ['x', 'z', true], ['z', 'x', true]],
    [[0, 0, 1], ['x', 'y', true], ['y', 'x', true]], [[0, 0, -1], ['x', 'y', false], ['y', 'x', true]],
  ];

  for (let i = 0; i < pos.length; i += 3) {
    p.fromArray(pos, i);
    n.copy(p);
    n.x -= Math.sign(n.x) * half;
    n.y -= Math.sign(n.y) * half;
    n.z -= Math.sign(n.z) * half;
    n.normalize();
    sign.push(Math.sign(p.x), Math.sign(p.y), Math.sign(p.z));
    normal.push(n.x, n.y, n.z);
    const [dir, u, v] = FACES[Math.floor(i / (pos.length / 6))]!;
    face.set(...dir);
    uv.push(arc(...u), arc(...v));
  }

  unit.dispose();

  return { sign, normal, normals: new Float32Array(normal), uv, count: pos.length / 3 };
})();

/**
 * three's `RoundedBoxGeometry(w, h, d, 1, radius)` with a white colour attribute, the attribute set the board kit merges on: the same
 * numbers, without building, unindexing and copying a box each time.
 */
export function roundedBox(w: number, h: number, d: number, radius: number): THREE.BufferGeometry {
  const r = Math.min(w / 2, h / 2, d / 2, radius), box = [w / 2 - r, h / 2 - r, d / 2 - r], dims = [w, h, d], { sign, normal, uv, count } = ROUNDED;
  const arcLen = 2 * Math.PI * r / 4, ratio = dims.map(len => { const mid = Math.max(len - 2 * r, 0); return { arc: 0.5 * arcLen / (arcLen + mid), mid: mid / (arcLen + mid) }; });
  const pos = new Float32Array(count * 3), uvs = new Float32Array(count * 2);

  for (let i = 0; i < count * 3; i++) pos[i] = box[i % 3]! * sign[i]! + normal[i]! * r;

  for (let j = 0; j < count * 2; j++) {
    const a = uv[j]!, k = ratio[a.side]!, t = a.rising ? a.angle * k.arc : k.mid + k.arc + k.arc * (1.0 - a.angle);
    uvs[j] = a.flip ? 1.0 - t : t;
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(ROUNDED.normals.slice(), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3));

  return g;
}
