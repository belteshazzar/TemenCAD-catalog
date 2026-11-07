/**
 * cableClip(diameter, opts) -> Shape
 * A C clip around a cable (axis along Z) with a screw tab underneath; sits on the plate.
 * opts: { wall = 2.4, width = 8, opening = 0.7, screw = 'M3', tab = 10 }
 *   opening  fraction of the cable diameter left open at the top (0.6–0.8 snaps on, 1 is a cradle)
 */
export function cableClip(diameter = 6, { wall = 2.4, width = 8, opening = 0.7, screw = 'M3', tab = 10 } = {}) {
  const r = diameter / 2, R = r + wall;
  const ring = cylinder(R, width, { segments: 64 }).subtract(cylinder(r, width + 2, { segments: 64 }))
    .rotate(90, 0, 0);                                            // axis along Z
  const slot = box(diameter * opening, R + 1, width + 2).translate(0, R + 0.5, 0); // opening at the top
  const base = roundedBox(2 * R + tab, wall, width, 1.5, { edges: 'vertical' }).onPlate().translate(tab / 2, 0, 0);
  const hole = screwHole(screw, wall + 1, { type: 'countersunk' }).translate(R + tab / 2 - 1, wall, 0);
  return union(ring.translate(0, R, 0), base).subtract(slot, hole).name(`cable clip ${diameter} mm`);
}
