# Campus Compile website

This repository contains the public website for Campus Compile, an AI and software community in the Klagenfurt area.

Live site: [campuscompile.eu](https://campuscompile.eu)

## Repository structure

```text
.
├── AGENTS.md                  # Mandatory repository guidance for coding agents
├── README.md                  # Project overview, preview, and deployment notes
├── docs/
│   └── design-playbook.md     # Visual, interaction, and copy reference
├── functions/api/subscribe.js # Cloudflare Pages subscription endpoint
├── index.html                 # Production website and self-contained bundle
├── test/subscribe.test.js     # Subscription endpoint contract tests
└── wrangler.jsonc             # Pages runtime bindings and non-secret config
```

Read [AGENTS.md](AGENTS.md) and [the design playbook](docs/design-playbook.md) before changing the page.

## Local preview

No package installation or build command is required. Serve the repository root through a local HTTP server:

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:8765
```

Do not rely only on opening `index.html` through a `file://` URL. Test through HTTP so browser behavior is closer to the deployed site.

The static local preview does not execute the Cloudflare Pages Function. Test the complete subscription flow on a Cloudflare preview or production deployment.

## Deployment

The production site is deployed by [the GitHub Actions workflow](.github/workflows/deploy.yaml). A push to `main`, or a manual workflow run, invokes `cloudflare/wrangler-action@v4` with Wrangler 4 and deploys the repository root to the `campuscompile` Pages project. The action installs Wrangler inside the GitHub runner; no local Wrangler or pnpm installation is required.

`wrangler.jsonc` is the source of truth for Cloudflare Pages runtime configuration. Wrangler reads it during the GitHub Actions deployment to provide the public environment values and the `SUBSCRIBE_RATE_LIMITER` binding used by the server function. Keep the encrypted `BREVO_API_KEY` and `TURNSTILE_SECRET_KEY` values in the Cloudflare Pages dashboard, and keep `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in GitHub Actions secrets.

## Newsletter integration

The Join form posts JSON to the same-origin Cloudflare Pages Function at `/api/subscribe`. The Function validates and normalizes the request, verifies Turnstile, applies a Cloudflare rate limit, and creates or updates the Brevo contact with `updateEnabled: true`.

After Brevo accepts the contact, the page replaces the form with its in-page success panel. The Function does not send a welcome or confirmation email itself; configure that message as a Brevo automation if one is required.

Before deployment, replace the non-secret placeholders in `wrangler.jsonc` with a numeric Brevo list ID, the exact public origin, and the public Turnstile site key. Configure `BREVO_API_KEY` and `TURNSTILE_SECRET_KEY` as encrypted Cloudflare Pages secrets. Production and preview use separate origins, Brevo lists, Turnstile widgets, secrets, and rate-limit namespaces; configure both environments before enabling preview subscriptions. A placeholder or missing binding makes the endpoint fail closed with a user-safe “temporarily unavailable” response.

Run the dependency-free endpoint contract tests before deployment:

```powershell
node --test --test-isolation=none
```

The Brevo contact attribute `FNAME` must exist as a text attribute in the Brevo account. Turnstile must allow the hostname configured by `ALLOWED_ORIGIN` and use the `newsletter_subscribe` action.

The repository does not currently contain a full privacy policy. The form therefore includes a concise privacy notice without presenting it as a substitute for that policy; add a policy link when a policy page is published.

### Before public launch

- Replace every placeholder in `wrangler.jsonc`, configure both encrypted secrets, and confirm that production and preview use the intended origins, Brevo lists, Turnstile widgets, and rate-limit namespaces.
- Use a disposable address to verify a new contact and a repeated subscription in Brevo. Confirm that the second request updates the existing contact rather than creating a duplicate and that the name and email are normalized.
- Verify rejection of missing consent, an invalid email, an oversized request, a foreign origin, and unsupported request methods.
- Exercise the safe failure responses for missing configuration, Turnstile failure, rate limiting, and Brevo or network unavailability.
- Check the form at desktop and mobile widths, including loading, field-error, general-error, success, retry, Back, keyboard focus, and reduced-motion behavior.
- Inspect Cloudflare logs using a returned request ID and confirm that names, email addresses, Turnstile tokens, and API keys are never logged.
