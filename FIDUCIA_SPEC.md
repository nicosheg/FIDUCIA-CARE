# FIDUCIA CARE — Living Spec
_Single source of truth. Point every AI session (DeepSeek, ChatGPT, Claude, or any other) at this file before asking for help. Update it whenever something real changes._

---

## 0. HOW TO USE THIS DOCUMENT

- Before implementing anything, DeepSeek (or any AI) must first **show its understanding of the current relevant code and its proposed plan**, and wait for confirmation before writing final code. Do not skip straight to a fix.
- Check every proposed fix against the **Known Mistakes Checklist** (Section 7) before submitting it.
- Do not add new features or expand scope beyond what's in the **Current Phase** (Section 6) without explicit approval.
- When this file and reality disagree, reality wins — update this file, don't trust it blindly.

---

## 1. MISSION

> Every Person. Every Story. Remembered.

FIDUCIA CARE helps organizations know their people, remember their journeys, and care for them more intentionally — starting with churches in Nigeria, built from day one to extend to schools, NGOs, hospitals, and membership organizations.

**The one-sentence outcome:** No person an organization cares about is ever quietly forgotten — and that fact is visible, felt, and provable every week.

**The filter for every feature:** Does this help someone care for another human being better? If not, it doesn't belong here, no matter how technically impressive.

---

## 2. THE FIDUCIA DESIGN CONSTITUTION

Permanent rules for every FIDUCIA product — CARE, ARIA, and anything built later.

1. Motion must explain, never decorate.
2. AI (ARIA) speaks only when it adds confidence — never nag, never fill silence.
3. Every action leaves a subtle trace in the living world (timeline/journey).
4. Technology fades into the background; people stay in the foreground.
5. Beauty comes from clarity before effects.
6. The interface should reward attention, not demand it.
7. Every screen should feel alive, even with zero data.
8. Every interaction should make the user feel more capable, never overwhelmed.
9. If removing an effect wouldn't be noticed within a week of daily use, it wasn't necessary.

**Brand architecture:** FIDUCIA = "Living Intelligence" as the company-level category. Each product is a specific intelligence: ARIA = Personal Intelligence, CARE = Relationship Intelligence (future: Education Intelligence, Opportunity Intelligence, etc.). Same darkness level, same motion philosophy, same restraint — different accent color and ambient metaphor per product. CARE's ARIA instance has its own isolated memory — never mixed with other FIDUCIA products' data.

**Visual identity (CARE):** Deep navy base, "Living Presence" ambient motion (soft light/ripples, not literal ocean waves), warm gold accent, soft glass panels (no hard rectangles), consistent rounded icon set (no emoji), generous negative space.

---

## 3. CORE PRODUCT ARCHITECTURE — 5 LAYERS

Every feature belongs to exactly one of these layers.

**LAYER 1 — VISION:** Turn a paper register into structured, trustworthy data. Scan → extract → detect duplicates → confidence score → never fail silently.

**LAYER 2 — MEMORY:** Relationship Timeline per person (first visit, attendance, follow-ups, prayer requests, notes, milestones). Conversation Import (paste WhatsApp text → ARIA extracts context) instead of risky live WhatsApp integration. Guided Notes (tappable prompts, not blank text fields).

**LAYER 3 — INTELLIGENCE:** Attendance/relationship/communication intelligence. Last-contacted / next-follow-up indicator on every person card. Honest number verification (never claim "verified" without real evidence). Relationship Health (connectedness measure, never a judgment of the person). Predictive care (pattern detection → recommendation).

**LAYER 4 — ACTION:** Individual + broadcast draft engine (ARIA writes, human copies/edits/sends). Church Profile/Schedule (ARIA must never assume generic service times). ARIA Suggestions (proactive, with restraint — silent when someone's already handled).

**LAYER 5 — LEARNING:** Store full raw context from day one (not just summaries) even though active learning isn't built yet. Church Voice Learning and Pattern Learning are Phase 3 — foundation only for now.

**Architectural rule:** ARIA's brain must be built as independent, callable modules (`lib/aria/vision`, `lib/aria/memory`, `lib/aria/intelligence`, `lib/aria/draftEngine`, `lib/aria/suggestions`) — never embedded directly in UI/page components. This is what lets future FIDUCIA products (school, NGO, hospital versions) reuse the same brain.

---

## 4. THE ATTENDANCE / PARTICIPATION MODEL (locked, non-negotiable)

This is the most important architectural decision in the product. Do not shortcut it.

```
SCAN (population/identity capture — NEVER creates attendance or participation)
  ↓
PEOPLE (who does this organization know?)
  ↓
ATTENDANCE SESSION (collecting → ready for review → confirmed)
  ↓
USERS OBSERVE & RECORD ("who did I see?" — NOT "who is absent?")
  ↓
ADMIN/OWNER REVIEW (exception-based: 🟢 Ready / 🟡 Needs Attention / 🔴 Important — never a full manual approval queue)
  ↓
CONFIRMED PARTICIPATION (trusted historical record)
  ↓
ENGAGEMENT INTELLIGENCE (streaks, returns, inactivity, care priorities)
  ↓
CARE QUEUE (actionable, never a blanket broadcast)
  ↓
ARIA (explains, recommends, drafts — human stays in control of sending)
```

**Attendance state model (must be implemented, not yet fully built):**
- **Present** — observed and/or confirmed
- **Unobserved** — not marked; NEVER automatically becomes "absent"
- **Confirmed Absent** — only after sufficient coverage + explicit review

**No "Absent" button for Users.** Users tap who they saw. The system derives potential absence later, only when coverage is sufficiently complete and an authorized person confirms it.

**Scan ≠ Attendance ≠ Participation.** A scanned register might be historical, a different department's list, or incomplete — it must never auto-generate participation.

---

## 5. TECH STACK & CURRENT ARCHITECTURE

- **Frontend/Backend:** Next.js 14.1.0 (monolith — API routes in `pages/api/`, no separate backend server)
- **Database:** PostgreSQL via Supabase, accessed with raw SQL through the `pg` library (`pool.query`, `client.query`) — **not** the Supabase JS client (`.from().insert()`), and **not** MongoDB. This has been a repeated source of bugs when assumed incorrectly — always confirm against actual code.
- **Auth:** Supabase Auth. `withOrg` middleware wraps API routes, deriving `req.org.id` from the authenticated session — **never** from `req.query.organization_id` or `req.body.organization_id`.
- **AI:** Groq (vision model for scan extraction, currently `qwen/qwen3.6-27b` or similar — confirm current model name against Groq's live docs before assuming). Groq billing should be on a paid/Developer tier to remove the 8,000 TPM free-tier ceiling.
- **Messaging:** Not yet integrated (Termii pending business verification documents). Current interim approach: ARIA drafts messages, human copies/sends manually via `wa.me/[number]?text=[message]` one-tap WhatsApp links, with a "was this sent?" confirmation loop to keep the timeline accurate.
- **Hosting:** Render.com, free tier (causes cold-start delays — known, acceptable for now).

**Database schema (confirmed tables):** `organizations`, `users`, `people`, `sessions`, `session_sections`, `session_users`, `attendance_records`, `participation_records`, `engagement_metrics`, `engagement_cases`, `daily_briefings`, `aria_brain_feed`, `recommendations`, `person_journey_events`, `aria_learning`, `person_aliases`, `scan_jobs`, `timeline_events` (doubles as communication log).

---

## 6. CURRENT PHASE STATUS (update this section often — this is the part most likely to go stale)

**Auth migration (in progress):**
- ✅ `organizations` table, Supabase Auth trigger, `withOrg` middleware built
- ⚠️ NOT all pages/endpoints migrated off hardcoded `demo-org` yet — audit still needed file by file
- 🐛 Known outstanding bug: Attendance page still shows a manual "Your Name (for claiming groups)" text field instead of pulling identity from the logged-in session — leftover from pre-auth version, needs fixing

**Scan pipeline:** Stable (vision-model-direct extraction, JSON-or-abort validation, hard name-validation filters, normalized duplicate detection all implemented). Not yet perfect but no longer corrupting the database. Known good state — do not regress.

**Pages affected by auth migration, status uncertain until re-verified:** Home/ARIA Today, Community, Care Queue, Attendance, Review Center. Backend logic is further along than frontend wiring.

**Care Queue:** Has shown "0 items" despite real uncontacted people existing — root cause suspected to be either the `engagement_cases` generation engine not running regularly, or thresholds not yet met. Needs verification once auth migration settles.

**Page consolidation (agreed direction, not yet built):** Reduce from 7 pages to 3 — **Home** (ARIA Today briefing + Care Queue + quick actions), **People** (Community directory + Review Center + Attendance, as tabs), **Settings** (Church Profile + ARIA config + account). Scan becomes a modal/action, not a standalone page.

---

## 7. KNOWN MISTAKES CHECKLIST (check every fix against this before submitting)

- [ ] Does this match our actual stack? (Postgres via `pg`, NOT MongoDB syntax, NOT Supabase-client syntax like `.from().insert()`)
- [ ] Does `organization_id` come only from `req.org.id` (session), never from client-supplied query params or request body?
- [ ] Any regex/string matching on names — is it whole-word, not naive `.includes()` substring matching? (Past bug: `'ok'`.includes() falsely rejected names like "Okonkwo")
- [ ] Does any AI-response parsing have a strict JSON-or-abort path with **no** line-splitting/text fallback that could let raw reasoning text reach the database?
- [ ] Is duplicate detection using normalized comparison (strip punctuation/markdown/whitespace, lowercase), not exact string match?
- [ ] Does this match the existing code patterns/column names elsewhere in the file, not assumed/guessed?
- [ ] For anything reading `scan_jobs.result` or other JSONB columns — remember `pg` auto-parses JSONB; do NOT call `JSON.parse()` on it again.

---

## 8. BUILD PRIORITY ORDER

**Now:**
1. Finish auth migration — audit every file for remaining `demo-org` references, fix the Attendance page name-field bug
2. Verify Care Queue is actually populating from `engagement_cases`
3. Implement Present/Unobserved/Confirmed Absent state model properly (not just `present = true` always)
4. 3-page consolidation

**Phase 2 (after above is stable):**
- Session review UX (🟢/🟡/🔴 exception-based, not full manual approval)
- Person Journey as a proper visual timeline
- ARIA Suggestions (proactive, restrained)

**Phase 3 (explicitly deferred, not forgotten):**
- Church Voice Learning, full Pattern Learning
- Live multi-user real-time attendance sync
- Section-based attendance assignment
- Workflow/automation engine (sequential, multi-step campaigns)
- Full Living Canvas ambient system (constellation-of-connection background, mood-reactive color, memory ripples)
- Real Termii/WhatsApp Business API integration (pending business docs)

---

## 9. BUSINESS

- **Founding price:** ₦3,500/month (or ₦35,000/year), locked for first 5-10 churches regardless of feature growth in that window
- **Trial:** 1 week free, no card required, designed to get a church scanning their real register and seeing real personalized ARIA output by day 2-3 — the emotional hook must land early, not at the end
- **Positioning:** Not "church management software" — "The Relationship Intelligence Platform." Category-defining language throughout, never generic ChMS terms.
- **Expansion path:** Churches first (prove the loop) → schools/NGOs/hospitals later, same engine, different vocabulary layer

---

_Last updated: reflects state as of this conversation. Update after every major merge._
