/**
 * Validate every package under shapes/, build it with the TemenCAD engine, render a thumbnail and
 * write the static catalogue to dist/ (index.json, packages/*.temen, thumbs/*.png, index.html).
 *   node scripts/build.mjs           build dist/
 *   node scripts/build.mjs --check   validate and build only (pull requests); no dist/ output
 * Set TEMENCAD_DIR to a checkout of the app to build against local sources instead of the npm dependency.
 */
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderThumbnail } from './render.mjs';

const base = process.env.TEMENCAD_DIR ? pathToFileURL(resolve(process.env.TEMENCAD_DIR) + '/').href : 'temencad/';
const { buildProject, projectFromFolder } = await import(base + 'src/headless.js');
const { validateManifest, buildPackage, findExports, MANIFEST, THUMB, API_VERSION } = await import(base + 'src/package.js');
const { isScript, ENTRY } = await import(base + 'src/project.js');
const { colorHex } = await import(base + 'src/export.js');
const { whereText } = await import(base + 'src/trace.js');

const CHECK = process.argv.includes('--check');
const ROOT = resolve(new URL('..', import.meta.url).pathname);
const SHAPES = join(ROOT, 'shapes');
const DIST = join(ROOT, 'dist');
const LIMITS = { packageBytes: 2 * 1024 * 1024, scriptBytes: 200 * 1024, buildMs: 60_000 };
// Scripts in the catalogue must not reach the network or load code; the app shadows these too.
const FORBIDDEN = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|eval|Function)\s*\(|\bimport\s*\(/;

const problems = [];
const fail = (name, msg) => problems.push(`${name}: ${msg}`);

const names = readdirSync(SHAPES).filter((n) => !n.startsWith('.') && statSync(join(SHAPES, n)).isDirectory()).sort();
const entries = [];
for (const name of names) {
  const dir = join(SHAPES, name);
  let manifest;
  try { manifest = JSON.parse(readFileSync(join(dir, MANIFEST), 'utf8')); } catch (e) { fail(name, `cannot read ${MANIFEST}: ${e.message}`); continue; }
  if (manifest.name !== name) fail(name, `manifest name "${manifest.name}" must match the folder name`);
  const project = projectFromFolder(dir, { readdirSync, statSync });
  project.files.delete(MANIFEST); project.files.delete(THUMB);
  for (const e of validateManifest(manifest, project)) fail(name, e);
  if (!project.has(ENTRY)) { fail(name, `no ${ENTRY} (the demo script)`); continue; }
  let bytes = 0;
  for (const f of project.names()) {
    const c = project.get(f);
    const size = typeof c === 'string' ? Buffer.byteLength(c) : c.byteLength;
    bytes += size;
    if (isScript(f)) {
      if (size > LIMITS.scriptBytes) fail(name, `${f} is larger than ${LIMITS.scriptBytes / 1024} KB`);
      const m = c.match(FORBIDDEN);
      if (m) fail(name, `${f} uses "${m[0].trim()}", which catalogue scripts may not`);
    }
  }
  if (bytes > LIMITS.packageBytes) fail(name, `package is larger than ${LIMITS.packageBytes / 1048576} MB`);
  if (project.has(manifest.module)) {
    const found = findExports(project.get(manifest.module));
    for (const x of manifest.exports ?? []) if (!found.includes(x)) fail(name, `module ${manifest.module} does not export "${x}" (found: ${found.join(', ') || 'nothing'})`);
  }
  if (problems.some((p) => p.startsWith(name + ':'))) continue;

  const t0 = Date.now();
  let result;
  const warnings = [];
  try {
    result = await buildProject(project, { onWarn: (m) => warnings.push(`Warning${whereText(m.trace)}: ${m.text}`) });
  } catch (err) {
    fail(name, `build failed: Error${whereText(err.trace)}: ${err.message}`);
    continue;
  }
  const ms = Date.now() - t0;
  if (ms > LIMITS.buildMs) fail(name, `build took ${ms} ms, over the ${LIMITS.buildMs / 1000} s limit`);
  const visible = result.meshes.filter((m) => !m.hidden && !m.ghost);
  if (!visible.length) fail(name, 'the demo produces no visible parts');
  for (const w of warnings) console.log(`  ${name}: ${w}`);
  const thumb = renderThumbnail(result.meshes, { colorHex });
  entries.push({ name, manifest, project, thumb, bytes, parts: visible.map((m) => ({ name: m.name, triangles: m.indices.length / 3, volume_mm3: +m.volume.toFixed(1) })), ms });
  console.log(`✓ ${name}@${manifest.version}  ${visible.length} part${visible.length === 1 ? '' : 's'}, ${result.tris} triangles, ${ms} ms`);
}

if (problems.length) {
  console.error('\nProblems:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
if (CHECK) { console.log(`\nAll ${entries.length} packages are valid.`); process.exit(0); }

rmSync(DIST, { recursive: true, force: true });
mkdirSync(join(DIST, 'packages'), { recursive: true });
mkdirSync(join(DIST, 'thumbs'), { recursive: true });
const index = { generated: new Date().toISOString(), apiVersion: API_VERSION, packages: [] };
for (const e of entries) {
  const pkg = buildPackage(e.project, e.manifest, e.thumb.buffer.slice(e.thumb.byteOffset, e.thumb.byteOffset + e.thumb.byteLength));
  writeFileSync(join(DIST, 'packages', `${e.name}.temen`), pkg);
  writeFileSync(join(DIST, 'thumbs', `${e.name}.png`), e.thumb);
  index.packages.push({
    ...e.manifest,
    files: e.project.names(),
    bytes: pkg.length,
    package: `packages/${e.name}.temen`,
    thumb: `thumbs/${e.name}.png`,
    source: `shapes/${e.name}/`,
    parts: e.parts,
  });
}
writeFileSync(join(DIST, 'index.json'), JSON.stringify(index, null, 1));
writeFileSync(join(DIST, 'index.html'), listingPage(index));
writeFileSync(join(DIST, '.nojekyll'), '');
console.log(`\nWrote dist/ with ${entries.length} packages.`);

/** A plain listing page for people browsing the catalogue site directly. */
function listingPage(index) {
  const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const cards = index.packages.map((p) => `<a class="card" href="${p.package}" title="Download ${esc(p.name)}.temen">
  <img src="${p.thumb}" alt="" loading="lazy" />
  <h2>${esc(p.title)}</h2>
  <p>${esc(p.description)}</p>
  <small>${esc(p.author)} · ${esc(p.license)} · v${esc(p.version)}</small>
</a>`).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>TemenCAD catalogue</title>
<style>
body{margin:0;background:#f7f6f2;color:#2b2b2b;font:14px/1.45 system-ui,sans-serif}
header{padding:20px 24px;border-bottom:1px solid #dedbd3}header h1{margin:0;font-size:20px}header p{margin:4px 0 0;color:#6b6b6b}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px;padding:24px}
.card{display:block;background:#fbfaf7;border:1px solid #dedbd3;border-radius:8px;overflow:hidden;color:inherit;text-decoration:none}
.card:hover{border-color:#0b6fcf}.card img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;background:#f1efea}
.card h2{font-size:15px;margin:10px 12px 4px}.card p{margin:0 12px 6px;color:#6b6b6b}.card small{display:block;margin:0 12px 12px;color:#6b6b6b}
</style></head><body>
<header><h1>TemenCAD catalogue</h1><p>${index.packages.length} shared shapes. Add them from the + menu in <a href="https://belteshazzar.github.io/TemenCAD/">TemenCAD</a>, or with <code>npx temencad add &lt;name&gt;</code>. Source and contributions: <a href="https://github.com/belteshazzar/TemenCAD-catalog">GitHub</a>.</p></header>
<main>
${cards}
</main></body></html>
`;
}
