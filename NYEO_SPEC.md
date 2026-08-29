# Nyeo Care — Living Spec
_Single source of truth. Point every AI session (DeepSeek, ChatGPT, Claude, or any other) at this file before asking for help. Update it whenever something real changes._

---

## 0. HOW TO USE THIS DOCUMENT

- Before implementing anything, DeepSeek (or any AI) must first **show its understanding of the current relevant code and its proposed plan**, and wait for confirmation before writing final code. Do not skip straight to a fix.
- Check every proposed fix against the **Known Mistakes Checklist** (Section 7) before submitting it.
- Do not add new features or expand scope beyond what's in the **Current Phase** (Section 6) without explicit approval.
- When this file and reality disagree, reality wins — update this file, don't trust it blindly.
- **Findings must be confirmed from actually re-read code, not recalled/inferred from earlier conversation.** State clearly which findings are confirmed vs. still unknown/unverified. This distinction has mattered in practice — treat it as a hard rule, not a suggestion.
- **🚨 NEVER FABRICATE AN AUDIT. This has actually happened — treat it as a real, recurring risk, not a hypothetical.** An AI must never produce a report using words like "CONFIRMED," "verified," "✅ CLEAN," or file-by-file findings — with or without fake code snippets — unless the actual current files were genuinely shared *in that same conversation*. If files haven't been provided yet, say so plainly and ask for them by name. Do not simulate, guess, or narrate what an audit would probably find and present it with the formatting/confidence of a real one — a confident-looking fabricated audit is more dangerous than an honest "I don't have the files yet," because it looks rigorous while being invented. Before writing any report containing "CONFIRMED," an AI should be able to answer: *which literal message in this conversation contained this file's actual content?* If there's no answer, stop and ask for the file instead.
- **Role division:** Nicholas = vision/final decision. ChatGPT/Claude = architecture, audit, verification, review. DeepSeek = implementation only, per an already-frozen spec. DeepSeek should not redesign architecture mid-implementation.
- **Workflow for any large change:** Architecture Freeze → Dependency Audit (trace data ownership/API/consumers for every affected feature, based on real code) → Experience/Implementation Plan → Build → Review. Do not skip straight to code on anything touching auth, data model, or navigation structure.

---

## 1. MISSION

> Every Person. Every Story. Remembered.

Nyeo Care helps organizations know their people, remember their journeys, and care for them more intentionally — starting with churches in Nigeria, built from day one to extend to schools, NGOs, hospitals, and membership organizations.

**The one-sentence outcome:** No person an organization cares about is ever quietly forgotten — and that fact is visible, felt, and provable every week.

**The filter for every feature:** Does this help someone care for another human being better? If not, it doesn't belong here, no matter how technically impressive.

**🔒 SCOPE DECISION (locked 2026-08-24):** Building the full production architecture — event pipeline, observation engine, person state engine, action engine — not a stripped MVP. **The one hard exclusion: no autonomous execution.** ARIA may observe, explain, recommend, and prepare an action (e.g., draft a message), but **every single action requires an explicit human approval tap before it executes — always, no exceptions, no "auto-approve after N successful actions" shortcut ever added later without this line being consciously revisited.** This is the one guardrail that makes "build everything" safe to attempt as a solo builder. Do not let "automation" get quietly reinterpreted to mean anything less strict than this.

**Risk-tiered build discipline, given this scope:** the event pipeline and person-state engine are where a subtle bug is dangerous — a wrongly-deduplicated event or corrupted state doesn't crash, it silently feeds wrong "truth" into ARIA's later recommendations, potentially reaching a real person. Apply the full audit-first discipline (Section 0) rigorously here. API/authorization plumbing and domain-integration wiring fail loudly when broken — safe to move faster there with lighter review.

---

## 2. THE Nyeo DESIGN CONSTITUTION

Permanent rules for every Nyeo product — CARE, ARIA, and anything built later.

1. Motion must explain, never decorate.
2. AI (ARIA) speaks only when it adds confidence — never nag, never fill silence.
3. Every action leaves a subtle trace in the living world (timeline/journey).
4. Technology fades into the background; people stay in the foreground.
5. Beauty comes from clarity before effects.
6. The interface should reward attention, not demand it.
7. Every screen should feel alive, even with zero data.
8. Every interaction should make the user feel more capable, never overwhelmed.
9. If removing an effect wouldn't be noticed within a week of daily use, it wasn't necessary.

**Brand architecture:** Nyeo = "Living Intelligence" as the company-level category. Each product is a specific intelligence: ARIA = Personal Intelligence, CARE = Relationship Intelligence (future: Education Intelligence, Opportunity Intelligence, etc.). Same darkness level, same motion philosophy, same restraint — different accent color and ambient metaphor per product. CARE's ARIA instance has its own isolated memory — never mixed with other Nyeo products' data.

**Visual identity (CARE):** Deep navy base, "Living Presence" ambient motion (soft light/ripples, not literal ocean waves), warm gold accent, soft glass panels (no hard rectangles), consistent rounded icon set (no emoji), generous negative space.

---

## 3. CORE PRODUCT ARCHITECTURE — 5 LAYERS

Every feature belongs to exactly one of these layers.

**LAYER 1 — VISION:** Turn a paper register into structured, trustworthy data. Scan → extract → detect duplicates → confidence score → never fail silently.

**LAYER 2 — MEMORY:** Relationship Timeline per person (first visit, attendance, follow-ups, prayer requests, notes, milestones). Conversation Import (paste WhatsApp text → ARIA extracts context) instead of risky live WhatsApp integration. Guided Notes (tappable prompts, not blank text fields).

**LAYER 3 — INTELLIGENCE:** Attendance/relationship/communication intelligence. Last-contacted / next-follow-up indicator on every person card. Honest number verification (never claim "verified" without real evidence). Relationship Health (connectedness measure, never a judgment of the person). Predictive care (pattern detection → recommendation).

**LAYER 4 — ACTION:** Individual + broadcast draft engine (ARIA writes, human copies/edits/sends). Church Profile/Schedule (ARIA must never assume generic service times). ARIA Suggestions (proactive, with restraint — silent when someone's already handled).

**LAYER 5 — LEARNING:** Store full raw context from day one (not just summaries) even though active learning isn't built yet. Church Voice Learning and Pattern Learning are Phase 3 — foundation only for now.

**Architectural rule:** ARIA's brain must be built as independent, callable modules (`lib/aria/vision`, `lib/aria/memory`, `lib/aria/intelligence`, `lib/aria/draftEngine`, `lib/aria/suggestions`) — never embedded directly in UI/page components. This is what lets future Nyeo products (school, NGO, hospital versions) reuse the same brain.

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

**Auth: ✅ WORKING END TO END, CONFIRMED (as of this session).**
- Real signup (`/signup`), login (`/login`, password + magic link), and logout are all functional and tested with a genuinely new account
- `ensureCareUser()` fixed: now called inside `getCurrentCareUser()` (was previously only triggered by `withOrg`, causing new signups to 401-loop forever); insert now uses `RETURNING id` (was previously returning `id: null` for new users)
- `lib/supabaseClient.js` was crashing every page that imported it, for two stacked reasons, both fixed:
  1. `NEXT_PUBLIC_SUPABASE_URL` had `/rest/v1/` incorrectly appended — must be the bare project URL only (`https://xxxx.supabase.co`)
  2. The file created both the browser-safe `supabase` client AND the server-only `supabaseAdmin` client (using `SUPABASE_SERVICE_ROLE_KEY`) in the same module — importing either one in a page pulled in both, and the admin key is correctly `undefined` in the browser, crashing `createClient()` on load. **Fixed by splitting into `lib/supabaseClient.js` (browser+server safe) and `lib/supabaseAdmin.js` (server/API-routes only — audit that nothing under `pages/` or `components/` imports this).**
- Org isolation confirmed working correctly: a fresh signup correctly shows 0 people, 0 care queue items, 0 review items — all consistent, no leakage from old `demo-org` test data
- Logout button added to nav, functional
- 🐛 Still open, minor: Attendance page's "Your Name (for claiming groups)" field is now pre-filled with the real logged-in name but is still an editable text input rather than a locked display — confirm with DeepSeek whether editability is intentional or should be locked
- ⚠️ Supabase's default email service has a low rate limit on the free tier — hit during heavy testing today. Fine for solo testing; **before real launch, connect a real SMTP provider (Resend or SendGrid) under Supabase → Authentication → SMTP Settings.** Pre-launch checklist item, not urgent now.

**Fixed today: Review Center org-isolation bug.** Was showing real named people/duplicate-conflict data (from old `demo-org` data) for a brand-new organization that should have shown 0. Confirmed fixed — now correctly shows 0 pending reviews for a fresh org, consistent with Community (0 lives remembered) and Care Queue (0 items).

**Scan pipeline:** Stable (vision-model-direct extraction, JSON-or-abort validation, hard name-validation filters, normalized duplicate detection all implemented). Not yet perfect but no longer corrupting the database. Known good state — do not regress.

**Care Queue:** Was showing "0 items" — appears to be *correct* behavior for a fresh org with no confirmed participation history yet, not a bug. Re-verify once a real org has actual attendance/engagement data flowing through it.

**Page consolidation — ✅ VISUALLY CONFIRMED LIVE (screenshot-verified 2026-08-22), functional testing still pending:**

🚨 **Incident history:** an earlier DeepSeek session fabricated a fake "audit report" claiming these files existed before any real files were shared (see Section 0's anti-fabrication rule). That specific incident was invented. **However**, a *separate*, later effort appears to have actually built the consolidation for real — confirmed via direct screenshots of the live app, not a chat summary. Nav now shows only Home / People / Profile / Logout. People page correctly shows Community / Attendance / Review Center as tabs within one page. Data consistency holds (Care Queue 0 items, Community 0 lives remembered — no regression).

**Still needs functional verification, not just visual:** "Add Person," "ARIA Scan," "Save Profile," and switching between People's tabs need to be tested as real actions, not just confirmed to render correctly. Also confirm whether old page URLs (`/scan`, `/attendance`, `/community`, `/review-center`, `/care-queue`, `/church-profile`) still work as a fallback (redirects were supposedly deferred per DeepSeek's stated rules) or have already been removed.

Final structure, now live:
- **HOME** — ARIA Today briefing, Care Queue, quick actions (Scan Register, Community, Review Center, Attendance)
- **PEOPLE** — Community / Attendance / Review Center as tabs in one workspace
- **PROFILE** — Church Profile (service times, programs/events, save), Account section, Logout

**Core principle guiding the rebuild:** every feature is a different view of "the people entrusted to this organization" — attendance, reviews, and care queue all revolve around the person, not separate concerns. Real state changes make it feel alive — motion/design reinforces this, never fakes it in the absence of real data.

**Real next step:** functional test pass (see above), then confirm backend/lib files were genuinely untouched as claimed. Once both check out, this phase is genuinely done — move to Present/Unobserved/Confirmed Absent state model implementation.

---

## 7. KNOWN MISTAKES CHECKLIST (check every fix against this before submitting)

- [ ] Does this match our actual stack? (Postgres via `pg`, NOT MongoDB syntax, NOT Supabase-client syntax like `.from().insert()`)
- [ ] Does `organization_id` come only from `req.org.id` (session), never from client-supplied query params or request body?
- [ ] Any regex/string matching on names — is it whole-word, not naive `.includes()` substring matching? (Past bug: `'ok'`.includes() falsely rejected names like "Okonkwo")
- [ ] Does any AI-response parsing have a strict JSON-or-abort path with **no** line-splitting/text fallback that could let raw reasoning text reach the database?
- [ ] Is duplicate detection using normalized comparison (strip punctuation/markdown/whitespace, lowercase), not exact string match?
- [ ] Does this match the existing code patterns/column names elsewhere in the file, not assumed/guessed?
- [ ] For anything reading `scan_jobs.result` or other JSONB columns — remember `pg` auto-parses JSONB; do NOT call `JSON.parse()` on it again.
- [ ] Does any file that's imported by browser/page code also create a `supabaseAdmin`/service-role client? Never mix browser-safe and server-only Supabase clients in the same importable module — split them.
- [ ] `NEXT_PUBLIC_*` env vars are inlined at **build time**, not read live. If a value changes on Render, a normal redeploy may not pick it up — use "Clear build cache & deploy" to force a fresh inline.
- [ ] Does `NEXT_PUBLIC_SUPABASE_URL` contain anything beyond the bare project URL (e.g. an accidental `/rest/v1/` suffix)? The client library appends paths itself — the base var must be clean.
- [ ] Does error-handling code display the *real* error message (`error.message`)? Never `JSON.stringify(error)` on a real Error/Supabase error object — this silently produces `{}` since `.message` is non-enumerable, hiding the actual problem from both user and developer.
- [ ] Is any assumption about auth/org state based on inferred/remembered context, or was the actual relevant file re-read in this session? State which, explicitly.

---

## 8. BUILD PRIORITY ORDER

**Now:**
1. ~~Finish auth migration~~ — ✅ done, confirmed working end to end
2. HOME/PEOPLE/PROFILE consolidation — Phase 2 (Dependency Audit) is the immediate next step, per Section 0's workflow. Do not write restructuring code until the audit is reviewed.
3. Once consolidation lands: implement Present/Unobserved/Confirmed Absent state model properly (not just `present = true` always) and re-verify Care Queue populates correctly with real engagement data
4. Minor: resolve Attendance page's editable-vs-locked name field

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
