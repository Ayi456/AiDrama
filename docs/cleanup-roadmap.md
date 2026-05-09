# AiDrama Cleanup Roadmap

This roadmap tracks the first cleanup pass after importing the project from another repository. The goal is to make the repository maintainable without changing product behavior in large, risky batches.

## Current Baseline

- Backend test command: `cd backend && npm test`
- Frontend build command: `cd frontend && npm run build`
- Frontend layout check: `cd frontend && npm run test:layout`
- Backend runtime port: `5679`
- Frontend dev port: `3013`
- Database: MySQL via `mysql2`
- Frontend build output: `frontend/dist-vite`

## Batch 1: Documentation And Repository Hygiene

Status: completed

Scope:

- Rewrite README around the current TypeScript, MySQL, Vite, and Hono implementation.
- Update `CLAUDE.md` so future agents do not follow stale SQLite or Nuxt assumptions.
- Add `.env.example` with non-secret placeholders.
- Update `configs/config.example.yaml` and local `configs/config.yaml` to match current ports and MySQL naming.
- Adjust `.gitignore` so source docs and scripts can be tracked, while generated deployment artifacts stay ignored.
- Fix Dockerfile assumptions that still reference legacy frontend output paths.
- Pass root `.env` into the Docker Compose service for MySQL runtime config.

Verification:

- `cd backend && npm test`
- `cd frontend && npm run test:layout`
- `cd frontend && npm run build`

## Batch 2: Secrets And Source Ownership

Status: documented; owner action required

Scope:

- Confirm no real credentials are tracked.
- Rotate any credentials that came from the upstream repository or were exposed locally.
- Add or confirm the project license before public redistribution or commercial use.
- Decide whether `origin` should continue pointing to the upstream repository or be replaced with the maintained remote.
- Document handoff decisions in `docs/repository-handoff.md`.

Current result:

- Tracked sensitive-file scan only reports `data/.gitkeep`.
- Secret pattern scan has no matches outside ignored/generated files.
- Current upstream remotes and license gap are documented in `docs/repository-handoff.md`.
- Final remote replacement, license confirmation, and credential rotation require owner decisions.

Verification:

- `git status --short --ignored`
- `git ls-files | rg "env|config|deploy|data"`
- Manual review of `.env`, deployment config, and README license notes.

## Batch 3: Frontend Type Cleanup

Status: in progress; baseline established

Scope:

- Add a frontend `typecheck` script.
- Replace high-value `any` types in `frontend/src/composables/useApi.ts`.
- Introduce shared API response and domain types only where they reduce repeated unsafe casts.
- Keep `strict: false` until the highest-risk composables are typed.

Current result:

- `frontend/package.json` has `npm run typecheck`.
- `vue-tsc` and `@types/node` are installed as dev dependencies.
- `frontend/src/composables/useApi.ts` has first-pass API envelope, request body, upload, grid, generation, and config types.

Verification:

- `cd frontend && npm run typecheck`
- `cd frontend && npm run build`
- `cd frontend && npm run test:layout`

## Batch 4: Backend Compatibility Cleanup

Status: completed

Scope:

- Review `backend/src/db/index.ts` SQLite compatibility helpers and keep only compatibility that is still used.
- Update stale comments in schema and database bootstrap code.
- Add focused tests before changing database helper behavior.

Current result:

- Query helper behavior is extracted to `backend/src/db/query-helpers.ts`.
- `backend/src/db/index.ts` no longer carries SQLite-named helper code inline.
- `backend/src/db/__tests__/query-helpers.test.ts` locks `all()` and `run()` helper behavior.
- `backend/src/db/schema.ts` now describes the current MySQL schema.
- Residual scan for `installSqliteCompatMethods`, `normalizeRunResult`, `CompatRunResult`, `SQLite`, `better-sqlite`, `WAL`, and `GORM` in backend source returns no matches.

Verification:

- `cd backend && npm test`

## Batch 5: Deployment Cleanup

Status: completed

Scope:

- Keep SCF source templates and scripts tracked.
- Keep generated `deploy/scf/` and `deploy/*.zip` ignored.
- Verify Docker and SCF packaging paths match `frontend/dist-vite`, `backend/dist`, and root `skills/`.

Current result:

- `node scripts/build-scf.mjs` assembles `deploy/scf/` successfully against the current Vite and backend build outputs.
- `scripts/package-scf.ps1 -SkipBuild` validates and zips the artifact successfully.
- The generated SCF bundle now keeps a single dependency manifest at `deploy/scf/package.json`, instead of duplicating `backend/package.json` and `backend/package-lock.json`.
- Docker verification is still deferred in this environment because the local `docker` CLI is unavailable.

Verification:

- `docker build -t aidrama:cleanup-check .`
- `node scripts/build-scf.mjs`
- `powershell -ExecutionPolicy Bypass -File scripts/package-scf.ps1 -SkipBuild`

Only run deployment verification when Docker, SCF tooling, and network access are available.

## Batch 6: Backend Utility Cleanup

Status: completed

Scope:

- Remove low-value `any` usage in shallow backend response helpers where the runtime shape is already generic.
- Replace mojibake comments in utility files with readable source comments.
- Add focused tests before tightening helper behavior.

Current result:

- `backend/src/utils/transform.ts` now uses a dedicated key normalizer that handles acronym-heavy keys like `imageURL` and `apiKeyID`.
- `backend/src/utils/transform.ts` no longer carries `Record<string, any>` in its public surface.
- `backend/src/utils/public-asset.ts` now uses `Record<string, unknown>` instead of `Record<string, any>` while preserving existing asset presentation behavior.
- `backend/src/utils/__tests__/transform.test.ts` locks the intended snake-case conversion and non-mutation behavior.

Verification:

- `cd backend && npm test`

## Batch 7: Backend Agent Result Normalization Cleanup

Status: completed

Scope:

- Harden agent result normalization against malformed provider payloads.
- Replace `any`-based agent normalization inputs with explicit `unknown` handling.
- Add regression tests before tightening normalization behavior.

Current result:

- `backend/src/agents/result-normalizer.ts` now guards `toolCalls`, `toolResults`, and `text` before reading them.
- Missing tool result payloads are normalized to the string `'null'` instead of leaking `undefined`.
- `backend/src/routes/__tests__/agent-normalize.test.ts` now covers malformed non-array tool collections and missing tool result payloads.

Verification:

- `cd backend && npm test`

## Batch 8: Backend Response Helper Cleanup

Status: completed

Scope:

- Add direct tests for shared JSON response helpers.
- Keep API response envelopes stable while removing low-value `any` usage.
- Tighten shared helpers before touching route-level error handling.

Current result:

- `backend/src/utils/__tests__/response.test.ts` now locks the 200/201 success envelopes and 400/404/500 error envelopes.
- `backend/src/utils/response.ts` now uses generic success payload typing instead of `any`.
- Shared success helpers still normalize omitted or explicit `undefined` payloads to `null`.

Verification:

- `cd backend && npm test`

## Batch 9: Backend Agent Factory Cleanup

Status: completed

Scope:

- Extract testable agent factory helper logic from the Mastra/DB-heavy agent constructor.
- Tighten agent type validation at the route boundary.
- Remove `any` usage from model selection and tool dispatch in `backend/src/agents/index.ts`.

Current result:

- `backend/src/agents/agent-factory-helpers.ts` now owns model-name fallback, instruction merging, and tool factory dispatch.
- `backend/src/agents/__tests__/agent-factory.test.ts` locks those helper behaviors without importing the DB-backed agent module.
- `backend/src/agents/index.ts` uses provider setting types from `@ai-sdk/anthropic` and `@ai-sdk/openai` instead of `as any`.
- `backend/src/routes/agent.ts` now uses `isValidAgentType()` so string route params are narrowed before agent execution, and its agent execution catch path handles `unknown` errors without `any`.

Verification:

- `cd backend && npm test`

## Batch 10: Architecture Identity Transformation

Status: in progress

Scope:

- Document the architecture transformation goal beyond basic maintainability.
- Make AiDrama's code identity explicit through project-owned module boundaries,
  naming, prompts, and workflow language.
- Start with the backend agent runtime because it contained the highest-signal
  imported-repository residue: a large mixed factory with embedded default prompts.

Current result:

- `docs/architecture-transformation-plan.md` now defines the target architecture
  tracks for agents, media pipeline, frontend studio workflow, and deployment
  ownership.
- `backend/src/agents/presets.ts` now owns AiDrama agent types, display names,
  default instructions, and type validation helpers.
- `backend/src/agents/index.ts` is reduced to runtime assembly: DB config lookup,
  model resolution, skill merge, tool attachment, and Mastra `Agent` creation.
- The default backend agent prompts have been rewritten as readable AiDrama-owned
  workflow instructions instead of inherited generic prompt blocks.
- `backend/src/agents/__tests__/agent-presets.test.ts` locks preset keys, names,
  validation behavior, and a regression guard against unreadable mojibake defaults.
- `backend/src/routes/agentConfigs.ts` now uses explicit agent config request/update
  body types instead of a route-level `Record<string, any>` patch object.
- `backend/src/agents/tools/script-tools.ts` now presents AiDrama-owned screenplay
  rewrite guidance to the model instead of inherited generic wording.
- `backend/src/agents/tools/storyboard-tools.ts` now types storyboard update patches
  through the Drizzle storyboards insert shape instead of `Record<string, any>`.
- `backend/src/agents/visual-prompt-policy.ts` now owns AiDrama visual prompt
  composition for character, scene, and grid prompts.
- `backend/src/agents/tools/grid-prompt-tools.ts` and
  `backend/src/agents/tools/storyboard-tools.ts` now reuse the shared visual prompt
  policy instead of carrying duplicated grid prompt generation rules inside tool
  factories.
- `backend/src/agents/__tests__/visual-prompt-policy.test.ts` locks the visual
  prompt policy, including exact panel counts, first/last alternation, reference
  legend propagation, and multi-reference behavior.
- `backend/src/services/media-generation-records.ts` now owns media generation
  record loading and build-request log context shape for image and video jobs.
- `backend/src/services/image-generation.ts` and
  `backend/src/services/video-generation.ts` now use the shared record boundary
  instead of hand-reading `rows[0]` and inlining build-request context payloads.
- `backend/src/services/__tests__/media-generation-records.test.ts` locks missing
  record handling, first-row selection, and request context payload shape.
- `backend/src/services/media-generation-enqueue.ts` now owns image/video enqueue
  row construction, default handling, and enqueue log payload shape.
- `backend/src/services/image-generation.ts` and
  `backend/src/services/video-generation.ts` now use the enqueue policy instead of
  inlining insert values, provider/model logging payloads, image size fallback, or
  video reference-list serialization at the service entrypoint.
- `backend/src/services/__tests__/media-generation-enqueue.test.ts` locks image and
  video enqueue row defaults, start-log context, and sanitized config payload shape.
- `backend/src/services/media-publication.ts` now owns storyboard media publication
  patch rules for generated images and videos.
- `backend/src/services/image-generation.ts` and
  `backend/src/services/video-generation.ts` now call the media publication policy
  instead of embedding storyboard field selection inside provider completion code.
- `backend/src/services/media-publication.ts` now also owns character portrait and
  scene artwork publication patches after generated images are completed.
- `backend/src/services/image-generation.ts` now uses media publication patches for
  storyboard, character, and scene owner-record updates after image completion.
- `backend/src/services/__tests__/media-publication.test.ts` locks image frame target
  selection, video duration patch behavior, character portrait patch behavior, and
  scene completion patch behavior.
- `backend/src/services/media-reference-resolver.ts` now owns media reference parsing
  and resolution for local static image references, remote references, data URLs,
  and video/audio references that need COS publication before provider submission.
- `backend/src/services/media-reference-resolver.ts` now also owns the video
  generation reference bundle boundary, resolving image, first/last frame,
  reference image, reference video, and reference audio channels into one provider
  input object.
- `backend/src/services/image-generation.ts` and
  `backend/src/services/video-generation.ts` now use the shared media reference
  resolver instead of carrying separate reference parsing implementations.
- `backend/src/services/__tests__/media-reference-resolver.test.ts` locks JSON-array
  parsing, stored string parsing, reference dedupe, local static image compression,
  failed-reference filtering, and static media COS publication behavior.
- `backend/src/services/media-request-assembly.ts` now owns image/video generate
  request assembly: legacy record fields plus resolved references become normalized
  job specs and provider adapter requests in one tested boundary.
- `backend/src/services/image-generation.ts` and
  `backend/src/services/video-generation.ts` now call the shared request assembly
  module instead of directly invoking provider-spec builders and adapter
  `buildGenerateRequest` with hand-built records.
- `backend/src/services/__tests__/media-request-assembly.test.ts` locks that resolved
  image, video, and audio references are the values passed into normalized specs and
  provider requests.
- `backend/src/services/media-result-interpretation.ts` now owns provider generate
  and poll result classification for image URL completion, Gemini base64 completion,
  async task handoff, failed polls, and continue decisions.
- `backend/src/services/media-result-interpretation.ts` now treats async provider
  responses without task ids and video generate responses without output URLs as
  explicit missing-output decisions, preventing undefined task ownership from
  leaking into generation services.
- `backend/src/services/image-generation.ts` and
  `backend/src/services/video-generation.ts` now consume provider result decisions
  instead of directly calling adapter `parseGenerateResponse`, `parsePollResponse`,
  or `extractImageBase64` inside orchestration code.
- `backend/src/services/__tests__/media-result-interpretation.test.ts` locks sync
  URL, sync base64, async task, missing-output, poll failure, and video result
  classification behavior.
- `backend/src/services/media-provider-transport.ts` now owns provider JSON HTTP
  submission, timeout signal attachment, response parsing, and stable provider API
  error typing.
- `backend/src/services/image-generation.ts` and
  `backend/src/services/video-generation.ts` now use the provider transport for
  generate and poll requests instead of calling `fetch` directly.
- `backend/src/services/__tests__/media-provider-transport.test.ts` locks request
  body serialization, body-less poll requests, timeout signal behavior, and typed
  provider API errors.
- `backend/src/services/media-provider-execution.ts` now owns provider submission
  as a workflow boundary: normalized request snapshots, provider request snapshots,
  transport submission, provider response snapshots, and retryable poll transport
  errors.
- `backend/src/services/media-provider-execution.ts` now prepares provider
  generation request log context and raw request payload context, keeping
  generation services focused on orchestration instead of transport metadata
  formatting.
- `backend/src/services/media-provider-execution.ts` now also owns provider poll
  request preparation and redacted `poll-request` log context shape, so image and
  video generation services no longer assemble poll transport metadata inline.
- `backend/src/services/image-generation.ts` and
  `backend/src/services/video-generation.ts` now use the provider execution
  boundary instead of hand-writing the same generate-request and poll-attempt
  persistence flows.
- `backend/src/services/__tests__/media-provider-execution.test.ts` locks provider
  exchange snapshot order, transport request forwarding, successful poll response
  snapshots, and retryable provider API poll errors.
- `backend/src/services/media-polling-loop.ts` now owns the shared delayed polling
  state machine, including attempt numbering, remaining timeout propagation,
  retry reporting, deadline exits, and final failed-attempt results.
- `backend/src/services/image-generation.ts` and
  `backend/src/services/video-generation.ts` now delegate async provider polling to
  the shared polling loop instead of carrying separate long `for` loops.
- `backend/src/services/__tests__/media-polling-loop.test.ts` locks the polling
  loop's delay-before-attempt behavior, deadline handling, and final retry failure
  behavior.
- `backend/src/services/media-job-state.ts` now owns media job snapshot
  serialization, async processing patches, failure patches, and unknown-error
  normalization.
- `backend/src/services/media-job-state.ts` now exposes a media job snapshot
  persistor factory, so image and video generation services reuse one tested
  snapshot patch boundary instead of rebuilding provider snapshot patches inline.
- `backend/src/services/media-job-state.ts` now owns provider async task handoff:
  processing-state patch creation plus `poll-start` log context, so generation
  services no longer assemble task ownership state inline after provider submit.
- `backend/src/services/media-job-state.ts` now also owns detached background job
  error logging, process failure logging, and poll timeout failure logging plus
  failure patch persistence coordination through tested media job failure
  boundaries.
- `backend/src/services/image-generation.ts` and
  `backend/src/services/video-generation.ts` now use the shared media job state
  policy instead of carrying local `toJson`, `err.message`, detached job error
  logging, process failure logging, poll-timeout logging, and status patch helpers.
- `backend/src/services/__tests__/media-job-state.test.ts` locks JSON snapshot
  persistence, circular-payload fallback, processing patches, failure patch
  normalization, detached job error logging, process failure recording, and
  timeout-prefixed failure recording.
- `backend/src/services/media-completion.ts` now owns generated asset publication
  fallback and completed image/video generation row patches.
- `backend/src/services/image-generation.ts` and
  `backend/src/services/video-generation.ts` now use the shared completion policy
  for COS fallback and generation row completion fields.
- `backend/src/services/media-completion.ts` now also owns generated image and
  video materialization, so URL downloads and Gemini base64 writes enter the same
  tested completion boundary.
- `backend/src/services/media-completion.ts` now owns generated image/video
  completion orchestration: materialization, COS publication fallback, generation
  row completion patches, owner-record publication patches, and completion logs.
- `backend/src/services/vidu-webhook-completion.ts` now owns Vidu webhook video
  completion as a tested boundary that reuses generated video completion instead
  of duplicating download, COS publication, generation row patching, storyboard
  patching, and webhook success logging in the route.
- `backend/src/routes/webhooks.ts` now delegates successful Vidu callbacks to the
  webhook completion boundary and no longer carries mojibake header comments or
  inline completion persistence rules.
- `backend/src/services/media-generation-persistence.ts` now owns image/video
  generation persistence callback factories, including provider snapshots,
  processing handoff patches, failure patches, completion patches, and owner-record
  publication callbacks.
- `backend/src/services/image-generation.ts` and
  `backend/src/services/video-generation.ts` now use DB-bound persistence factories
  instead of carrying repeated `db.update(schema.*Generations)` closures in the
  orchestration flow.
- `backend/src/services/__tests__/media-generation-persistence.test.ts` locks image
  and video persistence callback forwarding without importing the live database.
- `backend/src/services/merge-job-state.ts` now owns episode merge record
  construction, replacement patches, completion patches, failure patches, episode
  video patches, and DB-bound persistence helpers.
- `backend/src/services/merge-ffmpeg-execution.ts` now owns FFmpeg copy/transcode
  strategy execution, fallback warning behavior, timeout handling, and throttled
  progress logging.
- `backend/src/services/ffmpeg-merge.ts` now reads as the episode export
  orchestration flow: load clips, clear prior merge, restore inputs, delegate
  FFmpeg execution, publish output, and delegate merge completion state.
- `backend/src/services/__tests__/merge-job-state.test.ts` and
  `backend/src/services/__tests__/merge-ffmpeg-execution.test.ts` lock merge record
  policy, injected persistence forwarding, copy fallback, stale output cleanup, and
  final FFmpeg failure behavior.
- `backend/src/services/compose-job-state.ts` now owns storyboard compose lifecycle
  patches and DB-bound load/update helpers for single-shot compose jobs.
- `backend/src/services/compose-ffmpeg-execution.ts` now owns compose FFmpeg output
  option planning, source-audio detection, silent-audio injection, and command
  execution.
- `backend/src/services/ffmpeg-compose.ts` now reads as a small orchestration flow:
  load storyboard, mark processing, validate source media, delegate FFmpeg
  normalization, publish the composed asset, then mark completion or failure.
- `backend/src/services/__tests__/compose-job-state.test.ts` and
  `backend/src/services/__tests__/compose-ffmpeg-execution.test.ts` lock compose
  lifecycle patch shape, injected persistence forwarding, audio mapping, and
  silent-audio injection behavior.
- `backend/src/services/image-generation.ts` now uses one source-driven image
  completion dispatch path for sync and poll results instead of separate URL and
  base64 completion flows.
- `backend/src/services/video-generation.ts` now uses one source-driven video
  completion path instead of owning the provider video download folder rule inline.
- `backend/src/services/__tests__/media-completion.test.ts` locks upload fallback,
  generated image/video materialization, completed image patch fields, and
  completed video patch timestamps.
- `backend/src/services/adapters/types.ts` now exposes provider request bodies and
  provider response parsing through `unknown` instead of public `any`.
- `backend/src/services/adapters/vidu-video.ts`,
  `backend/src/services/adapters/ali-image.ts`, and
  `backend/src/services/adapters/ali-video.ts` now use local payload types and
  response guards instead of inherited loose adapter code.
- `backend/src/services/__tests__/adapter-contract.test.ts` locks Vidu callback
  mapping, Ali async/completed/failed/processing response parsing, first/last frame
  payload shape, and ASCII-only source for the cleaned adapter batch.
- `backend/src/routes/storyboard-route-policy.ts`,
  `backend/src/routes/video-route-policy.ts`, and
  `backend/src/routes/ai-config-route-policy.ts` now own route payload mapping,
  typed update patches, validation messages, log contexts, and unknown-error
  normalization for the cleaned route batch.
- `backend/src/routes/storyboards.ts`, `backend/src/routes/videos.ts`,
  `backend/src/routes/aiConfigs.ts`, and `backend/src/routes/upload.ts` now avoid
  loose route-level `any` and no longer carry mojibake comments or probe messages.
- `backend/src/routes/__tests__/storyboard-route-policy.test.ts`,
  `backend/src/routes/__tests__/video-route-policy.test.ts`, and
  `backend/src/routes/__tests__/ai-config-route-policy.test.ts` lock the route
  boundary behavior without importing live DB route handlers.
- `frontend/src/composables/chapter/chapterMediaTypes.ts` and
  `frontend/src/composables/chapter/chapterShotMediaPolicy.ts` now own shared
  chapter media types, shot media accessors, prompt policy, state labels, and
  video request payload construction.
- `frontend/src/composables/chapter/useChapterAssetWorkflow.ts` now owns
  character/scene image generation, replacement, batch generation, and pending
  state, reducing `useChapterMediaPipeline.ts` to a thinner orchestration layer for
  those concerns.
- `frontend/src/composables/chapter/useChapterVideoWorkflow.ts` now owns storyboard
  video generation submission, polling, pending ids, failed-video messages, and
  batch generation.
- `frontend/src/composables/chapter/useChapterExportWorkflow.ts` now owns merge
  submission, export status polling, merge state, and interval cleanup.
- `frontend/src/composables/chapter/useChapterMediaPipeline.ts` is now primarily
  the chapter studio media orchestrator, delegating shared policy, asset workflow,
  video workflow, and export workflow concerns to AiDrama-named modules.
- The cleaned frontend media pipeline files have no `any`, `Record<string, any>`,
  or `catch (...: any)` matches.
- `frontend/vite.config.ts` now explicitly pins Vite `root` to the frontend project
  directory, avoiding sandbox/realpath mismatches during Windows production builds.
- `frontend/src/composables/chapter/useChapterExportDesk.ts` now owns export panel
  selection state, merge clip detection, merge URL presentation, merge busy state,
  and merge-selection handlers.
- `frontend/src/composables/chapter/useChapterStudioConfig.ts` now owns image/video
  config loading, locked config id selection, provider/model labels, and missing
  episode config id backfill.
- `frontend/src/pages/ChapterStudioView.vue` no longer owns the export selection
  watcher or direct AI config loading/backfill logic.

Next targets:

- Continue Track C by extracting shot image preferences and reference option
  presentation from `ChapterStudioView.vue`.
- Then extract script desk and storyboard desk actions so the page becomes a route
  shell plus workflow composition.
- After the structural page-boundary tasks are done, continue a slower identity
  pass across UI appearance, product language, API naming, component boundaries,
  and public-facing docs. Structural cleanup should make the implementation
  maintainable and AiDrama-owned, but it is not by itself the final standard for
  making the project feel completely different from the imported GitHub source.
- Continue replacing inherited comments, user-facing tool messages, and helper names
  where they are touched by the remaining cleanup batches.

Verification:

- `cd backend && npm test`
