/**
 * Validate every package under shapes/, build it with the TemenCAD engine, render a thumbnail and
 * write the static catalogue to dist/ (index.json, packages/*.temen, thumbs/*.png, index.html).
 *   node scripts/build.mjs           build dist/
 *   node scripts/build.mjs --check   validate and build only (pull requests); no dist/ output
 * Set TEMENCAD_DIR to a checkout of the app to build against local sources instead of the npm dependency.
 */
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const base = process.env.TEMENCAD_DIR ? pathToFileURL(resolve(process.env.TEMENCAD_DIR) + '/').href : 'temencad/';
const { buildProject, projectFromFolder } = await import(base + 'src/headless.js');
const { validateManifest, buildPackage, findExports, MANIFEST, THUMB, API_VERSION } = await import(base + 'src/package.js');
const { isScript, ENTRY } = await import(base + 'src/project.js');
const { colorHex } = await import(base + 'src/export.js');
const { renderThumbnail } = await import(base + 'src/render.js');
const { whereText } = await import(base + 'src/trace.js');

const APP_URL = 'https://belteshazzar.github.io/TemenCAD/';
const REPO_URL = 'https://github.com/belteshazzar/TemenCAD-catalog';
const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const FAVICON = `<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230b6fcf'/%3E%3Cpath d='M8 11h16M16 11v12' stroke='%23fff' stroke-width='3.2' stroke-linecap='round' fill='none'/%3E%3C/svg%3E">`;
const LOGO = `<svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#0b6fcf"/><path d="M8 11h16M16 11v12" stroke="#fff" stroke-width="3.2" stroke-linecap="round" fill="none"/></svg>`;

const CHECK = process.argv.includes('--check');
const ROOT = resolve(new URL('..', import.meta.url).pathname);
const SHAPES = join(ROOT, 'shapes');
const DIST = join(ROOT, 'dist');
const LIMITS = { packageBytes: 2 * 1024 * 1024, scriptBytes: 200 * 1024, buildMs: 60_000 };
// Scripts in the catalogue must not reach the network or load code; the app shadows these too.
/** First and last commit dates of a package folder (needs full history; empty strings when unavailable). */
function gitDates(name) {
  const run = (args) => { try { return execSync(`git log ${args} --format=%aI -- shapes/${name}`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };
  const first = run('--diff-filter=A --reverse').split('\n')[0] ?? '';
  const last = run('-1');
  return { added: first || last || '', updated: last || '' };
}
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
  entries.push({ name, manifest, project, thumb, bytes, ...gitDates(name), parts: visible.map((m) => ({ name: m.name, triangles: m.indices.length / 3, volume_mm3: +m.volume.toFixed(1) })), ms });
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
    page: `p/${e.name}.html`,
    added: e.added,
    updated: e.updated,
    parts: e.parts,
  });
}
writeFileSync(join(DIST, 'index.json'), JSON.stringify(index, null, 1));
mkdirSync(join(DIST, 'p'), { recursive: true });
for (const p of index.packages) writeFileSync(join(DIST, 'p', `${p.name}.html`), detailPage(p, index));
for (const f of ['site.css', 'app.js']) copyFileSync(join(ROOT, 'site', f), join(DIST, f));
writeFileSync(join(DIST, 'index.html'), browsePage(index));
writeFileSync(join(DIST, '.nojekyll'), '');
console.log(`\nWrote dist/ with ${entries.length} packages.`);

/** Shared page frame. `root` is the relative path back to the site root ('' or '../'). */
function page({ title, description, body, root = '', head = '' }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${FAVICON}
<link rel="stylesheet" href="${root}site.css">
${head}
</head><body>
<header class="nav">
  <a class="brand" href="https://belteshazzar.github.io/TemenCAD-web/">${LOGO}<span>TemenCAD</span><span class="crumb">Catalogue</span></a>
  <nav>
    <a href="${root}">Browse</a>
    <a href="${REPO_URL}#sharing-a-shape" target="_blank" rel="noopener">Share a shape</a>
    <a href="${APP_URL}api.html" target="_blank" rel="noopener">API</a>
    <a href="${REPO_URL}" target="_blank" rel="noopener">GitHub</a>
  </nav>
  <a class="btn primary" href="${APP_URL}">Open the app</a>
</header>
<main>
${body}
</main>
<footer>Shapes are shared by their authors under the license shown on each one. Add them from <strong>+ → Add from catalogue…</strong> in the app or with <code>npx temencad add &lt;name&gt;</code>. <a href="${REPO_URL}">Source and contributions</a>.</footer>
</body></html>
`;
}

/** The browse page: controls are filled in by app.js from index.json. */
function browsePage(index) {
  return page({
    title: 'TemenCAD catalogue',
    description: `${index.packages.length} shared parametric shapes for TemenCAD: hinges, clips, knobs, boxes and more.`,
    head: '<script type="module" src="app.js"></script>',
    body: `<div class="head">
  <div><h1>Shared shapes</h1><p class="muted">Parametric parts shared by TemenCAD users, reviewed and rebuilt on every change. Add one to your project and it is copied in, pinned and yours to edit.</p></div>
  <a class="btn ghost" href="${REPO_URL}#sharing-a-shape" target="_blank" rel="noopener">Share yours</a>
</div>
<div class="controls">
  <input id="search" class="search" type="search" placeholder="Search shapes, tags, authors…" autocomplete="off" />
  <select id="sort" class="sort" aria-label="Sort">
    <option value="updated">Recently updated</option>
    <option value="added">Newest</option>
    <option value="title">Title A–Z</option>
    <option value="author">Author</option>
  </select>
  <span id="count" class="count"></span>
</div>
<div id="tags" class="tags"></div>
<div id="grid" class="grid"><p class="empty">Loading…</p></div>`,
  });
}

/** One static page per package, so shapes can be linked and found by search engines. */
function detailPage(p, index) {
  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const importLine = `import { ${p.exports.join(', ')} } from './catalog/${p.name}/${p.module}';`;
  const related = index.packages.filter((q) => q.name !== p.name && q.tags.some((t) => p.tags.includes(t))).slice(0, 3);
  return page({
    title: `${p.title} · TemenCAD catalogue`,
    description: p.description,
    root: '../',
    head: `<meta property="og:title" content="${esc(p.title)}"><meta property="og:description" content="${esc(p.description)}"><meta property="og:image" content="https://belteshazzar.github.io/TemenCAD-catalog/${p.thumb}"><meta name="twitter:card" content="summary_large_image">`,
    body: `<p><a href="../">← All shapes</a></p>
<div class="detail">
  <div>
    <img src="../${p.thumb}" alt="Render of ${esc(p.title)}" width="480" height="360" />
    <div class="tags">${p.tags.map((t) => `<a class="tag" href="../?tag=${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}</div>
  </div>
  <div>
    <h1>${esc(p.title)}</h1>
    <p>${esc(p.description)}</p>
    <div class="actions">
      <a class="btn primary" href="${APP_URL}#add=${encodeURIComponent(p.name)}">Add in TemenCAD</a>
      <a class="btn ghost" href="../${p.package}" download>Download .temen</a>
      <a class="btn ghost" href="${REPO_URL}/tree/main/${p.source}" target="_blank" rel="noopener">Source</a>
    </div>
    <dl class="meta">
      <dt>Author</dt><dd>${esc(p.author)}</dd>
      <dt>License</dt><dd>${esc(p.license)}</dd>
      <dt>Version</dt><dd>${esc(p.version)}</dd>
      <dt>Added</dt><dd>${fmtDate(p.added)}</dd>
      <dt>Updated</dt><dd>${fmtDate(p.updated)}</dd>
      <dt>Size</dt><dd>${(p.bytes / 1024).toFixed(0)} KB · ${p.files.length} file${p.files.length === 1 ? '' : 's'}</dd>
      <dt>Exports</dt><dd>${p.exports.map((e) => `<code>${esc(e)}</code>`).join(' ')}</dd>
    </dl>
    <h3>Use it</h3>
    <pre>${esc(importLine)}</pre>
    <p class="muted">Or from a terminal: <code>npx temencad add ${esc(p.name)}</code></p>
    <h3>Demo parts</h3>
    <ul class="parts">${p.parts.map((x) => `<li>${esc(x.name)} · ${x.triangles.toLocaleString()} triangles · ${x.volume_mm3.toLocaleString()} mm³</li>`).join('')}</ul>
  </div>
</div>
${related.length ? `<h2 style="margin-top:48px">Related</h2><div class="grid">${related.map((q) => `<a class="card" href="${esc(q.name)}.html"><img src="../${esc(q.thumb)}" alt="" loading="lazy" /><h3>${esc(q.title)}</h3><p>${esc(q.description)}</p><small>${esc(q.author)} · ${esc(q.license)}</small></a>`).join('')}</div>` : ''}`,
  });
}
