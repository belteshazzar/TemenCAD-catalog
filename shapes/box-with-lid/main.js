import { boxWithLid } from './box.js';

const { body, lid } = boxWithLid(60, 40, 25, { wall: 2, lip: 3 });
return { body: body.color('#8fb3ff'), lid: lid.translate(0, 0, 50).color('#ffb366') };
