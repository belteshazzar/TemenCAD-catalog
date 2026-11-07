/**
 * boxWithLid(w, d, h, opts) -> { body, lid }
 * Outer size w (X) × d (Z) × h (Y, body height). Both parts sit on the plate, the lid upside down for printing.
 * opts: { wall = 2, lip = 3, clearance = 0.25, radius = 3 }
 */
export function boxWithLid(w = 60, d = 40, h = 25, { wall = 2, lip = 3, clearance = 0.25, radius = 3 } = {}) {
  const outer = (height) => roundedBox(w, height, d, radius, { edges: 'vertical', segments: 12 }).onPlate();
  const cavity = roundedBox(w - 2 * wall, h, d - 2 * wall, Math.max(0.5, radius - wall), { edges: 'vertical', segments: 12 }).onPlate().translate(0, wall, 0);
  const body = outer(h).subtract(cavity).name('body');
  const inner = (shrink, height) => roundedBox(w - 2 * shrink, height, d - 2 * shrink, Math.max(0.5, radius - shrink), { edges: 'vertical', segments: 12 }).onPlate();
  const ring = inner(wall + clearance, lip).subtract(inner(2 * wall + clearance, lip + 2).translate(0, -1, 0)).translate(0, wall, 0);
  const lid = union(outer(wall), ring).name('lid');
  return { body, lid };
}
