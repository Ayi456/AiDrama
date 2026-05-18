# AiDrama Architecture Cleanup Execution Plan

> This document tracks the remaining architecture-identity cleanup after the first
> imported-repository hygiene pass. Execute each batch with TDD where behavior can
> be isolated, then run the listed verification commands before moving on.

## Goal

Make AiDrama visibly different from the imported GitHub codebase by continuing to
replace broad copied service files with AiDrama-owned workflow boundaries,
production language, and typed contracts.

## Execution Order

### 1. Vidu Webhook Completion Boundary

Status: completed on 2026-05-08.

Purpose:

- Reuse the shared generated-video completion flow for Vidu webhook callbacks.
- Remove duplicated download, COS publication, generation-row patch, storyboard
  update, and completion logging from `backend/src/routes/webhooks.ts`.
- Keep webhook route behavior thin: parse callback, load record, delegate success
  or failure handling, return API response.

Files:

- Create `backend/src/services/vidu-webhook-completion.ts`.
- Create `backend/src/services/__tests__/vidu-webhook-completion.test.ts`.
- Modify `backend/src/routes/webhooks.ts`.
- Modify `backend/package.json` test script.

Verification:

- `cd backend && npm test`
- `rg -n "downloadFile|uploadStaticAssetToCos|videoUrl: publicUrl|vidu-video-updated" backend/src/routes/webhooks.ts backend/src/services`
- `git diff --check`

### 2. Media Generation Dependency Binding

Status: completed on 2026-05-08.

Purpose:

- Move repeated DB persistence closures from `image-generation.ts` and
  `video-generation.ts` into local dependency factory modules.
- Keep generation services focused on workflow sequencing rather than Drizzle
  binding details.

Files:

- Create `docs/superpowers/plans/2026-05-08-media-generation-persistence.md`.
- Create `backend/src/services/media-generation-persistence.ts`.
- Add `backend/src/services/__tests__/media-generation-persistence.test.ts`.
- Modify `backend/src/services/image-generation.ts`.
- Modify `backend/src/services/video-generation.ts`.

Checklist:

- Completed: wrote and ran the persistence factory contract test before production
  code.
- Completed: added pure image/video persistence factories for snapshot,
  processing, timeout, completion, and owner-publication callbacks.
- Completed: added DB-bound default factories so generation services do not own
  repeated `db.update(schema.*Generations)` closures.
- Completed: replaced local snapshot persistor helpers in image/video generation
  services.
- Completed: verified residual direct generation-row update closures are gone from
  the workflow services.

Verification:

- `cd backend && npm test`
- `rg -n "db.update\\(schema\\.(imageGenerations|videoGenerations)" backend/src/services/image-generation.ts backend/src/services/video-generation.ts`
- `git diff --check`

### 3. Merge Pipeline Boundary Pass

Status: completed on 2026-05-08.

Purpose:

- Split `ffmpeg-merge.ts` into record policy, input selection, FFmpeg execution,
  and completion/failure persistence.
- Keep merge behavior stable while making the episode export pipeline read like an
  AiDrama production workflow.

Files:

- Create `docs/superpowers/plans/2026-05-08-merge-job-state-boundary.md`.
- Create `backend/src/services/merge-job-state.ts`.
- Create `backend/src/services/merge-ffmpeg-execution.ts`.
- Create `backend/src/services/__tests__/merge-job-state.test.ts`.
- Create `backend/src/services/__tests__/merge-ffmpeg-execution.test.ts`.
- Modify `backend/src/services/ffmpeg-merge.ts`.
- Modify `backend/package.json`.

Verification:

- `cd backend && npm test`
- `rg -n "db\\.|schema\\.|eq\\(|ffmpeg\\(|ffmpegMergeStrategies|ffmpegMergeOutputOptions|resolveFfmpegMergeTimeoutMs" backend/src/services/ffmpeg-merge.ts`
- `git diff --check`

### 4. Compose Pipeline Boundary Pass

Status: completed on 2026-05-08.

Purpose:

- Apply the same split to `ffmpeg-compose.ts` for single-storyboard compose jobs.
- Remove stale inherited comments and make compose lifecycle naming consistent
  with merge lifecycle naming.

Files:

- Create `docs/superpowers/plans/2026-05-08-compose-pipeline-boundary.md`.
- Create `backend/src/services/compose-job-state.ts`.
- Create `backend/src/services/compose-ffmpeg-execution.ts`.
- Create `backend/src/services/__tests__/compose-job-state.test.ts`.
- Create `backend/src/services/__tests__/compose-ffmpeg-execution.test.ts`.
- Modify `backend/src/services/ffmpeg-compose.ts`.
- Modify `backend/package.json`.

Verification:

- `cd backend && npm test`
- `rg -n "db\\.|schema\\.|eq\\(|ffmpeg\\(|hasAudioStream|[^\\x00-\\x7F]" backend/src/services/ffmpeg-compose.ts`
- `git diff --check`

### 5. Provider Adapter Cleanup

Status: completed on 2026-05-08.

Purpose:

- Replace mojibake comments in `backend/src/services/adapters/`.
- Reduce provider adapter `any` usage where response shapes are stable enough to
  type without overfitting each vendor.
- Keep provider request payload behavior unchanged.

Files:

- Create `docs/superpowers/plans/2026-05-08-provider-adapter-cleanup.md`.
- Create `backend/src/services/__tests__/adapter-contract.test.ts`.
- Modify `backend/src/services/adapters/types.ts`.
- Modify provider adapters incrementally, starting with `vidu-video.ts`,
  `ali-image.ts`, and `ali-video.ts`.
- Modify `backend/package.json`.

Current result:

- `ProviderRequest.body` and adapter parse/extract surfaces now use `unknown`
  instead of public `any`, making provider boundaries explicit.
- `vidu-video.ts`, `ali-image.ts`, and `ali-video.ts` now use local response
  guards and typed request bodies instead of inherited loose payload handling.
- `adapter-contract.test.ts` locks Vidu callback mapping, Ali task lifecycle
  parsing, Ali first/last-frame payload shape, and ASCII-only source for the
  cleaned adapter batch.
- Existing request assembly and provider spec tests now cast provider bodies at
  the test boundary instead of depending on public `any`.

Verification:

- `cd backend && npm test`
- `rg -n "any|[^\\x00-\\x7F]" backend/src/services/adapters/types.ts backend/src/services/adapters/vidu-video.ts backend/src/services/adapters/ali-image.ts backend/src/services/adapters/ali-video.ts`
- `git diff --check`

### 6. Backend Route Boundary Cleanup

Status: completed on 2026-05-08.

Purpose:

- Thin routes by moving request patch building and repeated `any` error handling
  into services or typed request helpers.
- Prioritize high-traffic routes that still combine validation, persistence, and
  logging in one file.

Files:

- Modify `backend/src/routes/aiConfigs.ts`.
- Modify `backend/src/routes/storyboards.ts`.
- Modify `backend/src/routes/videos.ts`.
- Modify `backend/src/routes/upload.ts`.

Current result:

- `storyboard-route-policy.ts` now owns storyboard create values, update patch
  mapping, binding selection, and create-log context for `storyboards.ts`.
- `video-route-policy.ts` now owns video generate request mapping, route log
  context, prompt validation, and unknown-error normalization for `videos.ts`.
- `ai-config-route-policy.ts` now owns AI config create/update mapping, service
  type validation, probe payload messages, and unknown-error normalization for
  `aiConfigs.ts`.
- `upload.ts` now types the shared upload helper with Hono `Context` instead of
  `any`.
- Target route files no longer contain loose `any`, `Record<string, any>`,
  `catch (...: any)`, or mojibake source text.

Verification:

- `cd backend && npm test`
- `rg -n "any|Record<string, any>|catch \\(.*: any\\)|[^\\x00-\\x7F]" backend/src/routes/aiConfigs.ts backend/src/routes/storyboards.ts backend/src/routes/videos.ts backend/src/routes/upload.ts`
- `git diff --check`

### 7. Frontend Studio Workflow Decomposition

Status: completed on 2026-05-08.

Purpose:

- Split `frontend/src/composables/chapter/useChapterMediaPipeline.ts` into
  product-named workflow composables.
- Replace broad `any` contracts with shared chapter/studio domain types.
- Continue moving UI language toward AiDrama's production workflow.

Files:

- Modify `frontend/src/composables/chapter/useChapterMediaPipeline.ts`.
- Create focused composables under `frontend/src/composables/chapter/` as needed.
- Extend or add frontend type/build checks only where they currently exist.

Current result:

- `chapterMediaTypes.ts` now owns typed chapter media entities, frame history,
  replacement payloads, video reference overrides, video payloads, and shared
  unknown-error message normalization.
- `chapterShotMediaPolicy.ts` now owns storyboard media accessors, reference
  parsing, shot image prompt construction, default video prompt construction,
  state label/class policy, reference summaries, and video generate payload
  construction.
- `useChapterAssetWorkflow.ts` now owns character/scene image generation,
  replacement, batch generation, and pending/replacing state.
- `useChapterVideoWorkflow.ts` now owns storyboard video generation submission,
  polling, failed-message state, pending ids, and batch video generation.
- `useChapterExportWorkflow.ts` now owns episode merge/export submission, merge
  status polling, in-flight state, and interval cleanup.
- `useChapterMediaPipeline.ts` now delegates those policies/workflows while
  preserving the public state and handler names consumed by the studio page and
  chapter components.
- The cleaned frontend media pipeline files have no `any`, `Record<string, any>`,
  or `catch (...: any)` matches in the current target scan.

Verification:

- `cd frontend && npm run typecheck`
- `cd frontend && npm run build`
- `cd frontend && npm run test:layout`
- `rg -n "any|Record<string, any>|catch \\(.*: any\\)" frontend/src/composables/chapter/useChapterMediaPipeline.ts frontend/src/composables/chapter/useChapterVideoWorkflow.ts frontend/src/composables/chapter/useChapterExportWorkflow.ts`
- `git diff --check`

### 8. Frontend Page Boundary Cleanup

Status: completed on 2026-05-18.

Purpose:

- Continue Track C after the media pipeline split by thinning
  `frontend/src/pages/ChapterStudioView.vue`.
- Move page-owned workflow state into product-named chapter composables while
  preserving existing child component contracts.

Files:

- Create `frontend/src/composables/chapter/useChapterExportDesk.ts`.
- Create `frontend/src/composables/chapter/useChapterStudioConfig.ts`.
- Create `frontend/src/composables/chapter/useChapterShotImagePreferences.ts`.
- Create `frontend/src/composables/chapter/useChapterScriptDesk.ts`.
- Create `frontend/src/composables/chapter/useChapterStoryboardDesk.ts`.
- Create `frontend/src/composables/chapter/useChapterProductionPanelBridge.ts`.
- Modify `frontend/src/pages/ChapterStudioView.vue`.

Current result:

- `useChapterExportDesk.ts` now owns export panel clip selection, merge clip
  detection, merge URL presentation, merge busy state, and merge-selection
  handlers.
- `useChapterStudioConfig.ts` now owns image/video config loading, locked config
  id selection, provider/model labels, and missing episode config id backfill.
- `useChapterShotImagePreferences.ts` now owns shot image frame mode, aspect
  ratio/size presets, local preference persistence, visual character filtering, and
  shot reference option presentation.
- `useChapterScriptDesk.ts` now owns raw/script buffers, save actions, rewrite skip
  behavior, and script agent dispatch.
- `useChapterStoryboardDesk.ts` now owns storyboard field patching, character
  selection, scene labels, shot selection/opening, and shot create/delete actions.
- `useChapterProductionPanelBridge.ts` now owns `ChapterProductionPanel` state and
  handler assembly.
- `ChapterStudioView.vue` now reads as route data loading plus workflow composition
  instead of production panel wiring or page-local workflow state.

Verification:

- `cd frontend && npm run typecheck`
- `cd frontend && npm run build`
- `cd frontend && npm run test:layout`
- `rg -n "any|Record<string, any>|catch \\(.*: any\\)" frontend/src/composables/chapter/useChapterExportDesk.ts frontend/src/composables/chapter/useChapterStudioConfig.ts frontend/src/composables/chapter/useChapterShotImagePreferences.ts frontend/src/composables/chapter/useChapterScriptDesk.ts frontend/src/composables/chapter/useChapterStoryboardDesk.ts frontend/src/composables/chapter/useChapterProductionPanelBridge.ts frontend/src/pages/ChapterStudioView.vue`
- `git diff --check`

### 9. Documentation And Ownership Closeout

Status: in progress; technical page-boundary docs are aligned, owner decisions
remain.

Purpose:

- Keep architecture docs aligned with the new module boundaries.
- Resolve owner-controlled repository handoff items that cannot be automated from
  code alone.
- Record the remaining identity gap after structural cleanup: page and service
  decomposition makes the project maintainable and AiDrama-owned internally, but
  a slower pass is still needed across UI appearance, product language, route/API
  naming, component boundaries, and public handoff docs before the whole repository
  feels fully distinct from the imported source.

Files:

- Modify `docs/cleanup-roadmap.md`.
- Modify `docs/architecture-transformation-plan.md`.
- Modify `docs/repository-handoff.md`.
- Modify `README.md` if public-facing workflow language changes.

Owner decisions:

- Confirm license.
- Replace upstream remote if this repository should stand on its own.
- Rotate credentials that came from imported or local development history.

Verification:

- `git status --short --ignored`
- Manual review of README, handoff docs, and deployment docs.

### 10. Backend Route Boundary Cleanup

Status: in progress.

Purpose:

- Keep the residual backend route body and error handling cleanup aligned with
  the architecture plan.
- Remove loose `any` from the simpler route handlers and helper middleware while
  preserving route contracts.
- Leave the larger grid, drama, episode, and adapter cleanup for a later batch
  once the basic route helper boundaries are settled.

Files:

- Create `backend/src/utils/error.ts`.
- Create `backend/src/routes/route-body.ts`.
- Create `backend/src/routes/merge-route-policy.ts`.
- Create tests under `backend/src/routes/__tests__/` and
  `backend/src/utils/__tests__/`.
- Modify `backend/src/routes/merge.ts`.
- Modify `backend/src/routes/compose.ts`.
- Modify `backend/src/routes/images.ts`.
- Modify `backend/src/routes/characters.ts`.
- Modify `backend/src/routes/scenes.ts`.
- Modify `backend/src/middleware/logger.ts`.
- Modify `backend/package.json`.

Verification:

- `cd backend && npm test`
- `rg -n "\\bany\\b|catch \\(.*: any\\)|Record<string, any>" backend/src/routes/characters.ts backend/src/routes/scenes.ts backend/src/routes/images.ts backend/src/routes/merge.ts backend/src/routes/compose.ts backend/src/middleware/logger.ts backend/src/routes/route-body.ts backend/src/routes/merge-route-policy.ts backend/src/utils/error.ts`
- `git diff --check`
