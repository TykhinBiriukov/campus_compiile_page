# Campus Compile design playbook

This document records the visual, interaction, and editorial decisions currently established on the Campus Compile website. It is the reference for future page changes and new event blocks. When the user explicitly requests a new direction, implement that direction and update this playbook afterward.

## Brand character

Campus Compile should feel focused, technical, open, and energetic. The page combines editorial typography with a terminal-inspired visual language. It should look intentional without appearing corporate or overproduced.

The interface should communicate three ideas:

- People from different backgrounds can meet and collaborate.
- Events center on building and demonstrating real work.
- Unconfirmed details are communicated honestly and calmly.

Avoid gradients, decorative shadows, excessive rounded cards, emoji, glossy startup imagery, or invented claims used only to make the organization look established.

## Design tokens

Use the existing colors consistently:

| Role | Value | Use |
| --- | --- | --- |
| Canvas | `#F8F6F0` | Main page background and light surfaces |
| Ink | `#111110` | Primary text, strong borders, dark event slide |
| Accent | `#E5322B` | Progress, active states, calls to action, small identifiers |
| Body text | `#33322D` | Long-form copy on light backgrounds |
| Muted text | `#6E6C64` | Metadata, labels, supporting copy |
| Quiet text | `#8C8C86` | Secondary notices and inactive elements |
| Soft text | `#B8B4A8` | Supporting copy on dark backgrounds |
| Light rule | `#DDD9CE` | Card divisions and section borders |
| Dark rule | `#3A362E` | Card divisions on dark backgrounds |
| White panel | `#FFFFFF` | Event panel and track cards |

Do not introduce a new color for a role already covered by this palette. Red should remain an accent rather than a large background field, except for compact calls to action and counters.

## Typography

- Use **Jost** for headings, body copy, statistics, and primary interface text.
- Use **JetBrains Mono** for navigation, metadata, overlines, dates, numbers, labels, status text, and button text.
- Body copy generally uses weight `300`, headings weight `400`, and prominent numbers or short identifiers weight `500`.
- Large headings use tight but readable line height, approximately `1.06–1.2`.
- Body copy uses a generous line height, approximately `1.65–1.7`.
- Mono labels are usually uppercase, `10–11px`, with letter spacing between `0.12em` and `0.2em`.
- Prefer sentence case for normal headings. Do not write whole paragraphs in uppercase or monospace.
- Use `text-wrap: pretty` and controlled text widths where they prevent awkward line endings.

## Layout and spacing

- The content column is capped at `1180px` and centered.
- Horizontal page padding follows `clamp(20px, 4vw, 64px)`.
- Major sections generally use vertical padding around `clamp(56px, 7vw, 100px)`.
- The sticky navigation is `62px` high.
- Use `clamp()`, CSS Grid, `auto-fit`, and `minmax()` for fluid layouts. Avoid fixed desktop widths that cause horizontal scrolling.
- Use whitespace to separate ideas. Prefer a small number of clearly aligned regions over many decorative containers.
- Cards in one row must share the same outer height and align their top and bottom borders. Use stretched grid rows when copy lengths differ.
- Use square corners and one-pixel borders. Existing status panels may use a strong border instead of a filled background.

The overview slide uses a balanced two-column composition. Each headline phrase begins on its own line, both columns have equal visual height, and the red rule beneath the headline spans roughly 40% of the headline column.

## Navigation and buttons

- Primary calls to action use a solid ink or red background, light text, JetBrains Mono, and generous horizontal padding.
- Secondary actions use a transparent background with a one-pixel border.
- Button labels may begin with the terminal prompt character `>`.
- Hover states invert or emphasize existing palette colors. Avoid movement that shifts surrounding layout.
- Use actual `<button>` elements for in-page state changes and `<a>` elements for real destinations.
- A button without a working destination must open an honest status panel rather than a dead link or misleading success message.

## Motion

- Initial content may fade or rise into view over approximately `0.7–0.8s`.
- Event slides, the header label, and the progress line transition together over `1.1s` using `cubic-bezier(.45, 0, .25, 1)`.
- The slider accepts one navigation step at a time and uses a `1200ms` wheel lock to prevent accidental multi-slide jumps.
- The slider must not trap normal page scrolling at its first or last slide.
- All four navigation squares are buttons and must remain usable without wheel input.
- Motion should feel smooth and deliberate. Do not add bouncing, elastic easing, parallax, or continuous decorative movement beyond the established blinking caret.
- When adding new motion, respect `prefers-reduced-motion` where practical.

## Event block anatomy

The current AAU Hackathon block is the reference event treatment. It has a compact header with the event name, date and location, current slide label, slide counter, and red progress line. Four navigation squares sit on the right.

New event blocks should reuse this four-slide structure unless the event genuinely needs different information:

### 1. Overview

- Lead with a short three-part statement.
- Pair it with two or three short paragraphs describing the format and audience.
- Put the solo-participant invitation in its own paragraph when team matching is available.
- Use no more than three prominent facts in the current layout.
- Current fact pattern: duration, number of challenges, and members per team.
- Do not display a price until pricing is confirmed and the user asks to make it prominent.

### 2. Tracks

- Use two equal-height cards labeled `TRACK 01` and `TRACK 02`.
- Do not add small tag pills unless they communicate confirmed, useful information.
- While partners and challenges remain unsigned, use “Track will be announced” and explain that details will be shared when the partner is announced.
- Keep any track-selection instruction vague until the selection process is confirmed.

### 3. Schedule

- Use the heading “The weekend at a glance.”
- Show three equal cards for Friday, Saturday, and Sunday.
- Describe the arc of the event rather than inventing exact times, rooms, or sessions.
- Display `PROVISIONAL PROGRAMME` and state that timings and session details will be announced closer to the event.
- Replace the provisional summary with a real timetable only when the schedule is confirmed.

### 4. What participants receive

- Use four equal-height cards with aligned borders.
- Keep descriptions concrete and short.
- The application call to action sits below the cards.
- Until registration is live, “Apply with your team” opens an “Applications open soon” panel with a Back button.
- Once a Luma registration URL is confirmed, replace the temporary panel behavior with a real link and update this playbook.

## Current copy rules

- Describe the event as open to students, developers, and technology enthusiasts from across the region.
- Mention that solo applications are welcome only when team matching will be offered.
- Avoid stating that participation is free because the eventual registration may use a small refundable ticket fee.
- Avoid naming sponsors or partners until approval and contractual details are confirmed.
- Prefer clear phrases such as “coming soon,” “to be announced,” and “provisional programme.”
- Avoid hype, vague superlatives, and claims such as membership counts or partner counts unless they are verified.

## Join section and external services

The Join section is for event email updates. It asks for a name and email address; it does not ask for a study program.

The current form has no backend or mailing-list connection. Clicking “Get event updates” must clearly say that subscriptions are not available yet and that the entered details were not saved. It must not claim that a confirmation email was sent.

When an email service is connected:

- Explain that subscribers receive occasional messages about hackathons, workshops, and events in Klagenfurt.
- Include appropriate consent language and an unsubscribe path.
- Prefer a provider-hosted form or a server-side endpoint.
- Never expose an API key in the page source.
- Update the success message only after a submission has been accepted by the service.

## Content states

Use these states consistently:

| State | Meaning | Presentation |
| --- | --- | --- |
| Confirmed | Approved details that can be relied upon | Present directly without qualification |
| Provisional | A real plan that may still change | Label it clearly and avoid exact promises |
| Coming soon | The action or information is not available yet | Show a short status panel and a Back action |
| Live | A tested external form or registration destination exists | Use a real link or submission flow |

Never use a success state to disguise unavailable functionality.

## Accessibility and responsive behavior

- Keep heading order logical and provide meaningful image alternative text.
- Preserve keyboard-accessible buttons and links with descriptive labels.
- Do not communicate active state through color alone; the event counter and label accompany the active square.
- Maintain readable contrast on light and dark surfaces.
- At narrow widths, allow grids to stack without clipping text or creating horizontal scrolling.
- Keep tap targets comfortably sized and avoid placing essential interactions behind hover behavior.

## Review checklist

Before considering a visual change complete, check:

- The page loads past the bundler thumbnail.
- Navigation links reach the intended sections.
- Each event slide fits inside the panel without clipped content.
- Event cards in the same row align at top and bottom.
- Slide dots, wheel navigation, labels, counter, and progress line stay synchronized.
- Provisional information is visibly qualified.
- Buttons either reach a real destination or show an accurate status panel.
- The Join form does not claim to save or send data while disconnected.
- Desktop and narrow/mobile layouts remain readable.
- The browser console contains no new JavaScript errors.
