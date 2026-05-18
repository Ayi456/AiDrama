# AiDrama Architecture Transformation Plan

This document defines the cleanup phase after the imported-repository hygiene pass.
The goal is not only to make the code maintainable. The goal is to turn AiDrama into
a codebase with its own architecture, naming, module boundaries, and production
workflow, so it no longer reads like a lightly edited copy of an upstream GitHub
project.

## Objective

AiDrama should present a distinct implementation identity:

- Domain-first modules instead of broad generic files copied from upstream.
- Readable AiDrama-owned prompts, presets, docs, and workflow names.
- Thin HTTP routes that delegate to typed orchestration modules.
- Explicit boundaries between agent presets, runtime construction, tools, media jobs,
  asset persistence, and public URL presentation.
- Frontend studio modules that describe the product workflow instead of generic page
  scripts and inherited naming.
- Deployment scripts that package the current Vite, Hono, MySQL, COS, and SCF shape
  without stale assumptions.

## Transformation Principles

1. Remove upstream residue where we touch code.
   Replace mojibake text, stale comments, dead compatibility names, and vague helper
   names with current AiDrama product language.

2. Split by product responsibility.
   A file should answer one question: preset definition, agent runtime, provider
   adapter, media job, asset URL policy, or studio UI behavior. Avoid files that mix
   configuration, business rules, orchestration, and presentation.

3. Preserve behavior in small batches.
   Each batch must be covered by focused tests or existing build/type checks before
   moving to the next area.

4. Prefer explicit contracts.
   Public module exports should use named types and narrow input shapes. Avoid
   `Record<string, any>`, implicit route body shapes, and generic string dispatch
   where a typed union is available.

5. Make AiDrama's workflow visible in code.
   The code should expose the production line: script rewrite, extraction,
   storyboard breakdown, grid prompt generation, image/video generation, merge, and
   publishing.

## Identity Gap After Structural Cleanup

The current decomposition work is a necessary architecture pass, not the final
"this is a completely different product" finish line. When the planned frontend
page-boundary steps are complete, the core studio workflow should be materially
different from the imported repository at the code-architecture level: the large
page and media pipeline scripts will have been replaced by AiDrama-owned workflow
modules such as export desk, studio config, media pipeline, asset workflow, video
workflow, and export workflow.

That still does not guarantee the whole repository feels unrecognizable from the
upstream project. The remaining identity work should continue gradually in these
areas:

- Visual and interaction layer: make the studio screens, layout rhythm, component
  composition, and user path feel like AiDrama instead of a lightly rearranged
  inherited UI.
- Product language layer: replace generic naming and copy with AiDrama production
  terms such as script desk, storyboard board, shot gallery, generation queue, and
  export desk wherever those names fit the actual responsibility.
- API and route language layer: tighten endpoint, payload, and helper naming where
  legacy field compatibility is no longer required, while preserving migration
  safety.
- Component boundary layer: continue splitting broad presentation components into
  product-responsibility modules rather than only moving logic out of the page.
- Documentation and handoff layer: make README, architecture docs, and handoff
  notes describe AiDrama's current workflow directly, not as a cleanup of an
  imported codebase.

Treat this as a long-running identity backlog. Each future cleanup batch should
move one visible or architectural surface further away from upstream style without
doing risky rewrites just for appearance.

## Target Architecture Tracks

### Track A: Agent Runtime Identity

Current issue: `backend/src/agents/index.ts` still combines default prompts, DB config
lookup, provider/model selection, skill loading, tool dispatch, and Mastra Agent
construction. It also carries unreadable mojibake prompt text.

Target shape:

- `backend/src/agents/presets.ts` owns AiDrama default agent names and instructions.
- `backend/src/agents/agent-factory-helpers.ts` owns model fallback, instruction
  composition, valid type checks, and typed tool dispatch helpers.
- `backend/src/agents/index.ts` becomes the runtime factory only: load DB config,
  resolve model, merge preset + skills, attach tools, return an Agent.
- Route modules validate agent types through exported preset metadata instead of
  duplicating string lists.

First execution batch:

- Extract default prompts into `backend/src/agents/presets.ts`.
- Replace mojibake default prompts with clear AiDrama-owned instructions.
- Add tests that lock preset keys, display names, and validation behavior.
- Keep existing agent type strings stable to avoid DB and frontend migration risk.

### Track B: Media Pipeline Boundaries

Current issue: image/video generation, COS persistence, merge behavior, and public URL
presentation are partly separated but still read as service utilities rather than a
clear production pipeline.

Target shape:

- Provider adapters stay under `backend/src/services/adapters/`.
- Job orchestration gets named modules for image jobs, video jobs, merge jobs, and
  asset publication.
- COS/public URL transformation is treated as a presentation boundary, not scattered
  through route handlers.
- Tests cover provider request specs, asset URL decisions, and merge input rules.

### Track C: Frontend Studio Workflow

Current issue: the main studio page has been reduced to route loading and workflow
composition, but the broader frontend still needs a slower product-language and UI
identity pass so presentation components feel fully AiDrama-owned.

Target shape:

- `frontend/src/composables/chapter/` continues as the workflow layer.
- Studio page code delegates to script, storyboard, asset, and generation workflow
  modules.
- Component names use production language: script desk, storyboard board, shot
  gallery, generation queue, export desk.
- Shared API contracts are typed in one place, then consumed by composables.

### Track D: Deployment Ownership

Current issue: deployment cleanup has removed several stale assumptions, but the
documentation and scripts should continue to describe the current platform rather
than imported defaults.

Target shape:

- SCF packaging scripts build exactly the current backend, frontend, skills, and
  runtime bootstrap.
- Docker config references current ports and build outputs.
- Generated artifacts stay ignored; source deployment scripts stay tracked.
- Deployment docs list the exact commands and known local-environment limitations.

## Execution Order

1. Agent preset extraction and prompt rewrite.
   This is the highest-signal identity change because it removes unreadable upstream
   text and creates an AiDrama-owned agent boundary.

2. Agent route/config typing cleanup.
   Tighten request bodies and update agent config patch types after preset metadata
   is isolated.

3. Media pipeline naming pass.
   Rename and split orchestration helpers around image, video, merge, and asset
   publication boundaries without changing provider behavior.

4. Frontend studio decomposition.
   Move remaining page-level workflow logic into typed composables and product-named
   components.

5. Deployment docs finalization.
   Keep build/package scripts aligned with the refactored project layout.

## Verification

Run the smallest useful command after each batch:

- Backend behavior: `cd backend && npm test`
- Backend type-only check: `cd backend && npm run typecheck`
- Frontend contracts: `cd frontend && npm run typecheck`
- Frontend production output: `cd frontend && npm run build`
- Layout guard: `cd frontend && npm run test:layout`
- SCF package: `node scripts/build-scf.mjs`
- SCF zip validation: `powershell -ExecutionPolicy Bypass -File scripts/package-scf.ps1 -SkipBuild`

Docker and network-dependent deployment checks should run only in an environment
where Docker and external provider access are available.

## Progress Log

- 2026-05-07: Created transformation plan and started Track A with agent preset
  extraction as the first architecture-level cleanup batch.
- 2026-05-07: Continued Track B by extracting media publication, reference
  resolution, provider transport, and async polling loop boundaries from the image
  and video generation services.
- 2026-05-07: Added a shared media job state boundary for request/response
  snapshots, async task ownership, and failure persistence so generation services no
  longer own those record patch details inline.
- 2026-05-07: Added a shared media completion boundary for generated asset
  publication fallback and completed image/video generation row patches.
- 2026-05-07: Extended the media publication boundary to cover character and scene
  owner-record image updates, not only storyboard media fields.
- 2026-05-07: Added media request assembly as a tested boundary between resolved
  references, normalized provider specs, and provider adapter request construction.
- 2026-05-08: Added media result interpretation as a tested boundary between raw
  provider adapter responses and orchestration decisions for completion, async
  polling, failure, and retry continuation.
- 2026-05-08: Extended the media completion boundary to materialize generated image
  sources and route URL/base64 image completions through one source-driven dispatch
  path.
- 2026-05-08: Extended the media completion boundary to materialize generated video
  sources as well, so video completion no longer owns provider download folder
  rules inline.
- 2026-05-08: Added media provider execution as the tested boundary for generation
  exchange snapshots and provider transport submission, reducing duplicated
  request/response persistence in image and video services.
- 2026-05-08: Extended media provider execution to cover poll attempts, including
  provider response snapshots and retryable provider API errors, so image and video
  polling no longer own transport-level retry details.
- 2026-05-08: Added media generation record loading as a tested boundary for
  missing-record handling and build-request context shape, removing `rows[0]`
  plumbing from image and video generation services.
- 2026-05-08: Extended media job state with a process failure recording boundary
  for normalized error logging and failure patch persistence.
- 2026-05-08: Extended media job state with a poll timeout recording boundary that
  preserves timeout log causes while persisting timeout-prefixed failure messages.
- 2026-05-08: Added detached media job error logging as a tested job-state
  boundary for fire-and-forget generation task failures.
- 2026-05-08: Added media generation enqueue policy as a tested boundary for
  image/video insert rows, default handling, and enqueue log payload shape.
- 2026-05-08: Extended media provider execution with provider poll request
  preparation and redacted poll log context ownership, removing the last direct
  poll request assembly from image/video generation loops.
- 2026-05-08: Extended media provider execution with generation request log
  context and raw payload context preparation, so generate and poll transport
  metadata now share the same AiDrama-owned boundary.
- 2026-05-08: Added a media job snapshot persistor factory so provider exchange
  snapshots use a shared job-state patch boundary instead of service-local patch
  assembly callbacks.
- 2026-05-08: Added a media job processing handoff boundary for async provider
  task ownership, combining processing-state persistence with standard
  `poll-start` progress logging.
- 2026-05-08: Tightened media result interpretation so async provider decisions
  require task ids and missing generate outputs become explicit orchestration
  failures instead of service-level non-null assertions.
- 2026-05-08: Extended media completion into a tested completion orchestration
  boundary covering asset materialization, public URL fallback, generation row
  completion, owner-record publication, and completion logs.
- 2026-05-08: Added a video generation reference bundle boundary so provider input
  reference channels are resolved as one media pipeline step instead of being
  assembled field-by-field in the video service.
- 2026-05-08: Added a Vidu webhook completion boundary that reuses generated video
  completion for callback-driven results and thins the webhook route to request
  handling plus dependency binding.
- 2026-05-08: Added a media generation persistence boundary so image and video
  workflow services reuse tested persistence factories for provider snapshots,
  processing handoff patches, failure patches, completion patches, and owner-record
  publication callbacks.
- 2026-05-08: Added merge job state and FFmpeg execution boundaries so episode
  export orchestration no longer owns merge-row persistence, episode video patches,
  copy/transcode fallback execution, or inherited mojibake comments inline.
- 2026-05-08: Added compose job state and FFmpeg execution boundaries so
  single-storyboard compose orchestration no longer owns storyboard lifecycle
  patches, inline FFmpeg command construction, source-audio detection, or inherited
  mojibake comments inline.
- 2026-05-08: Tightened the first provider adapter cleanup batch by moving shared
  adapter request/response surfaces from public `any` to `unknown`, replacing Vidu
  and Ali adapter residue with local typed payload guards, and locking the batch
  with adapter contract tests.
- 2026-05-08: Added backend route policy boundaries for storyboard, video, and AI
  config routes, moving route payload mapping, update patch construction, probe
  messaging, and unknown-error normalization out of Hono handlers.
- 2026-05-08: Started frontend studio workflow decomposition by extracting shared
  chapter media types, shot media policy, and character/scene asset workflow state
  out of `useChapterMediaPipeline.ts`.
- 2026-05-08: Stabilized frontend Vite builds in the Codex Windows workspace by
  pinning Vite root to the real frontend project directory instead of relying on a
  sandbox-mapped current working directory.
- 2026-05-08: Completed the frontend media pipeline decomposition by extracting
  storyboard video generation and episode export polling into
  `useChapterVideoWorkflow.ts` and `useChapterExportWorkflow.ts`, leaving
  `useChapterMediaPipeline.ts` as the chapter studio media orchestrator.
- 2026-05-08: Started the next frontend page-boundary pass by extracting export
  panel selection state into `useChapterExportDesk.ts` and AI config loading,
  locked config labels, and episode config backfill into
  `useChapterStudioConfig.ts`.
- 2026-05-18: Completed the Chapter Studio page-boundary pass by extracting shot
  image preferences, script desk actions, storyboard desk actions, and production
  panel state/handler assembly into AiDrama-named chapter composables. The route
  page now acts as the studio shell plus workflow composition layer.
- 2026-05-18: Continued non-UI frontend type cleanup by replacing loose
  `useChapterStudioNavigation.ts` input arrays with shared chapter domain types and
  adding a residual test that guards against reintroducing `any` in that workflow
  boundary.
- 2026-05-18: Extended the non-UI type cleanup to `useChapterGridTool.ts`, replacing
  loose grid/history/cache `any` usage with local chapter grid types and a residual
  scan test for that workflow boundary.
- 2026-05-18: Continued the non-UI type cleanup into `useChapterImageViewer.ts`,
  replacing the loose gallery viewer payload parameter with an explicit local type
  and a residual scan test.
- 2026-05-18: Extended the non-UI type cleanup to `useAgent.ts` and
  `useImageGenerationMonitor.ts`, replacing loose API and poll result `any`
  handling with typed responses and `unknown` error handling.
- 2026-05-18: Added a backend route body and error cleanup batch for the simpler
  route handlers and shared middleware, including typed merge selection helpers
  and residual tests for the new route contracts.
