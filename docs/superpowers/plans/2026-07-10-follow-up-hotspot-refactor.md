# Follow-up Hotspot Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove one stale frontend rendering path and extract independently tested settings and grid-prompt policies without changing public UI or API behavior.

**Architecture:** Keep Vue views and Hono routes as adapters. Move stable configuration, prompt construction, and model-output normalization into typed pure modules, while database access, ownership checks, and UI event wiring stay at their current boundaries.

**Tech Stack:** Vue 3 SFCs, TypeScript, Vite, Node assert tests via `tsx`, Hono, Drizzle ORM.

## Global Constraints

- Do not change API paths, request bodies, response bodies, database schema, or persisted data.
- Do not add runtime dependencies or a frontend state/component framework.
- Move existing provider presets, settings defaults, Agent prompts, and grid prompt wording without editorial rewrites.
- Follow strict RED/GREEN TDD for each task and commit each task independently.
- Run package-level verification before each task commit and full repository verification at the end.

---

## File Map

- `frontend/src/components/chapter/ProductionShotFrames.vue`: active shot image workbench only; remove the obsolete gallery consumer.
- `frontend/src/assets/production-shot-workbench.css`: active workbench styles only; remove unreferenced legacy card rules.
- `frontend/src/components/chapter/__tests__/production-shot-frames-boundary.test.ts`: structural guard against restoring the undefined legacy binding.
- `frontend/src/pages/settings-ai-service-policy.ts`: typed AI-service catalog and pure settings normalization/endpoint helpers.
- `frontend/src/pages/settings-agent-defaults.ts`: Agent definitions and default system prompts only.
- `frontend/src/pages/__tests__/settings-ai-service-policy.test.ts`: pure settings policy coverage.
- `frontend/src/pages/__tests__/settings-agent-defaults.test.ts`: Agent catalog/default-prompt contract coverage.
- `frontend/src/pages/SettingsView.vue`: renders settings and owns API state; imports stable policy/data.
- `backend/src/routes/policies/grid-prompt-policy.ts`: pure grid prompt, reference hint, JSON parsing, and Agent payload recovery.
- `backend/src/routes/policies/__tests__/grid-prompt-policy.test.ts`: focused grid-policy coverage.
- `backend/src/routes/actions/grid.ts`: HTTP, ownership, database, image generation, splitting, persistence, and logging adapter.

---

### Task 1: Remove the stale frame gallery

**Files:**
- Create: `frontend/src/components/chapter/__tests__/production-shot-frames-boundary.test.ts`
- Modify: `frontend/src/components/chapter/ProductionShotFrames.vue`
- Modify: `frontend/src/assets/production-shot-workbench.css`

**Interfaces:**
- Consumes: the active `selectedResultCards` binding returned by `useChapterShotImageEditor`.
- Produces: a component with no `frameCards` reference and a stylesheet with no `.frame-gallery` or `.frame-card*` rules.

- [ ] **Step 1: Write the failing structural test**

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

const component = readFileSync(fileURLToPath(new URL('../ProductionShotFrames.vue', import.meta.url)), 'utf8')
const styles = readFileSync(fileURLToPath(new URL('../../../assets/production-shot-workbench.css', import.meta.url)), 'utf8')

assert.match(component, /v-for="card in selectedResultCards"/)
assert.doesNotMatch(component, /\bframeCards\b/)
assert.doesNotMatch(component, /class="frame-gallery"/)
assert.doesNotMatch(styles, /\.frame-gallery\b|\.frame-card(?:\b|__)/)

console.log('PASS shot frame workbench has no stale gallery boundary')
```

- [ ] **Step 2: Run the focused test and verify RED**

Run from `frontend/`:

```powershell
node node_modules/tsx/dist/cli.mjs src/components/chapter/__tests__/production-shot-frames-boundary.test.ts
```

Expected: FAIL because `ProductionShotFrames.vue` still contains `frameCards` and `production-shot-workbench.css` still contains legacy card selectors.

- [ ] **Step 3: Remove the obsolete implementation**

Delete the complete `<div class="frame-gallery">...</div>` block between the grid-history panel and `<ChapterGridToolDialog>`. Delete only the stylesheet block beginning at `.frame-gallery {` and ending after `.frame-card__foot { ... }`; retain all `shot-*`, `grid-*`, dialog, and responsive rules.

- [ ] **Step 4: Verify GREEN and package behavior**

Run from `frontend/`:

```powershell
node node_modules/tsx/dist/cli.mjs src/components/chapter/__tests__/production-shot-frames-boundary.test.ts
npm test
npm run typecheck
```

Expected: the focused test passes, the frontend test suite reports zero failures, and `vue-tsc` exits 0.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/components/chapter/__tests__/production-shot-frames-boundary.test.ts frontend/src/components/chapter/ProductionShotFrames.vue frontend/src/assets/production-shot-workbench.css
git commit -m "refactor(frontend): remove stale shot frame gallery"
```

---

### Task 2: Extract settings policy and Agent defaults

**Files:**
- Create: `frontend/src/pages/settings-ai-service-policy.ts`
- Create: `frontend/src/pages/settings-agent-defaults.ts`
- Create: `frontend/src/pages/__tests__/settings-ai-service-policy.test.ts`
- Create: `frontend/src/pages/__tests__/settings-agent-defaults.test.ts`
- Modify: `frontend/src/pages/SettingsView.vue`

**Interfaces:**
- Produces: `settingsServiceTypes`, `settingsProviders`, `settingsServiceMeta`, `listProviderPresets`, `stringifySettings`, `getSettingsTemplate`, `parseSettingsJson`, `mergeVisionSettings`, and `resolveEndpointHint` from `settings-ai-service-policy.ts`.
- Produces: `settingsAgentDefs` and `settingsDefaultPrompts` from `settings-agent-defaults.ts`.
- Consumes: existing `cfgForm` fields and the same API payloads already used by `SettingsView.vue`.

- [ ] **Step 1: Write failing AI-service policy tests**

Test these exact contracts with `node:assert/strict`:

```ts
assert.deepEqual(parseSettingsJson(''), {})
assert.deepEqual(parseSettingsJson('{"control":{"watermark":false}}'), { control: { watermark: false } })
assert.throws(() => parseSettingsJson('[]'), /JSON 对象/)
assert.deepEqual(mergeVisionSettings('vision', {}, true, 9), { enabled: true, maxAttempts: 5 })
assert.deepEqual(mergeVisionSettings('vision', {}, false, 0), { enabled: false, maxAttempts: 1 })
assert.deepEqual(mergeVisionSettings('text', { keep: true }, true, 4), { keep: true })
assert.equal(resolveEndpointHint('ali', 'https://dashscope.aliyuncs.com', 'vision'), 'https://dashscope.aliyuncs.com/compatible-mode/v1')
assert.equal(resolveEndpointHint('volcengine', 'https://ark.cn-beijing.volces.com', 'image'), 'https://ark.cn-beijing.volces.com/api/v3')
assert.equal(listProviderPresets('video')[0]?.provider, 'volcengine')
assert.deepEqual(getSettingsTemplate('video', 'volcengine').control, { generateAudio: true, returnLastFrame: false, watermark: false })
```

- [ ] **Step 2: Write failing Agent defaults tests**

```ts
assert.deepEqual(settingsAgentDefs.map(item => item.type), [
  'script_rewriter',
  'extractor',
  'storyboard_breaker',
  'grid_prompt_generator',
])
assert.match(settingsDefaultPrompts.extractor, /角色的 appearance 必须做完整定装/)
assert.match(settingsDefaultPrompts.storyboard_breaker, /导演层优先原则/)
assert.match(settingsDefaultPrompts.grid_prompt_generator, /consistent art style/)
```

- [ ] **Step 3: Run the new tests and verify RED**

Run from `frontend/`:

```powershell
node node_modules/tsx/dist/cli.mjs src/pages/__tests__/settings-ai-service-policy.test.ts
node node_modules/tsx/dist/cli.mjs src/pages/__tests__/settings-agent-defaults.test.ts
```

Expected: both fail because the two modules do not exist.

- [ ] **Step 4: Implement the typed AI-service policy**

Define `SettingsServiceType = 'text' | 'image' | 'video' | 'vision'`, typed service metadata, provider presets, templates, and endpoint prefixes by moving the existing `SettingsView.vue` constants unchanged. Implement the pure helpers with these signatures:

```ts
export function listProviderPresets(type: SettingsServiceType): Array<ProviderPreset & { provider: string }>
export function stringifySettings(settings: Record<string, unknown> | null | undefined): string
export function getSettingsTemplate(type: SettingsServiceType, provider?: string): Record<string, unknown>
export function parseSettingsJson(raw: unknown): Record<string, unknown>
export function mergeVisionSettings(
  type: SettingsServiceType,
  settings: Record<string, unknown>,
  enabled: boolean,
  maxAttempts: unknown,
): Record<string, unknown>
export function resolveEndpointHint(provider: string, baseUrl: string, type: SettingsServiceType): string
```

`mergeVisionSettings` must clamp finite retry counts to the inclusive range 1–5 and use 2 for non-finite input. `resolveEndpointHint` must retain the Ali text/vision `compatible-mode/v1` exception.

- [ ] **Step 5: Implement the Agent defaults module**

Move the existing `agentDefs` and the complete existing `defaultPrompts` object from `SettingsView.vue` to exported constants named `settingsAgentDefs` and `settingsDefaultPrompts`. Preserve every prompt string byte-for-byte apart from indentation introduced by moving the block.

- [ ] **Step 6: Verify the pure modules GREEN**

Run the two focused commands from Step 3. Expected: both pass.

- [ ] **Step 7: Rewire `SettingsView.vue`**

Import the new exports. Replace local constants with aliases only where the template name must remain stable:

```js
const serviceTypes = settingsServiceTypes
const serviceMeta = settingsServiceMeta
const providers = settingsProviders
const agentDefs = settingsAgentDefs
const defaultPrompts = settingsDefaultPrompts
```

Replace `presetsByType` with `listProviderPresets`, settings-template/JSON helpers with imports, the computed endpoint block with `resolveEndpointHint(cfgForm.provider, cfgForm.base_url || 'https://...', cfgForm.service_type)`, and the form-coupled merge body with:

```js
function mergeVisionFormSettings(settings) {
  return mergeVisionSettings(
    cfgForm.service_type,
    settings,
    cfgForm.enabled === true,
    cfgForm.maxAttempts,
  )
}
```

- [ ] **Step 8: Verify the frontend package**

Run from `frontend/`:

```powershell
npm test
npm run typecheck
npm run build
```

Expected: all frontend tests pass, type checking exits 0, and the Vite production build exits 0.

- [ ] **Step 9: Commit**

```powershell
git add frontend/src/pages/SettingsView.vue frontend/src/pages/settings-ai-service-policy.ts frontend/src/pages/settings-agent-defaults.ts frontend/src/pages/__tests__/settings-ai-service-policy.test.ts frontend/src/pages/__tests__/settings-agent-defaults.test.ts
git commit -m "refactor(frontend): extract settings domain policy"
```

---

### Task 3: Extract pure grid prompt policy

**Files:**
- Create: `backend/src/routes/policies/grid-prompt-policy.ts`
- Create: `backend/src/routes/policies/__tests__/grid-prompt-policy.test.ts`
- Modify: `backend/src/routes/actions/grid.ts`

**Interfaces:**
- Produces: `GridPromptStoryboard`, `GridReferenceAsset`, `GridCellPrompt`, `GridPayload`, `parseGridJsonArray`, `buildGridPrompt`, `buildGridCellPrompts`, and `findGridPayload`.
- Consumes: `Map<number, number[]>` built by the route's existing database lookup.
- Preserves: `/grid/prompt`, `/grid/generate`, `/grid/split`, and `/grid/status/:id` request/response contracts.

- [ ] **Step 1: Write failing grid policy tests**

Create two storyboard fixtures, character/reference mappings, and assertions covering:

```ts
assert.deepEqual(parseGridJsonArray('["a.png",null,"b.png"]'), ['a.png', 'b.png'])
assert.deepEqual(parseGridJsonArray('invalid'), [])
assert.match(buildGridPrompt('first_frame', storyboards, 1, 2, '国风', assets, characterIds), /1x2 grid layout/)
assert.match(buildGridPrompt('first_frame', storyboards, 1, 2, '国风', assets, characterIds), /图片1/)
assert.match(buildGridPrompt('first_last', storyboards, 2, 2, '国风', assets, characterIds), /alternating opening and closing beats/)
assert.equal(buildGridCellPrompts('multi_ref', storyboards, 1, 2, assets, characterIds).length, 2)
assert.deepEqual(findGridPayload('```json\n{"result":{"grid_prompt":"grid","cell_prompts":[{"shot_number":1,"frame_type":"first_frame","prompt":"cell"}]}}\n```'), {
  grid_prompt: 'grid',
  cell_prompts: [{ shot_number: 1, frame_type: 'first_frame', prompt: 'cell' }],
})
assert.equal(findGridPayload('{"grid_prompt":"","cell_prompts":[]}'), null)
```

- [ ] **Step 2: Run the focused backend test and verify RED**

Run from `backend/`:

```powershell
npx tsx src/routes/policies/__tests__/grid-prompt-policy.test.ts
```

Expected: FAIL because `grid-prompt-policy.ts` does not exist.

- [ ] **Step 3: Implement the pure policy module**

Move the existing label, JSON-array parsing, reference legend/hint, `buildGridPrompt`, `buildGridCellPrompts`, JSON candidate extraction, payload normalization, and nested payload search logic from `grid.ts`. Replace the internal database lookup in the two builders with the final `storyboardCharacterIds: Map<number, number[]>` parameter. Keep all prompt strings and mode fallback behavior unchanged.

- [ ] **Step 4: Verify the focused policy GREEN**

Run the command from Step 2. Expected: all named assertions pass.

- [ ] **Step 5: Rewire the route adapter**

Import the policy types/functions. Keep `getStoryboardCharacterIds` and `collectGridReferenceAssets` in `grid.ts`, but pass a preloaded mapping into `collectGridReferenceAssets` instead of querying it internally. In both `/prompt` and `/generate`, load the mapping once, pass it to reference collection and pure builders, remove obsolete local types/functions, and replace split-route `safeParseJsonArray` calls with `parseGridJsonArray`.

- [ ] **Step 6: Verify the backend package**

Run from `backend/`:

```powershell
npm test
npm run typecheck
```

Expected: TypeScript compilation and every discovered backend test pass; the separate no-emit typecheck exits 0.

- [ ] **Step 7: Commit**

```powershell
git add backend/src/routes/actions/grid.ts backend/src/routes/policies/grid-prompt-policy.ts backend/src/routes/policies/__tests__/grid-prompt-policy.test.ts
git commit -m "refactor(backend): extract grid prompt policy"
```

---

### Task 4: Final repository verification and audit

**Files:**
- Modify only if verification reveals a defect covered by a new failing test.

- [ ] **Step 1: Run full verification**

```powershell
Set-Location backend
npm test
Set-Location ../frontend
npm test
npm run typecheck
npm run build
Set-Location ..
git diff --check cnb/main..HEAD
git status --short --branch
```

Expected: every command exits 0; Git reports the current branch ahead of `cnb/main` with no uncommitted files.

- [ ] **Step 2: Re-run the hotspot audit**

Measure source line counts and inspect remaining files over 500 lines. Report which are cohesive and intentionally deferred (`direct-mode.ts`, schema declarations, pure chapter policy) versus which could become a future product-driven refactor. Do not create another refactor solely from line count.
