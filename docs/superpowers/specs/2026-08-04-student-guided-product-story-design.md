# Veylo Student-Guided Landing Page Design

## Goal

Make the Veylo landing page self-explanatory for university students. A first-time visitor should understand what Veylo is, why it is useful, how the main features work together, what privacy protections apply, and what joining the beta means without needing a personal explanation from the founder.

## Primary audience

University students considering joining the beta. The page should combine the energy of a student-app launch with the clarity of a product walkthrough.

## Recommended narrative

Use a guided product story rather than a catalogue of features. The page follows a familiar student journey:

1. A student arrives on campus and wants to know which friends are around.
2. They check friends’ voluntarily shared campus-level statuses.
3. They discover a relevant update in the campus feed.
4. They reply or move the conversation into a friend chat.
5. The update becomes an actual study session, lunch, event visit, or hangout.

This story demonstrates how Campus, Feed, Friends, and Chats work as one product while allowing each feature to receive a clear explanation.

## Page structure

### 1. Hero: immediate understanding

Retain the approved headline: “Veylo turns ‘where are you?’ into actually meeting up.”

Add a concise definition directly beneath it:

> Veylo is a campus social app that helps university students see which friends are sharing that they are around, discover useful campus updates, and turn those updates into real plans.

The primary action remains “Join the beta waitlist.” A secondary action leads into the walkthrough.

### 2. The problem Veylo solves

Use recognisable student moments rather than abstract marketing language:

- You have an hour between classes and do not know who else is around.
- You want a study partner but do not want to message several people individually.
- Something useful is happening on campus, but you hear about it too late.
- A group chat says “we should meet up” but no clear plan follows.

Conclude that Veylo brings these signals into one place.

### 3. Guided student journey

Present four connected steps with realistic UI examples:

1. **Check Campus** — See friends who have chosen to share a campus-level update, including statuses such as On campus, Studying, In class, or Leaving soon.
2. **Discover something relevant** — Browse university posts about study sessions, food, events, help requests, or casual hangouts.
3. **Connect with people you trust** — Add students as friends and keep direct messaging centred on accepted friends.
4. **Turn the update into a plan** — Reply, chat, choose where to meet, and move from awareness to an actual in-person plan.

Each step explains what the feature does, why a student would use it, and how it leads to the next step.

### 4. Common ways students can use Veylo

Use short scenario cards:

- Find someone studying the same unit.
- See which friends are free between classes.
- Discover campus events, free food, or useful announcements.
- Ask for help from students at the same university.
- Organise lunch or a quick hangout.
- Let friends know you are leaving soon without messaging everyone.

These are examples, not promises of automated matching or guaranteed availability.

### 5. Feature clarity

Include a concise reference section for visitors who scan by feature:

- **Campus:** voluntary campus-level status from friends; never an exact live location.
- **Feed:** university-relevant posts for study, events, food, help, and hangouts.
- **Friends:** a trusted connection layer that controls social visibility and messaging.
- **Chats:** direct and group conversations that turn updates into plans.
- **Profile and privacy controls:** manage identity, visibility, status, and invisible mode.

### 6. Privacy: explain the boundary clearly

State the privacy model in plain language:

- Veylo does not show an exact GPS pin or live map of a student’s location.
- Campus status is shared under the student’s controls.
- Status visibility is designed around accepted friends.
- Invisible mode allows a student to appear away.
- Students choose when and what they share.

Link to the full privacy policy for legal detail.

### 7. What Veylo is and is not

Use a two-column comparison to remove common misconceptions.

**Veylo is:**

- A way to understand friend availability at campus level.
- A university-relevant social feed.
- A tool for turning lightweight updates into plans.
- A friends-first social experience.

**Veylo is not:**

- An exact-location tracker.
- A public map showing every student.
- A dating app.
- A replacement for emergency or university safety services.

### 8. Student FAQ

Answer the most likely questions:

- Who can use Veylo?
- Does Veylo show my exact location?
- Who can see my status?
- Can I hide that I am on campus?
- What can students post?
- Can strangers message me?
- Is the app available now?
- What happens after I join the waitlist?

Answers must reflect current app behaviour and avoid inventing launch dates, eligibility rules, or capabilities.

### 9. Beta waitlist

Explain that Veylo is in active development and that joining the waitlist means the team may contact the student about early beta access, testing opportunities, and product feedback. Do not promise guaranteed acceptance or a launch date. Retain the existing email-only form and its privacy note.

## Visual direction

Preserve the current green, cream, white, and orange palette and the people-first campus illustration. Add visual rhythm through connected numbered steps, realistic interface examples, scenario cards, and a clear comparison section. Keep paragraphs short, use descriptive headings, and make the page easy to scan on a phone.

Do not add invented screenshots, precise-distance claims, exact-location imagery, fake testimonials, false university endorsements, download badges, or non-functional controls.

## Implementation boundaries

- Change only the separate `veylo-site` marketing website.
- Do not edit the Veylo mobile app repository or existing app Supabase project.
- Preserve the working `/api/waitlist` endpoint and waitlist database integration.
- Preserve the existing privacy, terms, and support pages.
- Keep the public production URL unchanged.

## Data flow and error handling

The content expansion is static. The existing waitlist form continues to submit an email and empty honeypot to `/api/waitlist`. Preserve validation, loading state, success messaging, duplicate handling, and generic error messaging. Supabase credentials remain server-side only.

## Verification

- Confirm all approved product concepts appear and no unsupported claims were introduced.
- Verify desktop and mobile content order remains understandable.
- Verify heading hierarchy, form labels, keyboard navigation, and live form feedback.
- Run the existing site and waitlist tests.
- Build and deploy the separate website.
- Submit a disposable email through production and confirm the row in the isolated waitlist database.
- Confirm the production URL remains publicly accessible without authentication.
