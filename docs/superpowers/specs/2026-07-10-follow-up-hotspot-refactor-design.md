# Follow-up Hotspot Refactor Design

## Context

The first staged refactor reduced the three original hotspots (`useApi.ts`, database bootstrap, and chapter media workbenches) and left the repository passing backend tests, frontend tests, type checking, and production builds. A fresh audit of the new head found three remaining issues with a better signal than raw file size:

1. `ProductionShotFrames.vue` renders a legacy `frame-gallery` from an undefined `frameCards` binding. The active result workbench already renders `selectedResultCards`, so the legacy block is unreachable duplicate UI with a large unused CSS tail.
2. `SettingsView.vue` combines UI markup with AI-provider catalog rules, endpoint derivation, JSON settings normalization, and four long default Agent prompts. Those stable policies are hard to test while embedded in a JavaScript SFC.
3. `backend/src/routes/actions/grid.ts` combines HTTP authorization and persistence with reference-asset mapping, grid prompt construction, model-output parsing, and fallback orchestration. Only request assignment normalization is currently covered by a focused policy test.

Large but cohesive files such as `direct-mode.ts`, `chapterShotMediaPolicy.ts`, and schema declarations are not included merely to reduce line counts.

## Options Considered

### 1. Aggressive component and service decomposition

Split every file over a line-count threshold, including all settings tabs, the direct Agent implementation, and chapter studio orchestration. This would lower headline file sizes but create broad prop/API churn and make behavioral regressions harder to isolate.

### 2. Defect-only cleanup

Remove the undefined frame gallery and stop. This is safest, but leaves two high-value seams untested and keeps domain policy coupled to UI/HTTP adapters.

### 3. Evidence-driven boundary extraction (selected)

Remove the proven dead UI, extract stable settings policy and prompt data without redesigning the page, and extract pure grid prompting/parsing policy while leaving route I/O in place. Each change gets a focused failing test first and an independent Git commit.

## Design

### Step 1: Remove the stale frame gallery

- Add a structural regression test proving the component uses the active `selectedResultCards` workbench and no longer references `frameCards` or legacy `.frame-card` markup.
- Remove only the obsolete `frame-gallery` template block.
- Remove the corresponding legacy `.frame-gallery` / `.frame-card*` CSS rules after confirming they have no other consumers.
- Preserve the current shot selector, selected-result workbench, grid history, grid dialog, and image editor composable.

### Step 2: Extract settings domain policy

- Create a typed settings policy module containing service metadata, provider presets, settings templates, endpoint-prefix rules, settings parsing/normalization, and endpoint-hint derivation.
- Create a separate Agent defaults module containing Agent definitions and default system prompts.
- Add unit tests for JSON validation, vision retry clamping, preset lookup, endpoint derivation, and the required Agent prompt catalog.
- Update `SettingsView.vue` to import these stable definitions and call the pure helpers. UI structure, API payloads, and user-visible behavior remain unchanged.

This step intentionally does not split the page into several presentational components: most remaining template size is cohesive tab markup, and componentizing it now would require a wide event/prop surface without adding a stronger domain boundary.

### Step 3: Extract grid prompt policy

- Create a route policy module for pure concerns: labels, JSON-array parsing, reference legends/hints, fallback grid/cell prompt building, model JSON candidate extraction, and grid-payload normalization/search.
- Pass the storyboard-to-character mapping into pure builders so the policy module performs no database access.
- Keep database loading, ownership checks, image generation, splitting, persistence, task logging, and HTTP responses in the route module.
- Add focused tests for first-frame, first/last, multi-reference prompt modes and nested/fenced Agent JSON recovery.
- Keep the route paths and response shapes unchanged.

## Compatibility and Risk Controls

- No API path, request shape, response shape, database schema, or persisted data changes.
- No new runtime dependency or frontend state framework.
- Existing provider presets, settings defaults, prompts, and generated grid text are moved verbatim before any cleanup.
- Each step runs its focused test first, then the relevant package suite, and is committed independently.
- Final verification runs backend tests, frontend tests, frontend type checking, frontend build, and `git diff --check`.

## Success Criteria

- No undefined `frameCards` binding or unused legacy frame-card styles remain.
- Settings policy and Agent defaults are independently importable and tested.
- Grid route delegates pure prompt/parsing behavior to a tested policy module and is materially smaller.
- All existing behavior remains green under the repository's full verification commands.
