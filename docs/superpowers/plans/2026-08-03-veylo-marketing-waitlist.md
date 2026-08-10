# Veylo Marketing and Waitlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legal-only home page with a responsive Veylo marketing page that accurately demonstrates the app and collects beta-tester emails through a separate waitlist backend.

**Architecture:** Keep the existing static site and legal pages. Build the landing page with semantic HTML, CSS illustrations, and a small browser script; add a Vercel serverless function that writes only normalized emails to a completely separate Supabase project through server-only credentials.

**Tech Stack:** Static HTML/CSS/JavaScript, Vercel Functions, Supabase REST, Node.js built-in test runner.

## Global Constraints

- Keep the headline exactly: “Veylo turns ‘where are you?’ into actually meeting up.”
- Represent only current Veylo concepts: Campus, Feed, Friends, Chats, friends-only status visibility, and invisible mode.
- Never imply exact location, live distance, map tracking, or minute-away proximity.
- Use the app palette: #F4F8F7, #FFFFFF, #17211F, #65736F, #D9E4E1, #146C63, #DDF3EE, #D8643C.
- Store only email and created_at in a separate waitlist database.
- Do not connect to or reuse the Veylo app Supabase project or credentials.

---

### Task 1: Marketing page structure and visual story

**Files:** `index.html`, `styles.css`, `tests/site.test.mjs`

- [x] Write failing structural tests for the approved headline, real app terminology, privacy claim, and accessible form.
- [x] Confirm the tests fail against the old legal-only home page.
- [x] Implement the responsive hero, Campus, Feed, Friends/Chats, privacy, and waitlist sections.
- [x] Confirm the structural tests pass.

### Task 2: Waitlist validation and browser submission

**Files:** `lib/waitlist.mjs`, `waitlist.js`, `tests/waitlist.test.mjs`

- [x] Write failing validation tests for normalization, invalid email, and the honeypot.
- [x] Confirm the module-not-found failure before implementation.
- [x] Implement the validation helpers and accessible form state handling.
- [x] Confirm all tests pass.

### Task 3: Separate serverless waitlist backend

**Files:** `api/waitlist.js`, `supabase/waitlist.sql`, `.env.example`, `README.md`

- [x] Add the Vercel POST endpoint with method checks and server-side validation.
- [x] Add SQL for a private table with UUID id, unique normalized email, and created_at.
- [x] Document creation of a separate Supabase project, environment setup, deployment, and CSV export.
- [x] Verify tests and inspect the code for browser-exposed credentials.
