# AiDrama

AiDrama is a TypeScript full-stack tool for AI-assisted short drama production. It covers script rewriting, character and scene extraction, storyboard generation, image generation, video generation, and clip merging.

The current codebase is a Vue 3 SPA plus a Hono backend. Runtime data is stored in MySQL, while generated media files are stored under `data/static` by default or can be moved to COS for production.

## Current Stack

| Area | Stack |
|---|---|
| Frontend | Vue 3, Vue Router, Vite, TypeScript, plain CSS, Lucide icons |
| Backend | Node.js 20+, Hono, Drizzle ORM, mysql2, Mastra, AI SDK |
| Media | FFmpeg, fluent-ffmpeg, Sharp |
| Storage | Local filesystem by default, Tencent COS helpers for production assets |
| Deployment | Single Hono server, Docker, Tencent SCF Web Function packaging |

## Repository Layout

```text
backend/    Hono API, database schema, AI agents, media services
frontend/   Vue 3 SPA, Vite build output in frontend/dist-vite
configs/    Local config templates; runtime database config comes from env vars
data/       Local generated files and development data
skills/     Agent skill definitions loaded by the backend
scripts/    Build and deployment helper scripts
docs/       Specs, implementation plans, and cleanup notes
deploy/     Deployment templates and generated deployment artifacts
```

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20+ | Required by both frontend and backend |
| npm | 9+ | Lockfiles are committed for both apps |
| MySQL | 8.x or compatible | The backend creates missing tables on startup |
| FFmpeg | 4+ | Required for video compose and merge workflows |

## Environment

Create a local `.env` from `.env.example` and fill in real values:

```bash
cp .env.example .env
```

The backend reads database settings from the project root `.env` file or from process environment variables. Use either a connection string or separate MySQL fields.

```bash
# Option A
DATABASE_URL=mysql://user:password@127.0.0.1:3306/AiDrama

# Option B
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=AiDrama
```

Useful runtime variables:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `5679` | Backend HTTP port |
| `HOST` | `0.0.0.0` | Backend bind address |
| `DATA_ROOT` | `./data` | Root for local runtime files |
| `STORAGE_PATH` | `./data/static` | Root for uploaded and generated media |
| `FRONTEND_PUBLIC_PATH` | `frontend/dist-vite` or `public` | Static frontend directory served by backend |
| `TENCENT_SECRET_ID` | empty | COS credential, optional |
| `TENCENT_SECRET_KEY` | empty | COS credential, optional |
| `TENCENT_COS_BUCKET` | empty | COS bucket, optional |
| `TENCENT_COS_REGION` | empty | COS region, optional |

AI provider API keys and model parameters are configured in the web UI under Settings and stored in the database.

## Local Development

Install dependencies:

```bash
cd backend
npm install

cd ../frontend
npm install
```

Start the backend:

```bash
cd backend
npm run dev
```

Start the frontend:

```bash
cd frontend
npm run dev
```

Development URLs:

| Service | URL |
|---|---|
| Frontend | `http://localhost:3013` |
| Backend API | `http://localhost:5679/api/v1` |
| Health check | `http://localhost:5679/api/v1/health` |

The Vite dev server proxies `/api` and `/static` to `http://localhost:5679`.

## Build And Verification

Backend:

```bash
cd backend
npm run typecheck
npm test
```

Frontend:

```bash
cd frontend
npm run test:layout
npm run build
```

`npm run build` in `frontend/` writes the SPA to `frontend/dist-vite`. The backend serves that directory in single-service production mode.

## Production Run

Build the frontend first:

```bash
cd frontend
npm run generate
```

Start the backend:

```bash
cd ../backend
npm start
```

Then open `http://localhost:5679`.

## Docker

The Docker image builds the Vite frontend and runs one Hono server on port `5679`.

```bash
docker compose up -d
docker compose logs -f
```

`docker-compose.yml` reads the root `.env` file through `env_file`, so database variables must be filled before starting the container.

For a manual image run:

```bash
docker build -t aidrama:latest .
docker run -d --name aidrama -p 5679:5679 \
  --env-file .env \
  -v "$(pwd)/data:/app/data" \
  aidrama:latest
```

## Tencent SCF Deployment

Create the SCF bundle:

```bash
node scripts/build-scf.mjs
```

Deploy with the Serverless Cloud Framework:

```bash
scf deploy
```

SCF notes:

- The generated bundle is written to `deploy/scf/`.
- `serverless.yml` uses Node.js 20.19 and port `9000`.
- Configure `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` in cloud environment variables.
- Use `/tmp` paths for `DATA_ROOT` and `STORAGE_PATH` on SCF.
- Do not commit cloud credentials, database passwords, or generated media files.

## Maintenance Notes

- This repository was imported from another upstream source. Confirm the upstream license before public redistribution or commercial use.
- See `docs/repository-handoff.md` before changing remotes, publishing the fork, or deploying with production credentials.
- Keep `.env`, `configs/config.yaml`, generated media, and deployment bundles out of Git.
- Track source documents, source scripts, and deployment templates. Ignore generated artifacts under `deploy/scf/` and `deploy/*.zip`.
- Prefer small cleanup batches with verification after each batch. Current baseline checks are `backend/npm test`, `frontend/npm run build`, and `frontend/npm run test:layout`.
