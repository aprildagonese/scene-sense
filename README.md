# Scene Sense

A multimodal AI app that turns your photos into ready-to-post LinkedIn promo videos — with AI-generated copy, music, and text overlays. Built entirely on DigitalOcean.

**Built for the [Multimodal Frontier Hackathon](https://lu.ma/multimodal-frontier) in San Francisco.**

## What it does

1. Upload 2-5 images (e.g. photos from an event)
2. Describe what you want the post to achieve
3. Scene Sense generates:
   - A promo-style video with Ken Burns effects and text overlays
   - AI-generated background music that matches the vibe
   - Platform-optimized post copy
4. Post directly to LinkedIn or copy/download everything

The AI vision model analyzes your images, picks the optimal sequence for the video, and a separate model generates a custom soundtrack. The whole pipeline runs in under 2 minutes.

## The stack

Everything runs on DigitalOcean — that's the point.

| Layer | Service | What it does |
|-------|---------|-------------|
| **Vision + Text** | [Gradient Serverless Inference](https://www.digitalocean.com/products/gradient-ai-platform) | GPT-4.1 analyzes images and generates copy, music prompts, and video overlay text |
| **Music** | [GPU Droplet](https://www.digitalocean.com/products/gpu-droplets) (RTX 4000 Ada) | Runs [MusicGen](https://github.com/facebookresearch/audiocraft) (Meta, open-weight) to generate background music from text prompts |
| **Video** | FFmpeg | Composes the final promo video: Ken Burns effects, text overlays, audio mixing |
| **Database** | [Managed PostgreSQL](https://www.digitalocean.com/products/managed-databases-postgresql) | Stores all generated posts with history |
| **Hosting** | Local / [App Platform](https://www.digitalocean.com/products/app-platform) | Runs locally for dev; deployable to App Platform via GitHub |

### Models used

- **GPT-4.1** (via Gradient Serverless) — vision analysis, copy generation, music prompt generation, image sequencing
- **MusicGen Medium** (Meta, self-hosted on GPU Droplet) — text-to-music generation

## Built with Claude Code + the Gradient AI skill

This app was built using [Claude Code](https://claude.com/claude-code) with the [DigitalOcean Gradient AI skill](https://github.com/ajot/digitalocean-gradient) installed:

```bash
npx skills add ajot/digitalocean-gradient
```

The skill provides Claude Code with context about Gradient's available models, endpoints, async generation patterns, and App Platform deployment — so it can write correct integration code without guessing.

## Running locally

### Prerequisites

- Node.js 20+
- FFmpeg installed (`brew install ffmpeg` on macOS)
- A DigitalOcean account with Gradient API access
- A GPU Droplet for MusicGen (optional — music generation is non-fatal)

### Setup

```bash
# Clone the repo
git clone https://github.com/aprildagonese/scene-sense.git
cd scene-sense

# Install dependencies
npm install

# Copy env file and fill in your values
cp .env.example .env

# Run database migration
curl http://localhost:3000/api/db/migrate

# Start the dev server
npm run dev
```

### Environment variables

```
DIGITAL_OCEAN_MODEL_ACCESS_KEY  — Gradient Serverless API key
DIGITAL_OCEAN_DATABASE_URL      — Managed PostgreSQL connection string
DIGITAL_OCEAN_GPU_DROPLET_IP    — IP of your GPU Droplet running MusicGen
LINKEDIN_CLIENT_ID              — LinkedIn Developer app client ID
LINKEDIN_CLIENT_SECRET          — LinkedIn Developer app client secret
LINKEDIN_ACCESS_TOKEN           — OAuth access token (get via /api/linkedin/auth)
MY_LINKEDIN_PROFILE_URL         — Your LinkedIn profile URL (for QR code)
```

### GPU Droplet setup (for MusicGen)

```bash
# SSH into your GPU Droplet
ssh root@your-gpu-ip

# Copy the server files
scp -r gpu-server/* root@your-gpu-ip:/opt/scene-sense/

# Run the setup script
chmod +x /opt/scene-sense/setup.sh
/opt/scene-sense/setup.sh

# Start the server
source /opt/scene-sense-venv/bin/activate
cd /opt/scene-sense && uvicorn server:app --host 0.0.0.0 --port 8000
```

### LinkedIn OAuth

1. Create a LinkedIn Developer app at https://developer.linkedin.com
2. Add "Share on LinkedIn" and "Sign In with LinkedIn using OpenID Connect" products
3. Add `http://localhost:3000/api/linkedin/callback` as a redirect URL
4. Set `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` in your `.env`
5. Visit `http://localhost:3000/api/linkedin/auth` to authorize

## Deploying to App Platform

The app includes a `.do/app.yaml` for deployment. Push to `main` and App Platform auto-deploys.

Set all environment variables in the App Platform dashboard — never commit secrets.

## License

MIT
