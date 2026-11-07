/**
 * bitHolder(cols, rows, opts) -> Shape
 * opts: { pitch = 12, depth = 12, hex = 6.35, clearance = 0.3, base = 4, margin = 4, radius = 3 }
 *   hex  across-flats size of the bits (6.35 mm = 1/4 inch); pockets are sized across flats + clearance
 */
export function bitHolder(cols = 6, rows = 2, { pitch = 12, depth = 12, hex = 6.35, clearance = 0.3, base = 4, margin = 4, radius = 3 } = {}) {
  const w = cols * pitch + 2 * margin, d = rows * pitch + 2 * margin, h = depth + base;
  const block = roundedBox(w, h, d, radius, { edges: 'vertical' }).onPlate();
  const r = (hex + clearance) / Math.sqrt(3);            // circumradius from across-flats
  const pocket = prism(6, r, depth + 1).rotate(0, 30, 0).onPlate().translate(0, base, 0);
  const pockets = grid(pocket, [cols, rows], [pitch, pitch]);
  return block.subtract(pockets).name(`bit holder ${cols}x${rows}`);
}
