import { hinge } from './hinge.js';

// A 40 mm hinge with five knuckles, printed flat. Tune clearance to your printer.
const h = hinge(40, { knuckles: 5, pin: 3, clearance: 0.3 });
echo('left volume', Math.round(h.left.volume()), 'right volume', Math.round(h.right.volume()));
return { left: h.left.color('#8fb3ff'), right: h.right.color('#ffb366') };
