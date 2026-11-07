/**
 * hinge(length, opts) -> { left, right }
 * A print-in-place hinge lying flat on the plate, axis along Z at x = 0.
 * opts: { knuckles = 5, pin = 3, wall = 2, clearance = 0.3, leaf = 18, thickness = 3 }
 *   knuckles  number of knuckle segments along the axis (odd ones belong to the left leaf)
 *   pin       pin diameter; the right knuckles get pin + 2 × clearance holes
 *   clearance printer-dependent gap between moving parts (0.25–0.4 for FDM)
 *   leaf      width of each leaf plate, thickness its height
 */
export function hinge(length = 40, { knuckles = 5, pin = 3, wall = 2, clearance = 0.3, leaf = 18, thickness = 3 } = {}) {
  const R = pin / 2 + wall;                // knuckle radius
  const seg = length / knuckles;           // knuckle pitch along Z
  const alongZ = (r, h) => cylinder(r, h, { segments: 48 }).rotate(90, 0, 0); // Y axis -> Z axis
  const span = (i) => ({ z: -length / 2 + seg * i + seg / 2, h: seg - clearance });

  const plate = (side) => roundedBox(leaf, thickness, length, 1.5, { edges: 'vertical' }).onPlate().translate(side * (leaf / 2), 0, 0);
  let left = plate(-1), right = plate(1);
  const leftK = [], rightK = [];
  for (let i = 0; i < knuckles; i++) {
    const { z, h } = span(i);
    const k = alongZ(R, h).translate(0, R, z);
    if (i % 2 === 0) leftK.push(k); else rightK.push(k);
    // the other leaf's plate stays clear of this knuckle
    const clear = alongZ(R + clearance, seg + 2 * clearance).translate(0, R, z);
    if (i % 2 === 0) right = right.subtract(clear); else left = left.subtract(clear);
  }
  const pinRod = alongZ(pin / 2, length - clearance).translate(0, R, 0);
  const pinHole = alongZ(pin / 2 + clearance, length + 2).translate(0, R, 0);
  left = union(left, ...leftK, pinRod);
  right = union(right, ...rightK).subtract(pinHole);
  return { left: left.name('hinge left'), right: right.name('hinge right') };
}
