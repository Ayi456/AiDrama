# Chapter Media Workbench Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the size and responsibility count of the Chapter Studio image/video workbenches and split their monolithic stylesheet without changing behavior or appearance.

**Architecture:** Feature-level Vue components remain orchestration shells. Typed policies and composables own per-shot state, while the grid dialog becomes a focused child component and CSS is divided into shared, image, video, and grid ownership files.

**Tech Stack:** Vue 3 Composition API, TypeScript 5.8, Vite 7, plain CSS, Node assert/tsx tests.

## Global Constraints

- Preserve the `ChapterProductionPanel.vue` state/handler contract.
- Preserve rendered class names, user-facing behavior, API payloads, toast/confirmation behavior, and responsive layout.
- Child components emit events; they do not call feature APIs directly.
- Key all async draft, upload, capture, and reference state by storyboard ID.
- Do not add a state-management library, component library, CSS preprocessor, or dependency.
- Add tests before moving behavior and run the complete frontend verification at the end.

---

## File Map

- Create `frontend/src/composables/chapter/chapterVideoWorkbenchPolicy.ts`: pure keyed-state and media-list helpers.
- Create `frontend/src/composables/chapter/useChapterVideoPromptDrafts.ts`: per-shot prompt synchronization and saves.
- Create `frontend/src/composables/chapter/useChapterVideoReferences.ts`: capture/reference selection and uploads.
- Create `frontend/src/composables/chapter/chapterShotImageWorkbenchPolicy.ts`: pure prompt/reference/frame-card derivation.
- Create `frontend/src/composables/chapter/useChapterShotImageEditor.ts`: selected-shot image editor state.
- Create `frontend/src/components/chapter/ChapterGridToolDialog.vue`: grid workflow dialog.
- Modify `ChapterProductionVideos.vue` and `ProductionShotFrames.vue` to orchestrate extracted units.
- Create four responsibility-based CSS files and remove the monolithic component import.
- Add focused tests under the existing chapter composable/component test directories.

### Task 1: Extract pure video workbench state policies

**Files:**
- Create: `frontend/src/composables/chapter/chapterVideoWorkbenchPolicy.ts`
- Create: `frontend/src/composables/chapter/__tests__/chapterVideoWorkbenchPolicy.test.ts`
- Modify: `frontend/src/components/chapter/ChapterProductionVideos.vue`

**Interfaces:**
- Produces: `storyboardStateKey`, `setKeyedValue`, `removeKeyedValue`, `uniqueStrings`, `uniqueMediaByUrl`.
- Consumes: storyboard IDs/indexes and plain immutable records/arrays.

- [ ] **Step 1: Write failing pure-policy tests**

```ts
import assert from 'node:assert/strict'
import {
  storyboardStateKey,
  setKeyedValue,
  removeKeyedValue,
  uniqueStrings,
  uniqueMediaByUrl,
} from '../chapterVideoWorkbenchPolicy.ts'

assert.equal(storyboardStateKey({ id: 9 }, 2), '9')
assert.equal(storyboardStateKey({}, 2), '2')
assert.deepEqual(setKeyedValue({ old: 1 }, 'shot', 2), { old: 1, shot: 2 })
assert.deepEqual(removeKeyedValue({ old: 1, shot: 2 }, 'shot'), { old: 1 })
assert.deepEqual(uniqueStrings([' a ', '', 'a', 'b']), ['a', 'b'])
assert.deepEqual(uniqueMediaByUrl([{ url: 'a' }, { url: 'a' }, { url: 'b' }]), [{ url: 'a' }, { url: 'b' }])
console.log('PASS chapter video workbench policies are deterministic')
```

- [ ] **Step 2: Run the test and verify the policy module is missing**

Run: `node node_modules/tsx/dist/cli.mjs src/composables/chapter/__tests__/chapterVideoWorkbenchPolicy.test.ts`

Expected: FAIL with missing policy module.

- [ ] **Step 3: Implement immutable helpers and replace component-local copies**

```ts
export type KeyedState<T> = Record<string, T>
export type MediaReference = { url?: string | null; [key: string]: unknown }

export function storyboardStateKey(storyboard: { id?: number | string } | null | undefined, index: number) {
  return String(storyboard?.id || index || 'current')
}

export function setKeyedValue<T>(source: KeyedState<T>, key: string, value: T): KeyedState<T> {
  return { ...source, [key]: value }
}

export function removeKeyedValue<T>(source: KeyedState<T>, key: string): KeyedState<T> {
  if (!Object.prototype.hasOwnProperty.call(source, key)) return source
  const next = { ...source }
  delete next[key]
  return next
}

export function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(values.map(value => String(value ?? '').trim()).filter(Boolean))]
}

export function uniqueMediaByUrl<T extends MediaReference>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter(item => {
    const url = String(item.url ?? '').trim()
    if (!url || seen.has(url)) return false
    seen.add(url)
    return true
  })
}
```

Import these functions in `ChapterProductionVideos.vue` and remove the local implementations. Keep call order and mutation points unchanged.

- [ ] **Step 4: Run focused policy/media tests**

Run: `node node_modules/tsx/dist/cli.mjs src/composables/chapter/__tests__/chapterVideoWorkbenchPolicy.test.ts`

Expected: PASS.

Run: `node node_modules/tsx/dist/cli.mjs src/composables/chapter/__tests__/chapterShotMediaPolicy.test.ts`

Expected: all existing media policy tests PASS.

- [ ] **Step 5: Commit pure video policies**

```bash
git add frontend/src/composables/chapter/chapterVideoWorkbenchPolicy.ts frontend/src/composables/chapter/__tests__/chapterVideoWorkbenchPolicy.test.ts frontend/src/components/chapter/ChapterProductionVideos.vue
git commit -m "refactor(frontend): extract video workbench policies"
```

### Task 2: Extract per-shot video prompt and reference composables

**Files:**
- Create: `frontend/src/composables/chapter/useChapterVideoPromptDrafts.ts`
- Create: `frontend/src/composables/chapter/useChapterVideoReferences.ts`
- Create: `frontend/src/composables/chapter/__tests__/useChapterVideoWorkbenchTypes.test.ts`
- Modify: `frontend/src/components/chapter/ChapterProductionVideos.vue`

**Interfaces:**
- Produces: prompt refs/commands and reference refs/commands consumed by the orchestration shell.
- Consumes: computed selected storyboard/key, state callbacks, handler callbacks, and `uploadAPI` supplied as dependencies.

- [ ] **Step 1: Write a failing structural/type boundary test**

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

const promptSource = readFileSync(fileURLToPath(new URL('../useChapterVideoPromptDrafts.ts', import.meta.url)), 'utf8')
const referencesSource = readFileSync(fileURLToPath(new URL('../useChapterVideoReferences.ts', import.meta.url)), 'utf8')
assert.match(promptSource, /export function useChapterVideoPromptDrafts/)
assert.match(referencesSource, /export function useChapterVideoReferences/)
assert.equal(/:\s*any\b|Record<string, any>/.test(promptSource + referencesSource), false)
console.log('PASS video workbench composables expose typed boundaries')
```

- [ ] **Step 2: Run the test and verify the composable files are missing**

Run: `node node_modules/tsx/dist/cli.mjs src/composables/chapter/__tests__/useChapterVideoWorkbenchTypes.test.ts`

Expected: FAIL with missing composable file.

- [ ] **Step 3: Move prompt state behind an injected save command**

Use this public dependency/result shape in `useChapterVideoPromptDrafts.ts`:

```ts
export type VideoPromptStoryboard = {
  id?: number
  video_prompt?: string | null
  videoPrompt?: string | null
}

export type VideoPromptDraftDependencies = {
  selectedShot: ComputedRef<VideoPromptStoryboard | null>
  selectedShotKey: ComputedRef<string>
  buildDefaultPrompt: (shot: VideoPromptStoryboard) => string
  savePrompt: (shot: VideoPromptStoryboard, prompt: string) => Promise<unknown>
}

export function useChapterVideoPromptDrafts(deps: VideoPromptDraftDependencies) {
  // Move promptDraft, keyed dirty/saving maps, shot watch, save de-duplication,
  // apply-default, and flush-before-generate behavior from the component.
  return { promptDraft, isPromptSaving, markPromptDraftDirty, savePromptDraft, applyDefaultPrompt }
}
```

Move the existing logic without changing trimming, optimistic field synchronization, or concurrent-save de-duplication.

- [ ] **Step 4: Move reference/capture/upload state behind injected dependencies**

Use a typed `useChapterVideoReferences` input containing the selected shot, shot list, capture-target readers, media upload function, toast callback, and maximum counts. Return the existing template-facing names: `referenceMode`, frame/capture refs, reference option computeds, selected image/video/audio refs, upload refs/state, capture commands, selection commands, and upload command.

Keep `ChapterProductionVideos.vue` responsible for generation, routing, history selection, and billing actions. Replace moved local declarations with destructuring from the two composables.

- [ ] **Step 5: Run component-focused tests and typecheck**

Run: `node node_modules/tsx/dist/cli.mjs src/composables/chapter/__tests__/useChapterVideoWorkbenchTypes.test.ts`

Expected: PASS.

Run: `node node_modules/tsx/dist/cli.mjs src/components/__tests__/production-video-result-interaction.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 6: Commit video composables**

```bash
git add frontend/src/composables/chapter/useChapterVideoPromptDrafts.ts frontend/src/composables/chapter/useChapterVideoReferences.ts frontend/src/composables/chapter/__tests__/useChapterVideoWorkbenchTypes.test.ts frontend/src/components/chapter/ChapterProductionVideos.vue
git commit -m "refactor(frontend): extract video workbench state"
```

### Task 3: Extract shot-image editor policies and state

**Files:**
- Create: `frontend/src/composables/chapter/chapterShotImageWorkbenchPolicy.ts`
- Create: `frontend/src/composables/chapter/useChapterShotImageEditor.ts`
- Create: `frontend/src/composables/chapter/__tests__/chapterShotImageWorkbenchPolicy.test.ts`
- Modify: `frontend/src/components/chapter/ProductionShotFrames.vue`

**Interfaces:**
- Produces: `deriveShotPrompt`, `resolveFrameAspectRatio`, and selected-shot prompt/reference/result/history state.
- Consumes: existing frame readers, pending-state reader, reference options, and component emit callback.

- [ ] **Step 1: Write failing policy tests**

```ts
import assert from 'node:assert/strict'
import { deriveShotPrompt, resolveFrameAspectRatio } from '../chapterShotImageWorkbenchPolicy.ts'

assert.equal(resolveFrameAspectRatio('16:9'), '16 / 9')
assert.equal(resolveFrameAspectRatio('broken'), '1 / 1')
assert.match(deriveShotPrompt({ description: '人物推门进入', shot_type: '中景' }), /人物推门进入/)
assert.match(deriveShotPrompt({ description: '人物推门进入', shot_type: '中景' }), /中景/)
console.log('PASS shot image workbench policy is deterministic')
```

- [ ] **Step 2: Run the test and verify the policy module is missing**

Run: `node node_modules/tsx/dist/cli.mjs src/composables/chapter/__tests__/chapterShotImageWorkbenchPolicy.test.ts`

Expected: FAIL with missing policy module.

- [ ] **Step 3: Implement policies with current prompt clauses and ratio fallback**

Move the complete current `deriveShotPrompt` clause construction to the new policy. Implement ratio parsing as:

```ts
export function resolveFrameAspectRatio(value: string) {
  const [width, height] = value.split(':').map(Number)
  return width > 0 && height > 0 ? `${width} / ${height}` : '1 / 1'
}
```

- [ ] **Step 4: Move editor state into `useChapterShotImageEditor`**

The composable owns generation quantity, reference picker state, selected-shot/index computeds, prompt/negative-prompt synchronization, manual references, result cards, history cards, and generation commands. It receives props as readonly refs/functions and an emit callback, and returns the existing template-facing names. Grid-dialog props/events stay in the shell for Task 4.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `node node_modules/tsx/dist/cli.mjs src/composables/chapter/__tests__/chapterShotImageWorkbenchPolicy.test.ts`

Expected: PASS.

Run: `node node_modules/tsx/dist/cli.mjs src/composables/chapter/__tests__/chapterShotMediaPolicy.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 6: Commit shot-image state extraction**

```bash
git add frontend/src/composables/chapter/chapterShotImageWorkbenchPolicy.ts frontend/src/composables/chapter/useChapterShotImageEditor.ts frontend/src/composables/chapter/__tests__/chapterShotImageWorkbenchPolicy.test.ts frontend/src/components/chapter/ProductionShotFrames.vue
git commit -m "refactor(frontend): extract shot image editor state"
```

### Task 4: Extract the grid tool dialog component

**Files:**
- Create: `frontend/src/components/chapter/ChapterGridToolDialog.vue`
- Create: `frontend/src/components/chapter/__tests__/chapter-grid-tool-dialog.test.ts`
- Modify: `frontend/src/components/chapter/ProductionShotFrames.vue`

**Interfaces:**
- Produces: a presentation-only grid dialog with the same grid props and event names.
- Consumes: `BaseSelect`, `Loader2`, `assetUrl`, grid display values, and callback readers passed as props.

- [ ] **Step 1: Write the failing component-boundary source test**

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

const parent = readFileSync(fileURLToPath(new URL('../ProductionShotFrames.vue', import.meta.url)), 'utf8')
const dialog = readFileSync(fileURLToPath(new URL('../ChapterGridToolDialog.vue', import.meta.url)), 'utf8')
assert.match(parent, /<ChapterGridToolDialog/)
assert.equal(parent.includes('class="card grid-tool"'), false)
assert.match(dialog, /class="card grid-tool"/)
assert.match(dialog, /defineEmits/)
console.log('PASS grid dialog has a focused component boundary')
```

- [ ] **Step 2: Run the test and verify the dialog file is missing**

Run: `node node_modules/tsx/dist/cli.mjs src/components/chapter/__tests__/chapter-grid-tool-dialog.test.ts`

Expected: FAIL with missing dialog file.

- [ ] **Step 3: Move the complete grid overlay markup**

Move the `v-if="gridDialog"` overlay and all five grid steps into `ChapterGridToolDialog.vue`. Define the same grid-related props currently declared by `ProductionShotFrames.vue`, and emit these names unchanged:

```ts
const emit = defineEmits([
  'close', 'change-grid-mode', 'change-grid-layout', 'toggle-grid-select-all',
  'toggle-grid-shot', 'change-grid-single-target', 'generate-grid-prompt',
  'start-grid-generation', 'change-grid-step', 'focus-grid-cell',
  'change-grid-assignment-page', 'update-grid-assignment', 'do-grid-split', 'finish',
])
```

In the parent, render the child and map `close` to `close-grid-dialog` and `finish` to `finish-grid-dialog`; forward all other events under their existing names. Keep image-viewer behavior by emitting an `open-image-viewer` payload to the parent.

- [ ] **Step 4: Run boundary, layout, and type checks**

Run: `node node_modules/tsx/dist/cli.mjs src/components/chapter/__tests__/chapter-grid-tool-dialog.test.ts`

Expected: PASS.

Run: `npm run test:layout`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Commit grid dialog extraction**

```bash
git add frontend/src/components/chapter/ChapterGridToolDialog.vue frontend/src/components/chapter/ProductionShotFrames.vue frontend/src/components/chapter/__tests__/chapter-grid-tool-dialog.test.ts
git commit -m "refactor(frontend): extract chapter grid dialog"
```

### Task 5: Split the production workbench stylesheet and verify the stage

**Files:**
- Create: `frontend/src/assets/production-shot-workbench.css`
- Create: `frontend/src/assets/production-shot-images.css`
- Create: `frontend/src/assets/production-video-workbench.css`
- Create: `frontend/src/assets/production-grid-tool.css`
- Delete: `frontend/src/assets/production-shot-frames.css`
- Modify: `frontend/src/components/chapter/ProductionShotFrames.vue`
- Modify: `frontend/src/components/chapter/ChapterProductionVideos.vue`
- Modify: `frontend/src/pages/__tests__/chapter-studio-responsive-css.test.ts`
- Modify: `frontend/src/components/__tests__/production-video-result-interaction.test.ts`

**Interfaces:**
- Produces: shared shell CSS plus image-, video-, and grid-owned rules with existing selectors.
- Consumes: unchanged rendered class names.

- [ ] **Step 1: Update CSS tests to read responsibility-based files**

In `chapter-studio-responsive-css.test.ts`, read shared, image, video, and grid CSS and concatenate only for assertions that span owners:

```ts
const sharedCss = readFileSync(resolve(root, 'assets/production-shot-workbench.css'), 'utf8')
const imageCss = readFileSync(resolve(root, 'assets/production-shot-images.css'), 'utf8')
const videoCss = readFileSync(resolve(root, 'assets/production-video-workbench.css'), 'utf8')
const gridCss = readFileSync(resolve(root, 'assets/production-grid-tool.css'), 'utf8')
const productionCss = [sharedCss, imageCss, videoCss, gridCss].join('\n')
```

Update the video interaction test to read `production-video-workbench.css`. Add assertions that each file contains its owning selector and rejects selectors owned exclusively by another file.

- [ ] **Step 2: Run CSS-focused tests and verify files are missing**

Run: `node node_modules/tsx/dist/cli.mjs src/pages/__tests__/chapter-studio-responsive-css.test.ts`

Expected: FAIL because the split files do not exist.

- [ ] **Step 3: Move rules while preserving selector text and cascade intent**

Move shared `.shot-workbench`, `.shot-panel`, `.shot-board__*`, and common card/responsive rules to `production-shot-workbench.css`. Move `.shot-frames`, `.shot-studio`, `.shot-results`, `.shot-result-card`, `.frame-gallery`, `.frame-card`, reference picker, and image-specific responsive rules to `production-shot-images.css`. Move `.video-*`, `.video-workbench*`, `.video-panel*`, billing/history, and video responsive rules to `production-video-workbench.css`. Move `.grid-*`, `.latest-grid-*`, and grid dialog responsive rules to `production-grid-tool.css`.

When a historical override targets both shot and video selectors, keep it in the shared file and preserve its position after the base shared rule it overrides. Do not rename selectors or consolidate declarations in this task.

- [ ] **Step 4: Import only the owning styles from each shell**

`ProductionShotFrames.vue`:

```css
@import url('@/assets/production-shot-workbench.css');
@import url('@/assets/production-shot-images.css');
@import url('@/assets/production-grid-tool.css');
```

`ChapterProductionVideos.vue`:

```css
@import url('@/assets/production-shot-workbench.css');
@import url('@/assets/production-video-workbench.css');
```

Delete the old monolithic file after `rg "production-shot-frames.css" frontend/src` returns only test text that is being removed.

- [ ] **Step 5: Run complete frontend verification**

Run: `npm test`

Expected: all frontend unit and layout tests PASS.

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm run build`

Expected: Vite production build succeeds.

- [ ] **Step 6: Inspect scope and commit the completed Chapter refactor**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: only the Chapter workbench CSS/test files from this task are modified or untracked.

```bash
git add frontend/src/assets/production-shot-workbench.css frontend/src/assets/production-shot-images.css frontend/src/assets/production-video-workbench.css frontend/src/assets/production-grid-tool.css frontend/src/assets/production-shot-frames.css frontend/src/components/chapter/ProductionShotFrames.vue frontend/src/components/chapter/ChapterProductionVideos.vue frontend/src/pages/__tests__/chapter-studio-responsive-css.test.ts frontend/src/components/__tests__/production-video-result-interaction.test.ts
git commit -m "refactor(frontend): decompose chapter media workbenches"
```
