# GPS Kids Speak

Free public-speaking coaching for kids ages 5 to 17. An AI Coach, pitch tips, a Rebuttal Round ("Answer back!"), and a parent note behind a grown-up check.

This repository is the public, open-source home of the app. Parents and schools can run their own copy. The community can suggest features and fixes.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/369Apps/gpskids-starter)

Maintainer: Bobby, for GPS Kids / Tech GPS.

## What a child sees

- A daily speaking prompt and a kind tip
- A Rebuttal Round where the coach offers one friendly challenge
- A soft ring that fills while they talk. There is no countdown clock
- No ask for a name, email, or photo

A grown-up can leave their first name, email, and the child's age band, and only after answering a short math question. See [PRIVACY.md](PRIVACY.md).

## Make it yours

Edit `public/brand.js`. The name, product, coach label, contact email, address, and club link all start empty or as GPS Kids. Leave contact fields blank and the app hides them.

The kid-facing pages say "AI Coach". They do not name the company that provides optional live voice. That choice lives in server config.

## Run it on Cloudflare

You need a free Cloudflare account and Node.js 22.

1. Create four D1 databases and one R2 bucket:

   ```bash
   npx wrangler d1 create gpskids-ratelimit
   npx wrangler d1 create gpskids-pitch
   npx wrangler d1 create gpskids-events
   npx wrangler d1 create gpskids-usage
   npx wrangler r2 bucket create gpskids-pitch-audio
   ```

2. Paste each database id into `wrangler.toml` in place of `00000000-0000-4000-8000-00000000000X`. The file ships with placeholders on purpose.

3. Apply the table schemas:

   ```bash
   npx wrangler d1 migrations apply gpskids-ratelimit --local
   npx wrangler d1 migrations apply gpskids-events --local
   npx wrangler d1 migrations apply gpskids-usage --local
   npx wrangler d1 migrations apply gpskids-pitch --local
   ```

   For the live Cloudflare databases, run the same commands without `--local`.

4. Copy secrets:

   ```bash
   cp .dev.vars.example .dev.vars
   ```

   Fill in only what you use. Recorded tips work with Cloudflare Workers AI and need no extra key. Live talking needs `AI_API_KEY`, `AI_HTTP_URL`, and `AI_REALTIME_URL` for an OpenAI-compatible realtime provider. Kids never see those values. The browser talks only to this site, which opens the provider socket for them.

5. Deploy:

   ```bash
   npx wrangler pages deploy public --project-name gpskids-speak
   ```

   Or use the Deploy to Cloudflare button above, then replace the placeholder database ids before you rely on it.

Give the Pages project a name other than `gpskids-speak` if that name is already taken. The hostnames `gpskids.app` and `gpskids-speak.pages.dev` are treated as the official site and stay locked unless you set the feature flags. Any other hostname, including a school domain, is an open copy (`EV_ENV = "selfhost"` in `wrangler.toml`).

Set a long random `IP_SALT` in `.dev.vars` or with `npx wrangler pages secret put IP_SALT`. Do not commit `.dev.vars`.

## Local preview

```bash
npm test
npx wrangler pages dev public
```

## Project layout

- `public/` is the website kids and parents open
- `functions/api/` is the Cloudflare Pages API
- `lib/` is shared server code, including the voice provider
- `migrations*` are empty-start database schemas
- `tests/` are the safety and content checks `npm test` runs

## Child safety

This app is built so a normal deploy collects no child name, email, or photo. Do not add those fields back. Parent contact stays behind the grown-up check. Details are in [PRIVACY.md](PRIVACY.md) and on the in-app privacy page.

## Community

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [SECURITY.md](SECURITY.md) for private reports
- Issues: feature idea, bug, or lesson idea
- License: MIT, copyright GPS Kids / Tech GPS
