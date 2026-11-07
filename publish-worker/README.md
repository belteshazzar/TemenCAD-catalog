# Publish worker

A Cloudflare Worker (free tier) that turns a package submitted by the app's **Share…** dialog into a pull request on the catalogue repository. No user accounts: every submission is a pull request that a maintainer reviews, and CI validates it like any other.

## Flow

1. The app POSTs `multipart/form-data` with `manifest` (JSON), `package` (the `.temen` zip) and optionally `turnstile` (a Turnstile token).
2. The worker checks the origin, size limits, the manifest and the Turnstile token, then with a bot token:
   - creates a branch `share/<name>-<short id>` on the bot's fork from the catalogue's `main`,
   - commits `shapes/<name>/…` (every file in the package plus `manifest.json`, and the app's render as `preview.png`),
   - opens a pull request against the catalogue with the description from the manifest.
3. It answers `{ "pullRequest": "https://github.com/.../pull/123" }`, which the app shows. The pull request description embeds the preview image from the branch.

Rate limiting: 5 submissions per IP per hour via the Cache API (good enough for a hobby catalogue; move to KV for stricter control).

## Deploy

```sh
cd publish-worker
npm install -g wrangler          # once
wrangler login
wrangler secret put GITHUB_TOKEN     # bot account *classic* token with the public_repo scope
wrangler secret put TURNSTILE_SECRET # optional; leave unset to skip the captcha
wrangler deploy
```

Then set `PUBLISH_URL` in the app's `src/config.js` to the worker URL (and `TURNSTILE_SITE_KEY` if used) and redeploy the app.

The bot account needs a fork of the catalogue (`FORK_REPO`). Pull requests from the fork keep the bot token away from the main repository: it can only ever push to its own fork.

The token must be a **classic** personal access token (Settings → Developer settings → Personal access tokens → Tokens (classic)) with only the `public_repo` scope. Fine-grained tokens can be scoped only to repositories the bot owns, so they can push to the fork but GitHub refuses the final "create pull request" call on the catalogue with a 403.
