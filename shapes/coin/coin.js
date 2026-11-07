
export function coin(d = 20) {
  return cylinder(d / 2, 2).onPlate().name('coin');
}
