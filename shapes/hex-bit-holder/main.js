import { bitHolder } from './holder.js';

const tray = bitHolder(6, 2).color('#7fe0e0');
// A couple of bits shown as ghosts so the fit is visible in the preview
const bit = prism(6, 6.35 / Math.sqrt(3), 25).rotate(0, 30, 0).onPlate().translate(-30, 4, -6);
show([bit, bit.translate(12, 0, 0)], { name: 'bits', ghost: true });
return tray;
