# Scene Sense — Project Context for Claude Code

## What this is

A multimodal AI web app built for a live 6-minute demo at the **Multimodal Frontier
Hackathon**. It takes multiple image uploads, accepts prompts describing the social
post goal, target platform, and vibe, then generates:

- A promo-style video with Ken Burns effects, AI-sequenced images, and text overlays
- AI-generated background music matching the vibe (via MusicGen on a GPU Droplet)
- Platform-optimized post copy in April's voice (straightforward, no corporate fluff)
- Direct posting to LinkedIn

Every generated post is persisted to a Managed PostgreSQL database with a sidebar
for quick access to past posts.

The app exists to demonstrate **DigitalOcean's Gradient inference platform alongside
DO core cloud infrastructure**. The narrative is:

> "Gradient handles the inference. A GPU Droplet runs the open-weight music model.
> Managed Postgres stores everything. One platform."

The app runs locally for the demo (not deployed publicly) to avoid other users
posting to April's LinkedIn. The demo narrative: "It's running locally now, but I
could deploy it entirely on DigitalOcean with App Platform."

---

## DO-only stack — hard constraints

This project uses **DigitalOcean exclusively** for all AI and infrastructure.

### Gradient Serverless Inference (inference layer)
- Base URL: `https://inference.do-ai.run/v1/`
- Auth: `DIGITAL_OCEAN_MODEL_ACCESS_KEY` as Bearer token
- SDK: OpenAI-compatible — use the `openai` npm package pointed at the DO base URL
- Skill installed in this repo: `npx skills add ajot/digitalocean-gradient`

**Vision + image sequencing (GPT-4.1):**
- Analyzes ALL uploaded images via `/v1/chat/completions`
- Returns a scene description AND optimal image order for the promo video
- Multi-image support: pass all images in a single message

**Text / copy generation (GPT-4.1):**
- Generates: post copy, music prompt, and 3 video overlay phrases
- Copy follows April's voice: straightforward, factual, anti-corporate-LinkedIn
- Always @-tags companies and includes #DigitalOcean
- Music prompt is detailed and platform-aware

### GPU Droplet (MusicGen — open-weight music generation)
- RTX 4000 Ada GPU Droplet at `DIGITAL_OCEAN_GPU_DROPLET_IP`
- Runs Meta's MusicGen Medium (1.5B params, MIT license) via FastAPI
- Endpoint: `POST http://{ip}:8000/generate` with `{prompt, duration_seconds}`
- Duration is calculated to match the video length exactly
- Server code lives in `gpu-server/`

### DigitalOcean Managed PostgreSQL (persistence layer)
- Connection via `DIGITAL_OCEAN_DATABASE_URL` env var
- Use the `pg` npm package — no ORM

**Schema — `posts` table:**
```sql
CREATE TABLE IF NOT EXISTS posts (
  id          SERIAL PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  platform    TEXT NOT NULL,
  goal        TEXT NOT NULL,
  vibe        TEXT NOT NULL,
  description TEXT NOT NULL,
  copy        TEXT NOT NULL,
  narration   TEXT,
  audio_url   TEXT,
  video_url   TEXT,
  media_url   TEXT,
  posted      BOOLEAN NOT NULL DEFAULT FALSE
);
```

---

## App structure

Next.js app (App Router). Single-page create view with sidebar.

### `/` — Create view (3-column layout)
1. **Sidebar (left)** — Past posts list, click to reload any post
2. **Input panel (center)**
   - Multi-image upload (2-5 images, primary action)
   - Camera capture hidden behind collapsible "or use camera"
   - Resizable textarea for post goal
   - Platform dropdown (LinkedIn default), vibe input
3. **Generate button** — triggers the full pipeline:
   - GPT-4.1 analyzes all images → description + optimal order
   - GPT-4.1 generates copy + music prompt + video overlays
   - MusicGen on GPU generates background music (duration-matched)
   - FFmpeg composes promo video with Ken Burns, text overlays, audio
   - Result saved to DB
4. **Output panel (right, closeable)**
   - Video player (manual play — no autoplay)
   - Scene analysis (collapsible)
   - Editable post copy
   - Post to LinkedIn / Test Post / Copy / Download buttons
   - Confirmation dialogs before posting
   - QR code to April's LinkedIn profile

### Other features
- **Deploy 2026 button** — always visible, shows full-screen QR code for
  `digitalocean.com/deploy` registration
- **Past posts sidebar** — click any post to reload it, shows posted status
- **History page** (`/history`) — full list view of all generated posts

---

## Pipeline steps (in order)

1. **Vision** — GPT-4.1 sees all images, describes the scene, picks optimal sequence
2. **Copy** — GPT-4.1 generates post copy, music prompt, 3 video overlay phrases
3. **Music** — MusicGen on GPU generates background track (duration = video duration)
4. **Video** — FFmpeg composes segments:
   - Hero image (no overlay) → images with text overlays → CTA (darkened hero) → brand outro
   - Audio normalized to -18 LUFS with fade-out near end
   - 1920x1080, 30fps, H.264

Total pipeline time: ~60-120 seconds (dominated by MusicGen).

---

## Copy voice guidelines (baked into system prompt)

April's voice: straightforward, factual, happy but not over-the-top.
- NO corporate buzzwords (electrifying, game-changer, synergy, etc.)
- NO motivational poster energy
- Emojis: 1-3 max, clever not generic
- Write like texting a smart friend, not writing a press release
- Always @-tag companies, always include #DigitalOcean
- 2-3 hashtags max

---

## Environment variables

| Variable | Description |
|---|---|
| `DIGITAL_OCEAN_MODEL_ACCESS_KEY` | Gradient Serverless Inference key |
| `DIGITAL_OCEAN_DATABASE_URL` | Managed Postgres connection string |
| `DIGITAL_OCEAN_GPU_DROPLET_IP` | GPU Droplet IP running MusicGen |
| `LINKEDIN_CLIENT_ID` | LinkedIn Developer app client ID |
| `LINKEDIN_CLIENT_SECRET` | LinkedIn Developer app client secret |
| `LINKEDIN_ACCESS_TOKEN` | OAuth access token (via /api/linkedin/auth) |
| `MY_LINKEDIN_PROFILE_URL` | April's LinkedIn profile URL for QR code |

Never hardcode secrets. Never commit `.env`.

---

## Notes on the Gradient skill

The `digitalocean-gradient` skill (`npx skills add ajot/digitalocean-gradient`) is
installed in this repo. Consult it for:
- Exact model IDs (see `references/models.md`)
- Async generation patterns (see `references/image-and-audio.md`)
- App Platform deployment templates (see `references/deploy-to-app-platform.md`)
