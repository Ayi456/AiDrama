# Three-Hotspot Refactor Design

Date: 2026-07-10

## Goal

Refactor the three highest-value maintainability hotspots without changing product behavior or business rules:

1. split the frontend API client by domain;
2. separate backend database configuration, runtime objects, and bootstrap work;
3. decompose the Chapter Studio image/video workbenches and their shared CSS.

Each stage must preserve its existing public interface where practical, pass the relevant focused and full verification suites, and land as a separate Git commit. If an unambiguous defect is discovered, add a regression test before fixing it. Product changes and unrelated cleanup are out of scope.

## Baseline

The worktree is clean at the start of the refactor. The current baseline passes:

- backend `npm test`;
- frontend `npm test`;
- frontend `npm run typecheck`.

The hotspots are supported by repository evidence:

- `frontend/src/composables/useApi.ts` contains the transport, error handling, upload fallback, shared types, and every API domain in one frequently changed module;
- `backend/src/db/index.ts` contains environment parsing, database creation, table DDL, additive migrations, data backfills, pool creation, Drizzle setup, and top-level asynchronous initialization;
- `ChapterProductionVideos.vue` and `ProductionShotFrames.vue` are large orchestration and presentation components, while `production-shot-frames.css` combines image, video, grid-dialog, responsive, and historical override layers.

## Stage 1: Frontend API Client

### Architecture

Create `frontend/src/api/` with the following boundaries:

- `client.ts`: base URL, request methods, envelope parsing, credential policy, and request logging;
- `errors.ts`: unknown-error normalization and provider-specific friendly messages;
- `types.ts`: shared entity, payload, pagination, billing, configuration, and automation types;
- `auth.ts`: authentication and upload endpoints, including direct-COS upload fallback;
- `projects.ts`: drama, chapter, storyboard, character, character-asset, and scene endpoints;
- `media.ts`: image, grid, video, compose, and merge endpoints;
- `billing.ts`: wallet and payment endpoints;
- `configuration.ts`: AI configuration, agent configuration, skills, preferences, and automation endpoints.

`frontend/src/composables/useApi.ts` becomes a compatibility facade that re-exports the current public names. Existing consumers do not need a repository-wide import migration in this stage.

### Data and Error Flow

Domain modules depend on the shared client; the shared client does not depend on domains. Requests continue to send HttpOnly-cookie credentials and parse the existing `{ code, data, message }` envelope. Error message text and direct-upload-to-multipart fallback behavior remain stable.

### Verification

- retain and run the upload fallback and error normalization tests;
- add a facade/export policy test so existing imports remain supported;
- run frontend unit tests, layout tests, typecheck, and production build.

### Commit

`refactor(frontend): split API client by domain`

## Stage 2: Database Bootstrap

### Architecture

Split `backend/src/db/index.ts` into focused modules:

- `config.ts`: project root, loose `.env` loading, validation, and `PoolOptions` construction;
- `table-statements.ts`: declarative table-creation statements only;
- `migrations.ts`: `ensureColumn`, `ensureIndex`, owner backfill, billing defaults, and ordered additive migrations;
- `bootstrap.ts`: database creation, table initialization, migrations, asset URL backfill, and an idempotent readiness function;
- `runtime.ts`: synchronous MySQL pool creation, Drizzle construction, query-helper installation, and stable exports.

`index.ts` remains the compatibility entry point for `db`, `mysqlPool`, `schema`, and `DB`, and additionally exports `ensureDatabaseReady`.

### Startup Flow

Importing `db/index.ts` must construct only in-memory runtime objects; it must not connect to MySQL or run migrations. The real server entry point explicitly awaits the idempotent `ensureDatabaseReady()` before listening. Database maintenance scripts also await it before querying. Application modules can continue importing the existing `db` and `mysqlPool` bindings unchanged.

This removes database I/O from application-module import while preserving the invariant that production requests are not accepted before bootstrap completes. Initialization failures remain fatal for server startup and maintenance scripts. The optional asset URL backfill keeps its existing warning-and-continue behavior after the required schema work succeeds.

### Verification

- add unit tests for environment/config parsing and idempotent bootstrap orchestration using injected dependencies;
- add a policy test proving `db/index.ts` has no top-level initialization await;
- retain schema migration and query-helper coverage;
- run backend typecheck and the full backend test suite.

### Commit

`refactor(backend): separate database runtime and bootstrap`

## Stage 3: Chapter Studio Workbenches

### Architecture

Keep `ChapterProductionVideos.vue` and `ProductionShotFrames.vue` as feature-level orchestration shells. Move cohesive state and view regions behind explicit interfaces.

Video workbench extraction targets:

- prompt-draft persistence and per-shot dirty/saving state;
- capture-frame and multimodal-reference selection;
- media upload limits and upload state;
- result/history/billing presentation;
- settings, shot navigation, and result panels as focused child components where the boundary reduces template size without duplicating state.

Shot-image workbench extraction targets:

- prompt and negative-prompt editing;
- selected references, frame result cards, and history restoration;
- grid-tool dialog as a separate component;
- settings, shot navigation, and results as focused child components.

Shared behavior that is independent of Vue rendering belongs in typed policy/composable modules under `frontend/src/composables/chapter/`. Parent shells own state coordination and translate child events to the existing handler interface. Child components receive explicit props and emit explicit events; they do not call feature APIs directly.

### CSS Structure

Replace the monolithic stylesheet with responsibility-based files:

- `production-shot-workbench.css`: shared three-column shell, shot navigator, common cards, and common responsive rules;
- `production-shot-images.css`: image settings, references, frame results, and image-specific states;
- `production-video-workbench.css`: video references, preview, history, billing, and video-specific responsive rules;
- `production-grid-tool.css`: grid dialog, assignments, preview, and grid history.

Selectors and rendered class names stay stable during extraction. Responsive overrides move with their owning feature and keep their current cascade order. No visual redesign is included.

### Data and Error Flow

The current `state`/`handlers` contract at `ChapterProductionPanel.vue` remains the external boundary. Extracted composables return refs, computed values, and commands to their orchestration shell. Upload, save, generation, retry, and wallet navigation errors continue to use the current toast and confirmation behavior. Async work remains keyed by storyboard ID so stale completions cannot overwrite a newly selected shot.

### Verification

- add focused tests for each extracted pure policy/composable before moving behavior;
- retain prompt, reference binding, upload, frame capture, history, billing, and stale-refresh tests;
- update structural CSS tests to read the new owning files and assert the same responsive invariants;
- run frontend unit tests, layout tests, typecheck, and production build.

### Commit

`refactor(frontend): decompose chapter media workbenches`

## Completion Criteria

The refactor is complete when all three stage commits exist, the worktree is clean, backend and frontend full verification pass at the final HEAD, existing external imports and API behavior remain compatible, database bootstrap is explicit at process entry points, and the two Chapter Studio shells plus their CSS have clear responsibility boundaries with regression coverage.
