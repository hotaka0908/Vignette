# CrossTube

CrossTube is a multi-creator, YouTube-style video platform built with Next.js, Mux, Drizzle, tRPC, and Gemini.

## MVP Features

- Multi-creator upload with lightweight creator sessions.
- Invite-code gated upload flow.
- Mux direct upload, processing, playback, thumbnails, and webhooks.
- Public feed, watch pages, search, and creator studio.
- Gemini-powered title, description, metadata, thumbnails, and search ranking.
- Gemini Managed Agent ID support for default search re-ranking.
- Upstash Workflow/QStash background thumbnail generation.
- Responsive web layout for desktop and iPhone-sized screens.

## Prerequisites

- Node.js 20+
- PostgreSQL or Neon
- Mux account
- UploadThing account
- Gemini API key
- Upstash account if you enable background workflows

## Setup

```bash
npm install
cp .env.example .env
```

Configure `.env`:

```env
DATABASE_URL=your_postgres_url
NEXT_PUBLIC_APP_URL=http://localhost:3000
CROSSTUBE_INVITE_CODE=CROSSTUBE2026

MUX_TOKEN_ID=your_mux_token_id
MUX_TOKEN_SECRET=your_mux_token_secret
MUX_WEBHOOK_SECRET=your_mux_webhook_secret

UPLOADTHING_TOKEN=your_uploadthing_token
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.5-flash
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
GEMINI_MANAGED_AGENT_ID=crosstube-search-agent
GEMINI_MANAGED_AGENT_SEARCH_TIMEOUT_MS=1500
GEMINI_MANAGED_AGENT_BACKGROUND_TIMEOUT_MS=60000
GEMINI_IMAGE_TIMEOUT_MS=45000

UPSTASH_REDIS_REST_URL=your_upstash_redis_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_token
REDIS_CACHE_TIMEOUT_MS=150
UPSTASH_WORKFLOW_URL=your_upstash_workflow_url
QSTASH_TOKEN=your_qstash_token
QSTASH_CURRENT_SIGNING_KEY=your_qstash_current_signing_key
QSTASH_NEXT_SIGNING_KEY=your_qstash_next_signing_key

NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_firebase_app_id
FIREBASE_STORAGE_VIDEO_PREFIX=
FIREBASE_STORAGE_VIDEO_PATHS=
FIREBASE_AUTO_GENERATE_THUMBNAILS=true
FIREBASE_AUTO_SYNC_ON_REQUEST=true
```

## Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

- `dev` - Start the local development server.
- `build` - Build for production.
- `start` - Start the production server.
- `lint` - Run ESLint.
- `gemini:agent:create` - Create the default CrossTube managed search agent ID.
- `firebase:list` - List readable videos in Firebase Storage.
- `firebase:sync` - Sync Firebase Storage videos into CrossTube and auto-generate missing thumbnails.
