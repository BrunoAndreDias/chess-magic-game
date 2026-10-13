import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { expect, test } from 'vitest';
import { roundedBox } from './rounded';

const arrays = (g: THREE.BufferGeometry) => Object.fromEntries(Object.entries(g.attributes).map(([k, a]) => [k, Array.from(a.array)]));

test.each([[0.94, 0.3, 0.94, 0.075], [1.37, 0.4, 0.56, 0.06], [0.52, 0.22, 0.52, 0.05], [0.14, 1.4, 1, 0.04], [0.2, 0.2, 0.2, 0.5]])(
  'roundedBox(%f, %f, %f, %f) has the numbers of three\'s RoundedBoxGeometry',
  (w, h, d, r) => {
    const ref = new RoundedBoxGeometry(w, h, d, 1, r), want = arrays(ref);
    const got = roundedBox(w, h, d, r);
    expect(got.attributes.color!.array).toEqual(new Float32Array(ref.attributes.position!.count * 3).fill(1));
    got.deleteAttribute('color');
    expect(arrays(got)).toEqual(want);
  },
);
