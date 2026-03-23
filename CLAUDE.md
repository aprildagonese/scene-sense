# Scene Sense — Project Context for Claude Code

## What this is

A multimodal AI web app built for a live 6-minute demo at the **Multimodal Frontier
Hackathon**. It takes a video or image input (webcam capture or file upload), accepts
prompts describing the social post goal, target platform, and vibe, then generates:

- Optimized social media copy tailored to the platform and vibe
- An AI-narrated audio track for the post
- A shareable post package the user can post directly to LinkedIn (or copy/download
  as a fallback)

Every generated post is persisted to a database so the app has a real production-grade
history view.

The app exists to demonstrate **DigitalOcean's Gradient inference platform alongside
DO core cloud infrastructure**. The narrative is:

> "Gradient handles the inference. DigitalOcean handles everything else — the database,
> the hosting, the storage. You're not stitching together five vendors. One platform,
> one bill, one control plane."

The demo must be deployed to a live URL before the event. It will be demoed on stage
in front of a hackathon audience of AI builders.

---

## DO-only stack — hard constraints

This project uses **DigitalOcean exclusively**. Never suggest third-party alternatives
for infrastructure, hosting, databases, or storage if we can use something from DO instead. Specific mappings:

### Gradient Serverless Inference (inference layer)
- Base URL: `https://inference.do-ai.run/v1/`
- Auth: `DIGITAL_OCEAN_MODEL_ACCESS_KEY` as Bearer token
- SDK: OpenAI-compatible — use the `openai` npm package pointed at the DO base URL
- Skill installed in this repo: `npx skills add ajot/digitalocean-gradient`
  (consult SKILL.md and references/ for model IDs, endpoints, and async patterns)

**Vision (image/video understanding):**
- Use a Gradient-hosted vision-capable model via `/v1/chat/completions`
- Pass the uploaded image or extracted video frame as a base64 image in the message
- This generates the scene description that feeds into copy generation

**Text / copy generation:**
- Use a Gradient-hosted chat model (e.g. `llama3.3-70b-instruct` or equivalent)
- System prompt should instruct the model to write platform-optimized social copy
  given: scene description, target platform, post goal, and vibe

**Audio narration (TTS):**
- Model: `fal-ai/elevenlabs/tts/multilingual-v2`
- Endpoint: `/v1/async-invoke` (async — poll for result)
- Input: the generated post copy text
- Output: audio file URL or base64 — store URL in DB, play in browser

**Do NOT suggest:** OpenAI API directly, Anthropic API directly, Replicate, Hugging
Face Inference, ElevenLabs API directly, AssemblyAI, or any non-Gradient inference
endpoint. It is possible that we may need to use an external model, but do your best to work with what DO offers first.

### DigitalOcean Managed PostgreSQL (persistence layer)
- Connection via `DATABASE_URL` env var (set in App Platform dashboard)
- Use the `pg` npm package for database access in Next.js API routes
- Run migrations on startup or via a seed script — do not use an ORM, keep it simple

**Schema — `posts` table:**
```sql
CREATE TABLE IF NOT EXISTS posts (
  id          SERIAL PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  platform    TEXT NOT NULL,              -- e.g. "LinkedIn", "Twitter"
  goal        TEXT NOT NULL,              -- user-provided post goal
  vibe        TEXT NOT NULL,              -- user-provided vibe
  description TEXT NOT NULL,             -- vision model output
  copy        TEXT NOT NULL,             -- generated post copy
  audio_url   TEXT,                      -- TTS output URL or null
  media_url   TEXT,                      -- Spaces URL of uploaded image/video or null
  posted      BOOLEAN NOT NULL DEFAULT FALSE
);
```

**Do NOT suggest:** Supabase, Neon, PlanetScale, Railway Postgres, Vercel Postgres,
SQLite, or any non-DO database.

### DigitalOcean Spaces (media storage — optional but preferred)
- Use if storing uploaded images or videos persistently
- S3-compatible API — use the `@aws-sdk/client-s3` package pointed at the DO Spaces
  endpoint
- Endpoint format: `https://{region}.digitaloceanspaces.com`
- Auth: `SPACES_KEY` and `SPACES_SECRET` env vars
- Store the returned object URL in `posts.media_url`
- If Spaces adds too much complexity for the initial build, skip it and store media
  transiently — but note this in a TODO comment

**Do NOT suggest:** AWS S3, Cloudinary, Uploadthing, or any non-DO storage.

### DigitalOcean App Platform (hosting)
- Config lives in `.do/app.yaml` at the repo root
- Deployed via GitHub — main branch triggers auto-deploy
- All env vars (`DIGITAL_OCEAN_MODEL_ACCESS_KEY`, `DATABASE_URL`, `LINKEDIN_CLIENT_ID`,
  `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_REFRESH_TOKEN`,
  `SPACES_KEY`, `SPACES_SECRET`) are set in the App Platform dashboard, never hardcoded

**Do NOT suggest:** Vercel, Netlify, Render, Railway, Fly.io, or any non-DO hosting.

---

## App structure

Next.js app (App Router). Two primary views:

### `/` — Create view
1. **Input panel**
   - Webcam capture button (prominent, one-click) OR file upload (image or video)
   - Preview of captured/uploaded media
   - Text inputs: "Post goal" (e.g. "share excitement about the hackathon"),
     "Target platform" (dropdown: LinkedIn, Twitter/X, Instagram), "Vibe"
     (e.g. "energetic and fun", "professional but warm")
2. **Generate button** — triggers the full pipeline:
   - Vision model analyzes the media → scene description
   - LLM generates platform/goal/vibe-optimized post copy
   - TTS async job generates audio narration of the copy
   - Result saved to DB
3. **Output panel** (appears after generation)
   - Generated post copy (editable before posting)
   - Audio player (auto-plays, with replay button)
   - Post action area (see Social posting section below)
   - QR code pointing to April's LinkedIn profile

### `/history` — Past posts view
- Paginated list of all past generated posts from the DB
- Each row shows: timestamp, platform, copy preview, audio playback, posted status
- This is the "agent memory" / "production app" proof point — make it look real

### Navigation
- Simple top nav with "Create" and "History" tabs
- One-click switch between views — must be accessible during the demo

---

## Social posting — implementation priority order

Build all three tiers. Tier 3 is the UI foundation; Tier 1 is layered on top.
Always render the Tier 3 UI regardless of whether Tier 1 is working.

### Tier 1: LinkedIn direct API (build first, primary path)

`w_member_social` is an open permission — no partner review required. Setup:
1. Create a LinkedIn Developer app at https://developer.linkedin.com
2. Add "Share on LinkedIn" and "Sign In with LinkedIn using OpenID Connect" products
   (self-serve, no approval)
3. Complete the 3-legged OAuth flow once before the event to get access + refresh tokens
4. Store `LINKEDIN_ACCESS_TOKEN` and `LINKEDIN_REFRESH_TOKEN` as App Platform env vars
5. On stage, posting is a single API call — no OAuth redirect on stage

**Posting endpoint:** `POST https://api.linkedin.com/v2/ugcPosts`
- Header: `Authorization: Bearer {LINKEDIN_ACCESS_TOKEN}`
- Header: `X-Restli-Protocol-Version: 2.0.0`
- If the post includes an image: use the LinkedIn Assets API to upload the image first,
  then reference the asset URN in the ugcPost
- On success: mark `posts.posted = true` in the DB, show a success state with a link
  to the live post

**Token refresh:** implement a `/api/linkedin/refresh` route that uses the refresh
token to get a new access token. Call this proactively if the access token is within
1 hour of expiry.

**If the API call fails on stage:** catch the error silently, show the Tier 3 UI
automatically — do not show an error screen.

### Tier 2: Skip
Do not build a fallback for a different social platform. The complexity isn't worth it
given Tier 3 is a clean fallback.

### Tier 3: Manual posting fallback (always present, always functional)
This is not a failure state — it should look intentional and polished.

- "Copy post text" button (copies to clipboard, shows confirmation checkmark)
- "Download audio" button (downloads the TTS audio file)
- "Download media" button if applicable
- QR code component pointing to `https://www.linkedin.com/in/aprildag` (or correct
  handle — confirm before building) so audience can scan to connect with April
- Brief instruction text: "Open LinkedIn, paste, and post"

The QR code should be visible in the output panel regardless of tier — it's part of
the stage moment (audience scans it during the talk).

---

## Demo requirements — these constrain UX decisions

These are not nice-to-haves. The demo is the product.

- **The full pipeline must complete in under 15 seconds** — vision + copy + TTS async
  polling included. Show a progress indicator with step labels ("Analyzing...",
  "Writing copy...", "Generating audio...") so latency feels intentional, not broken
- **Webcam capture must be one click** — no multi-step modal, no permissions re-prompt
  if already granted. The capture button should be the most prominent element on the
  page
- **The output panel must appear in the same view** — no page navigation after
  generation. The audience needs to see the full input → output flow without a
  redirect
- **Audio must auto-play** after generation, with a visible replay button
- **The History tab must be reachable in one click** from the Create view at all times
- **The app must be deployed at a live URL** and tested end-to-end on that URL before
  the event — not localhost
- **No spinners without labels** — every loading state should tell the user what's
  happening

---

## What the demo needs to show (narrative arc)

The audience is AI builders at a multimodal hackathon. The demo should make them feel
like they could build this in a weekend. The story beats, in order:

1. **Input is real** — webcam capture of the room / audience, or uploaded hackathon
   photo. Not a placeholder image.
2. **Vision model understands the scene** — description appears, reads naturally
3. **Copy is platform-aware** — the LinkedIn post sounds like a LinkedIn post, not a
   generic caption
4. **Audio makes it multimodal** — the post is narrated aloud. This is the "wow" moment.
5. **It posts to LinkedIn** (or the fallback copy/download flow) — something real
   happens in the world
6. **History proves it's production** — flip to the History tab, past posts are there,
   persisted in a real DO Managed Postgres database
7. **The stack is the point** — Gradient for inference, Postgres for memory, App
   Platform for deployment. One platform.

The DB and App Platform integrations are as important to the story as the inference
calls. Do not abstract them away — the history view and the deployed URL are both
demo-critical proof points.

---

## Environment variables reference

| Variable | Description | Where set |
|---|---|---|
| `DIGITAL_OCEAN_MODEL_ACCESS_KEY` | Gradient Serverless Inference key | App Platform |
| `DATABASE_URL` | DO Managed Postgres connection string | App Platform |
| `LINKEDIN_CLIENT_ID` | LinkedIn Developer app client ID | App Platform |
| `LINKEDIN_CLIENT_SECRET` | LinkedIn Developer app client secret | App Platform |
| `LINKEDIN_ACCESS_TOKEN` | Pre-authorized OAuth access token | App Platform |
| `LINKEDIN_REFRESH_TOKEN` | OAuth refresh token | App Platform |
| `SPACES_KEY` | DO Spaces access key (if using Spaces) | App Platform |
| `SPACES_SECRET` | DO Spaces secret key (if using Spaces) | App Platform |
| `NEXT_PUBLIC_LINKEDIN_PROFILE_URL` | April's LinkedIn profile URL for QR code | App Platform or hardcode |

Never hardcode secrets. Never commit a `.env` file.

---

## Key files to create

```
/
├── CLAUDE.md                         # this file
├── .do/
│   └── app.yaml                      # App Platform config
├── app/
│   ├── page.tsx                      # Create view
│   ├── history/
│   │   └── page.tsx                  # History view
│   └── api/
│       ├── generate/
│       │   └── route.ts              # Main pipeline: vision → copy → TTS → DB
│       ├── posts/
│       │   └── route.ts              # GET history from DB
│       ├── linkedin/
│       │   ├── post/
│       │   │   └── route.ts          # POST to LinkedIn
│       │   └── refresh/
│       │       └── route.ts          # Refresh LinkedIn token
│       └── db/
│           └── migrate/
│               └── route.ts          # Run DB migrations (call once on setup)
├── lib/
│   ├── db.ts                         # pg pool setup
│   ├── gradient.ts                   # Gradient inference client helpers
│   ├── linkedin.ts                   # LinkedIn API helpers
│   └── spaces.ts                     # DO Spaces helpers (if used)
└── components/
    ├── WebcamCapture.tsx
    ├── GenerateForm.tsx
    ├── OutputPanel.tsx
    ├── AudioPlayer.tsx
    ├── QRCode.tsx
    └── PostHistory.tsx
```

---

## Notes on the Gradient skill

The `digitalocean-gradient` skill (`npx skills add ajot/digitalocean-gradient`) is
installed in this repo. Consult it for:
- Exact model IDs (see `references/models.md`)
- Async image/audio generation patterns including polling (see `references/image-and-audio.md`)
- App Platform deployment templates (see `references/deploy-to-app-platform.md`)

The skill covers Serverless Inference. Dedicated Inference (DI) is a separate DO
product with reserved throughput and predictable latency — it's worth mentioning in
the demo narrative as the "what you graduate to at scale" tier, but this app uses
Serverless Inference. Do not conflate them in code comments.