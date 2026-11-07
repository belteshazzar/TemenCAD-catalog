/**
 * knob(diameter, opts) -> Shape
 * opts: { height = 14, scallops = 12, shaft = 6, flat = 5.5, bore = 10, clearance = 0.15, top = 1.5 }
 *   shaft/flat  D-shaft diameter and its across-the-flat size (6 / 5.5 fits most pots and encoders)
 *   bore        depth of the shaft hole from the bottom; top is the rounded edge radius
 */
export function knob(diameter = 28, { height = 14, scallops = 12, shaft = 6, flat = 5.5, bore = 10, clearance = 0.15, top = 1.5 } = {}) {
  const r = diameter / 2;
  bore = Math.min(bore, height - 2); // never through the top
  // Body: a revolved profile with a rounded top edge
  const profile = polygon2d([[0, 0], [r, 0], [r, height - top], [r - top, height], [0, height]]);
  let body = revolve(profile.fillet(Math.min(top, 1)), { segments: 96 });
  // Finger scallops around the rim
  const sc = cylinder(diameter * 0.09, height + 2, { segments: 32 });
  body = body.subtract(polarArray(sc, scallops, { radius: r + diameter * 0.02 }));
  // D-shaped bore from the bottom
  const sr = shaft / 2 + clearance;
  const dShape = cylinder(sr, bore + 1, { segments: 48 }).intersect(box(shaft * 2, bore + 2, shaft * 2).translate(flat - shaft / 2 + clearance - shaft, 0, 0));
  return body.subtract(dShape.translate(0, bore / 2 - 0.5, 0)).name('knob');
}
