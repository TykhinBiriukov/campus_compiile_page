# Campus Compile repository instructions

These instructions apply to the entire repository. The user's current request takes precedence when it explicitly changes an existing rule or design decision.

## Read before editing

- Read `docs/design-playbook.md` before changing layout, styling, animation, interface copy, forms, or event content.
- Read `README.md` before changing local preview, deployment, or repository structure.
- Inspect the current working tree before editing and preserve unrelated user changes.

## Page architecture

- `index.html` is the production entry point and the deployed website.
- The page is a self-contained generated bundle. It contains JSON-encoded HTML inside `script[type="__bundler/template"]`, embedded resources, the unpacking runtime, and a final `patchGeneratedSite` script.
- Never place the current document inside another complete HTML wrapper. A nested wrapper previously left the site stuck on its loading screen because its `DOMContentLoaded` handler could no longer run.
- Preserve the bundler script types, embedded-resource identifiers, manifest data, script order, and `patchGeneratedSite` behavior unless the task specifically requires an architectural migration.
- When editing the encoded template, parse its JSON string, change the smallest relevant fragment, serialize it back as valid JSON, and verify that `</script>` cannot terminate the containing script accidentally.
- Keep the site dependency-free and static unless the user explicitly requests a backend, build system, or new service.
- Never put API keys, service tokens, or other secrets in `index.html` or browser-side JavaScript.

## Design and content rules

- Preserve the established Jost and JetBrains Mono typography, warm neutral palette, red accent, thin square borders, restrained motion, and fluid spacing described in the design playbook.
- Reuse existing visual patterns before inventing new ones. Cards in the same row must align and have equal outer heights.
- Keep the event slider as a fixed, four-slide experience unless the user explicitly changes its information architecture. Wheel input and navigation dots move exactly one slide at a time.
- Do not invent sponsors, partners, schedules, prices, application dates, or confirmed event details. By default mark unsettled information as provisional, “to be announced,” or “coming soon”. Ask user to input those fields, if he already has the required information. 
- Do not state that information was sent, saved, subscribed, or confirmed unless a working integration proves it. The current join form and application button only show temporary status panels.
- Use `info@campuscompile.eu` for public contact email.
- Write for students, developers, and technology enthusiasts across the region. Do not describe Campus Compile events as student-only unless the user explicitly narrows eligibility.

## Validation

After changing `index.html`:

1. Serve the repository root through HTTP, for example with `python -m http.server 8765 --bind 127.0.0.1`.
2. Load the page in a browser; opening the file directly is not sufficient verification.
3. Check the main navigation and the About, Events, Join, and footer sections.
4. Open every event slide through its navigation dot and test one-step wheel navigation, the synchronized label, slide number, and progress line.
5. Test the application and event-update status panels, including their Back buttons.
6. Check representative desktop and narrow/mobile widths for clipping, overflow, broken grids, and unreadable text.
7. Confirm that visible content fits each event slide and inspect the browser console for JavaScript errors.

Do not deploy, publish, or change Cloudflare settings unless the user asks for it.

## Handoff

- Report what changed, how it was verified, and any remaining provisional or disconnected behavior.
- Update `docs/design-playbook.md` when the user establishes a durable new visual or editorial rule.
- Update `README.md` when setup, architecture, deployment, or service integrations change.
