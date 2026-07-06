# CLAUDE.md

## Project Overview

AiDrama is an AI-assisted short drama production tool. It uses a TypeScript full stack: Hono for the backend API and Vue 3 + Vite for the frontend SPA.

## Structure

```text
backend/   Hono + Drizzle ORM + Mastra agents + mysql2
frontend/  Vue 3 + TypeScript + Vite, plain CSS
configs/   Local configuration templates
data/      Local generated files; database is MySQL
skills/    Agent SKILL.md definitions
scripts/   Build and deployment helpers
docs/      Specs, plans, and cleanup notes
```

## Commands

### Backend (`backend/`)

- `npm run dev` - Start dev server with tsx watch on port 5679.
- `npm start` - Start the TypeScript server on port 5679.
- `npm run build` - Compile backend TypeScript to `dist/`.
- `npm run typecheck` - Run TypeScript type checking without emit.
- `npm test` - Build and run the backend test suite.

### Frontend (`frontend/`)

- `npm run dev` - Start Vite dev server on port 3013, proxying `/api` and `/static` to 5679.
- `npm run build` - Build the SPA to `dist-vite/`.
- `npm run generate` - Alias for `npm run build`.
- `npm test` - Run unit tests under `src/**/__tests__/` plus the layout check.
- `npm run test:unit` - Run only the unit tests.
- `npm run test:layout` - Check route CSS scope rules.

## Architecture

### Backend

- **HTTP**: Hono with CORS, request logging, API routes, webhook routes, static file serving, and SPA fallback.
- **Database**: Drizzle ORM with MySQL via `mysql2`; schema is in `backend/src/db/schema.ts`.
- **Database bootstrap**: `backend/src/db/index.ts` reads `.env` or process env, creates the database if allowed, and initializes tables.
- **AI Agents**: Mastra agents using AI SDK providers.
- **Agent Types**: `script_rewriter`, `extractor`, `storyboard_breaker`, `grid_prompt_generator`.
- **File Storage**: Local filesystem under `data/static/` by default; `DATA_ROOT` and `STORAGE_PATH` override runtime paths.
- **Frontend Serving**: `backend/src/utils/runtime-paths.ts` prefers `frontend/dist-vite` unless `FRONTEND_PUBLIC_PATH` is set.

### Frontend

- **Framework**: Vue 3 + TypeScript + Vite.
- **Routing**: Vue Router.
- **API Client**: `frontend/src/composables/useApi.ts`.
- **Chapter Workflow**: Feature state is split across `frontend/src/composables/chapter/*` and `frontend/src/components/chapter/*`.
- **Styling**: Plain CSS files under `frontend/src/assets`.

## Runtime Config

- Database settings come from root `.env` or process env.
- Use `DATABASE_URL` or `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`.
- `configs/config.yaml` is ignored by Git and should contain only local settings.
- AI service configs are stored in the database table `ai_service_configs`.
- Agent configs are stored in the database table `agent_configs`.

## Cleanup Rules

- Keep cleanup batches small and verify after each batch.
- Do not commit secrets, generated media, `deploy/scf/`, or deployment zip files.
- Keep `docs/`, `scripts/`, and deployment templates trackable; they are source material.
- The frontend tsconfig has `strict: true`; keep it enabled and fix type errors instead of loosening compiler flags.
