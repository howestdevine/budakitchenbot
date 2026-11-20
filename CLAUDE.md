# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Cloudflare Worker that scrapes today's lunch menu from https://budakitchen.be/ and serves it as JSON, as a Slack slash-command response, and as an RSS feed. Menu items are in Dutch. Workers AI translates them to English and generates a food photo, which is uploaded to Cloudinary.

## Commands

- `npx wrangler dev`: run locally. Secrets come from `.dev.vars` (gitignored): `CLOUDFLARE_ACCOUNT_ID`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. The `AI` binding calls the real Workers AI even in dev.
- `npx wrangler deploy`: deploy (`wrangler` is not a devDependency, so use `npx`).
- `npx wrangler secret put <NAME>`: set the Cloudinary/account secrets in production.
- `npm run format`: Prettier (single quotes, no semicolons, trailing commas, 80 cols).
- There is no test suite or linter. `npm test` is the template placeholder and exits 1.

## Architecture

- `index.js`: `itty-router` routes plus the Worker's `fetch` and `scheduled` exports.
  - `GET /`: raw stored data as JSON.
  - `POST /slack`: Slack `in_channel` response with the Dutch menu.
  - `GET /rss`: RSS feed. Each item uses the Dutch title, the English description (`enmenu[i]`) and the generated `image` (falls back to a static Buda image).
- Daily caching in KV (binding `budakitchen`), keyed by `YYYYMMDD` (`getDateKey()`) with a 20h TTL. The stored value has the shape `{ menu: string[], enmenu?: string[], image?: string }`.
- `getData(env)`: on a KV miss, fetches the site and extracts `#short-menu-sec .short-menu p` text with `HTMLRewriter` (`ElementHandler`). It then always calls `getOrCreateImage(env)`. If you change the site selector, check against the live HTML.
- `getOrCreateImage(env)`: if the stored entry has no `image`, it translates every item (`services/translation.js`, `@cf/meta/m2m100-1.2b`, nl to en), picks one at random, and generates an image (`services/image.js`). It writes `enmenu` and `image` back to KV only if the image succeeds. This runs in the request path, so the first request of the day can be slow.
- `services/image.js`: FLUX.2 [klein] 9B via `env.AI.run('@cf/black-forest-labs/flux-2-klein-9b', { multipart })` (form data in, base64 `image` out, kept at or under 1 MP to stay in the free tier), then a signed Cloudinary upload (manual SHA-1 signature over sorted params). It always uses `public_id: menuvandedag` with `overwrite: true`, so the image URL is the same every day.
- Cron `3 6 * * *` (06:03 UTC) runs `getData` to warm the cache before lunch.
- On a scrape failure or an empty scrape (no menu found on the page), `getData` returns `{ menu: [...] }` with placeholder joke strings, so every route can rely on `data.menu` being an array.
