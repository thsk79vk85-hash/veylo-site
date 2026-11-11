# Veylo feed-first landing page — preview and release gates

**Status:** Design concept only. Branch `codex/veylo-flow-preview-20261111`. Do not deploy the page to production as an account feature claim without completing the gates below.

## What is built and tested for the website
- Responsive, immersive, feed-first landing concept with ordinary document scrolling. The header may remain sticky, but content does not pin, snap, or hold the scroll.
- Sample activities: playing cards, coffee, study session, lunch. The visitor can edit a mock post and preview replies. Nothing is sent to Supabase or published.
- Examples for optional friend campus presence, messaging, and campus privacy controls. Sample status toggle is local only.
- Existing Veylo beta and waitlist links go to the live website. **The concept site has no new signup backend.**
- Restrained scroll-position-linked transforms, passive listener and requestAnimationFrame; reduced-motion and keyboard controls are supported.
- Robots noindex and visible concept disclosure. Illustrative UI and stock photographs are examples, not evidence of users, usage or launched availability.

## Product truth verified 11 November 2026
Read-only production schema inspection:
- `public.feed_posts.expires_at` defaults to `now() + interval '12 hours'`, **not 30 minutes**.
- The authenticated SELECT RLS policy checks expiry, blocked-user relationships and whether the author is eligible to appear in Explore; it does **not** enforce matching universities.
- In-app feed code includes university filters, but a client filter is not a security boundary.
- The current feed service creates posts with `body`, `category` and `campus`; there is no user-chosen expiry on that insert.
- Feed posting/comments already exist. The model of a 30-minute invite visible to all eligible students at one university is a **proposal**.

## Gate 1 — Product behaviour
Decide whether to add a short-lived post type (recommended: **Campus invite**) distinct from ordinary feed posts. Avoid silently shortening existing user posts. Suggested optional durations: 15, 30 or 60 minutes; start with a fixed 30-minute duration if simplicity is preferred. Clarify what "everyone at my uni" means if the student belongs to multiple campuses or programs.

## Gate 2 — University-scoped authorization
The current authenticated-feed policy cannot substantiate uni-only visibility. Implement audience enforcement server-side, not in a React Native filter. Derive the viewer and author's authoritative university identity from verified profile records; define same-campus vs same-university and multi-campus rules explicitly. Enforce consistency for post detail, feed lists, comments, reaction counts, RPCs, notifications, and realtime subscriptions. Preserve existing blocks, moderation exclusions and author ownership; never leak an invite through notification payloads or guessed IDs.

## Gate 3 — Time-to-live and deletion
Use server time for creation/expiry, validate allowed duration server-side, ensure posts disappear at expiration on every read path, disable replying to expired invites, and provide countdown UI grounded in `expires_at`. Document whether expired records are retained for moderation or physically deleted; use a retention job if necessary and test edge cases at the boundary.

## Gate 4 — Safety, privacy and abuse
Rate-limit creation, handle reports and blocks, prevent harassment/spam, avoid exposing precise coordinates by default, consider private vs public meeting spots, and make it clear a post is visible to a wider uni audience than friends. Consider group chats/RSVP only if actually implemented; the initial design can use existing comments for replies.

## Gate 5 — User experience and measurement
Use the real current Veylo app UI rather than generic conceptual mockups for production imagery. Test university selection, feed composer, keyboard/screen reader, expiry, tapping posts, group messages and beta flows on iOS and Android. Measure landing hero-to-beta clicks, hero-to-waitlist clicks, CTA conversion and mobile bounce. Do not claim numbers or social proof before verified.

## Gate 6 — Approval and safe release
- Review desktop/mobile Doop frames and Vercel preview manually.
- Run `npm test` on the preview branch; confirm the preview's source and tests match.
- Confirm the live beta/waitlist endpoints and privacy/terms URLs.
- When approved, port styling and copy to the release branch, ensure unsupported future features are removed or clearly labeled, then inspect and explicitly promote a production deployment. **No automatic merge/promotion of this branch.**

## Useful links
- Doop canvas: https://doop.design/c/O_KV0vFDGo
- Live website: https://joinveylo.com
- Preview branch: https://github.com/thsk79vk85-hash/veylo-site/tree/codex/veylo-flow-preview-20261111
