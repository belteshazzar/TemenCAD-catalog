/**
 * wallHook(width, opts) -> Shape
 * Modelled standing up (back plate against the wall at z = 0, arm reaching out along +Z with a lip at
 * the end), then laid on its back so the flat wall face prints on the plate.
 * opts: { reach = 30, thickness = 4, plate = 50, lip = 10, screw = 'M4', radius = 2 }
 */
export function wallHook(width = 20, { reach = 30, thickness = 4, plate = 50, lip = 10, screw = 'M4', radius = 2 } = {}) {
  const t = thickness;
  const back = roundedBox(width, plate, t, radius, { edges: 'vertical' }).onPlate().translate(0, 0, t / 2);          // z in [0, t]
  const arm = box(width, t, reach).translate(0, t / 2, t + reach / 2);                                               // along +Z at the bottom
  const tip = roundedBox(width, lip, t, 1, { edges: 'vertical' }).onPlate().translate(0, 0, t + reach - t / 2);     // lip up at the end
  const g = reach * 0.5;                                                                                              // gusset between plate and arm
  const corner = (y, z) => box(width, 0.01, 0.01).translate(0, y, z);
  const gusset = hull(corner(t, t), corner(t + g, t), corner(t, t + g));
  // Screws from the front face (z = t) into the wall: countersink at z = t, shank toward z = 0
  const holes = [plate * 0.25, plate * 0.8].map((y) => screwHole(screw, t + 1, { type: 'countersunk' }).rotate(90, 0, 0).translate(0, y, t));
  const hook = union(back, arm, tip, gusset).subtract(holes);
  return hook.rotate(-90, 0, 0).onPlate().name('wall hook');
}
