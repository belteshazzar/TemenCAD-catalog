import { wallHook } from './hook.js';

return [
  wallHook(20).color('#c2e86b'),
  wallHook(30, { reach: 40, screw: 'M5' }).translate(45, 0, 0).color('#8fb3ff'),
];
