/** Browse page: search, tag filter and sort over index.json, all in the browser. */
const grid = document.getElementById('grid');
const search = document.getElementById('search');
const sort = document.getElementById('sort');
const tagsEl = document.getElementById('tags');
const count = document.getElementById('count');
const params = new URLSearchParams(location.search);
let packages = [], tag = params.get('tag'), query = params.get('q') ?? '';
search.value = query;
sort.value = params.get('sort') ?? 'updated';

const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const ago = (iso) => { if (!iso) return ''; const d = (Date.now() - new Date(iso)) / 86400000; return d < 1 ? 'today' : d < 2 ? 'yesterday' : d < 30 ? `${Math.floor(d)} days ago` : d < 365 ? `${Math.floor(d / 30)} months ago` : `${Math.floor(d / 365)} years ago`; };

function sync() {
  const p = new URLSearchParams();
  if (query) p.set('q', query); if (tag) p.set('tag', tag); if (sort.value !== 'updated') p.set('sort', sort.value);
  history.replaceState(null, '', p.toString() ? `?${p}` : location.pathname);
}
function render() {
  const q = query.trim().toLowerCase();
  let list = packages.filter((p) => (!tag || p.tags.includes(tag)) && (!q || `${p.title} ${p.description} ${p.tags.join(' ')} ${p.author} ${p.name}`.toLowerCase().includes(q)));
  const by = { updated: (a, b) => (b.updated ?? '').localeCompare(a.updated ?? ''), added: (a, b) => (b.added ?? '').localeCompare(a.added ?? ''), title: (a, b) => a.title.localeCompare(b.title), author: (a, b) => a.author.localeCompare(b.author) || a.title.localeCompare(b.title) };
  list = list.slice().sort(by[sort.value] ?? by.updated);
  count.textContent = `${list.length} of ${packages.length} shape${packages.length === 1 ? '' : 's'}`;
  grid.innerHTML = list.length ? list.map((p) => `<a class="card" href="p/${esc(p.name)}.html">
    <img src="${esc(p.thumb)}" alt="" loading="lazy" />
    <h3>${esc(p.title)}</h3>
    <p>${esc(p.description)}</p>
    <small>${esc(p.author)} · ${esc(p.license)}${p.updated ? ` · updated ${ago(p.updated)}` : ''}</small>
  </a>`).join('') : '<p class="empty">No shapes match. Try another word or clear the tag.</p>';
  for (const b of tagsEl.querySelectorAll('.tag')) b.classList.toggle('on', b.dataset.tag === tag);
  sync();
}
function renderTags() {
  const counts = new Map();
  for (const p of packages) for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  tagsEl.innerHTML = [...counts].sort((a, b) => b[1] - a[1]).map(([t, n]) => `<button type="button" class="tag" data-tag="${esc(t)}">${esc(t)} <span class="muted">${n}</span></button>`).join('');
  for (const b of tagsEl.querySelectorAll('.tag')) b.addEventListener('click', () => { tag = tag === b.dataset.tag ? null : b.dataset.tag; render(); });
}
search.addEventListener('input', () => { query = search.value; render(); });
sort.addEventListener('change', render);
fetch('index.json').then((r) => r.json()).then((index) => { packages = index.packages; renderTags(); render(); })
  .catch(() => { grid.innerHTML = '<p class="empty">The catalogue index could not be loaded.</p>'; });
