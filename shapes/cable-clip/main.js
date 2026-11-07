import { cableClip } from './clip.js';

// Clips for three common cable sizes, side by side.
const sizes = [4, 6, 8];
return sizes.map((d, i) => cableClip(d, { screw: d > 6 ? 'M4' : 'M3' }).translate(0, 0, i * 16 - 16).color(['#8fe3a8', '#8fb3ff', '#ffd27f'][i]));
