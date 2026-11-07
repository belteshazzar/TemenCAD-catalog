# TemenCAD catalogue

Shared, parametric shapes for [TemenCAD](https://github.com/belteshazzar/TemenCAD). Every package here is validated and built on each change, rendered to a thumbnail, and published as a static site at **https://belteshazzar.github.io/TemenCAD-catalog/**. The app's **+ → Add from catalogue…** menu and `npx temencad add <name>` read from that site.

## Using a package

In the app, open the **+** menu above the editor, choose **Add from catalogue…**, pick a shape and press **Add to project**. The package's files are copied into your project under `catalog/<name>/` and an import line is added to `main.js`:

```js
import { hinge } from './catalog/parametric-hinge/hinge.js';
const { left, right } = hinge(40, { clearance: 0.3 });
return { left, right };
```

From a terminal: `npx temencad add parametric-hinge` (into `./main.js`) or `--into project.temen`.

Copies are plain files in your project, so they work offline, stay pinned to the version you added, and you can edit them. Each copied script starts with a comment naming the package, version, author and license.

## Package layout

```
shapes/<name>/
  manifest.json   name, version, title, description, author, license, tags, module, exports
  main.js         a demo of the shape (what the thumbnail shows); may use a top-level return
  <module>.js     exports the reusable functions, e.g. export function hinge(length, opts) { ... }
  ...             other scripts, fonts (.ttf/.otf) or meshes (.stl) the module needs
```

`manifest.json`:

```json
{
  "name": "parametric-hinge",
  "version": "1.0.0",
  "title": "Parametric hinge",
  "description": "Print-in-place hinge with a captive pin.",
  "author": "Your name",
  "license": "CC0-1.0",
  "tags": ["hinge", "mechanism"],
  "module": "hinge.js",
  "exports": ["hinge"],
  "apiVersion": 1
}
```

- `name` is the folder name: lowercase letters, digits and hyphens, unique in the catalogue.
- `license` is one of `CC0-1.0` (default, no attribution needed), `MIT` or `CC-BY-4.0`.
- `module` is the script people import; `exports` lists its exported names and is checked against the file.
- Scripts may not use `fetch`, `XMLHttpRequest`, `WebSocket`, `importScripts`, `eval` or dynamic `import()`. Packages are limited to 2 MB and must build in under a minute.

## Sharing a shape

**From the app**: menu → **Share…** fills in the manifest, renders a preview and opens a pull request for you (when the publish endpoint is deployed, see below). Without it, the app downloads `<name>.temen` and `manifest.json` for you to add by hand.

**By hand**: fork this repository, add a folder under `shapes/`, run `npm install && npm run check`, and open a pull request. The *Validate packages* workflow builds every package; a maintainer reviews and merges, and the site redeploys automatically.

## Working on the catalogue

```sh
npm install          # installs the TemenCAD engine from GitHub
npm run check        # validate and build every package (what pull requests run)
npm run build        # also writes dist/: index.json, packages/*.temen, thumbs/*.png, index.html
TEMENCAD_DIR=../TemenCAD npm run build   # build against a local checkout of the app
```

Thumbnails are rendered by `scripts/render.mjs`, a small software rasteriser, so CI needs no browser.

## Publish endpoint

`publish-worker/` holds a Cloudflare Worker that accepts a package from the app's Share dialog and opens a pull request here with a bot token. See its README for deployment; until it is deployed, `PUBLISH_URL` in the app stays empty and sharing falls back to a download.
