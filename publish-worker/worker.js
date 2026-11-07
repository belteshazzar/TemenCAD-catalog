/**
 * TemenCAD publish endpoint: package submission -> pull request on the catalogue repository.
 * See README.md. Runs on Cloudflare Workers; no dependencies.
 */
const JSON_HEADERS = { 'content-type': 'application/json' };
const LICENSES = ['CC0-1.0', 'MIT', 'CC-BY-4.0'];
const NAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

export default {
  async fetch(request, env) {
    const cors = {
      'access-control-allow-origin': env.ALLOWED_ORIGIN,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json({ error: 'POST a package' }, 405, cors);
    try {
      const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
      if (!(await allow(ip))) return json({ error: 'Too many submissions from this address; try again in an hour.' }, 429, cors);

      const form = await request.formData();
      const manifest = JSON.parse(form.get('manifest') ?? 'null');
      const pkg = form.get('package');
      const errors = validate(manifest);
      if (!(pkg instanceof File)) errors.push('package file missing');
      else if (pkg.size > +env.MAX_BYTES) errors.push(`package is larger than ${Math.round(env.MAX_BYTES / 1048576)} MB`);
      if (errors.length) return json({ error: errors.join('; ') }, 400, cors);
      if (env.TURNSTILE_SECRET) {
        const ok = await verifyTurnstile(env.TURNSTILE_SECRET, form.get('turnstile'), ip);
        if (!ok) return json({ error: 'Captcha check failed; please try again.' }, 400, cors);
      }

      const files = await unzip(await pkg.arrayBuffer());
      if (!files.has('main.js')) return json({ error: 'package has no main.js' }, 400, cors);
      files.set('manifest.json', new TextEncoder().encode(JSON.stringify(manifest, null, 2) + '\n'));
      // The app's render goes on the branch as preview.png so the pull request can show it; CI renders the catalogue thumbnail itself.
      if (files.has('thumb.png')) { files.set('preview.png', files.get('thumb.png')); files.delete('thumb.png'); }

      const url = await openPullRequest(env, manifest, files);
      return json({ pullRequest: url }, 200, cors);
    } catch (err) {
      return json({ error: `Publishing failed: ${err.message}` }, 500, cors);
    }
  },
};

const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });

function validate(m) {
  const e = [];
  if (!m || typeof m !== 'object') return ['manifest missing'];
  if (!NAME_RE.test(m.name ?? '')) e.push('name must be lowercase letters, digits and hyphens');
  if (!/^\d+\.\d+\.\d+$/.test(m.version ?? '')) e.push('version must be semver');
  if (!m.title || m.title.length < 3 || m.title.length > 80) e.push('title must be 3–80 characters');
  if (!m.description || m.description.length < 10 || m.description.length > 500) e.push('description must be 10–500 characters');
  if (!m.author || m.author.length > 80) e.push('author is required');
  if (!LICENSES.includes(m.license)) e.push('license not allowed');
  if (!Array.isArray(m.tags) || m.tags.length > 10 || m.tags.some((t) => !/^[a-z0-9-]{1,24}$/.test(t))) e.push('bad tags');
  if (!/\.(js|mjs)$/.test(m.module ?? '') || m.module === 'main.js') e.push('module must be a .js file other than main.js');
  if (!Array.isArray(m.exports) || !m.exports.length) e.push('exports missing');
  if (m.apiVersion !== 1) e.push('apiVersion must be 1');
  return e;
}

/** Simple per-IP limiter on the Cache API: 5 submissions per hour. */
async function allow(ip) {
  const cache = caches.default;
  const key = new Request(`https://limiter.local/${encodeURIComponent(ip)}`);
  const hit = await cache.match(key);
  const count = hit ? +(await hit.text()) : 0;
  if (count >= 5) return false;
  await cache.put(key, new Response(String(count + 1), { headers: { 'cache-control': 'max-age=3600' } }));
  return true;
}

async function verifyTurnstile(secret, token, ip) {
  if (!token) return false;
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
  });
  return (await res.json()).success === true;
}

/** Minimal zip reader (stored and deflated entries) using DecompressionStream. */
async function unzip(buffer) {
  const view = new DataView(buffer), bytes = new Uint8Array(buffer), files = new Map();
  let eocd = buffer.byteLength - 22;
  while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip file');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('bad zip directory');
    const method = view.getUint16(p + 10, true), csize = view.getUint32(p + 20, true);
    const nlen = view.getUint16(p + 28, true), xlen = view.getUint16(p + 30, true), clen = view.getUint16(p + 32, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nlen));
    const lh = view.getUint32(p + 42, true);
    const dataStart = lh + 30 + view.getUint16(lh + 26, true) + view.getUint16(lh + 28, true);
    const data = bytes.subarray(dataStart, dataStart + csize);
    if (!name.endsWith('/')) {
      if (method === 0) files.set(name, data);
      else if (method === 8) files.set(name, new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()));
      else throw new Error(`unsupported zip method ${method} for ${name}`);
    }
    p += 46 + nlen + xlen + clen;
  }
  return files;
}

/** Branch on the bot's fork, commit the files, open the pull request. */
async function openPullRequest(env, manifest, files) {
  const gh = async (path, init = {}) => {
    const res = await fetch(`https://api.github.com${path}`, {
      ...init,
      headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'temencad-publish', 'content-type': 'application/json', ...(init.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`GitHub ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.json();
  };
  const base = await gh(`/repos/${env.CATALOG_REPO}/git/ref/heads/main`);
  const sha = base.object.sha;
  const branch = `share/${manifest.name}-${crypto.randomUUID().slice(0, 8)}`;
  await gh(`/repos/${env.FORK_REPO}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }) });
  const toBase64 = (u8) => btoa(Array.from(u8, (b) => String.fromCharCode(b)).join(''));
  for (const [name, data] of files) {
    await gh(`/repos/${env.FORK_REPO}/contents/shapes/${manifest.name}/${name}`, {
      method: 'PUT',
      body: JSON.stringify({ message: `Add ${manifest.name}: ${name}`, content: toBase64(data), branch }),
    });
  }
  const forkOwner = env.FORK_REPO.split('/')[0];
  try {
    const preview = files.has('preview.png') ? `![${manifest.title}](https://raw.githubusercontent.com/${env.FORK_REPO}/${branch}/shapes/${manifest.name}/preview.png)\n\n` : '';
    const pr = await gh(`/repos/${env.CATALOG_REPO}/pulls`, {
      method: 'POST',
      body: JSON.stringify({
        title: `Share: ${manifest.title} (${manifest.name}@${manifest.version})`,
        head: `${forkOwner}:${branch}`, base: 'main',
        body: `${preview}${manifest.description}\n\n| | |\n|---|---|\n| Author | ${manifest.author} |\n| License | ${manifest.license} |\n| Tags | ${manifest.tags.join(', ') || '—'} |\n| Module | \`${manifest.module}\` exporting \`${manifest.exports.join('`, `')}\` |\n\nSubmitted from the TemenCAD app. The preview is the author's render; the *Validate packages* check rebuilds the package and the catalogue renders its own thumbnail on merge.`,
        maintainer_can_modify: true,
      }),
    });
    return pr.html_url;
  } catch (err) {
    // Don't leave an orphan branch on the fork when the pull request could not be opened.
    await fetch(`https://api.github.com/repos/${env.FORK_REPO}/git/refs/heads/${branch}`, { method: 'DELETE', headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, 'user-agent': 'temencad-publish' } }).catch(() => {});
    if (/403/.test(err.message)) throw new Error(`${err.message}. The bot token must be a classic token with the public_repo scope: fine-grained tokens cannot open pull requests on repositories the bot does not own.`);
    throw err;
  }
}
