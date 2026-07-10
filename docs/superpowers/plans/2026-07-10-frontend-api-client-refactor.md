# Frontend API Client Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the frontend API client into focused domain modules while preserving every existing `@/composables/useApi` export and runtime behavior.

**Architecture:** Shared transport, errors, and types live under `frontend/src/api/`; domain modules depend only on those shared modules. `useApi.ts` remains a compatibility facade so consumers do not change in this stage.

**Tech Stack:** Vue 3, TypeScript 5.8, Vite 7, native Fetch API, Node assert tests executed with tsx.

## Global Constraints

- Do not change endpoints, payload shapes, response-envelope handling, credentials, log messages, or user-facing errors.
- Keep direct COS image upload and multipart fallback behavior unchanged.
- Do not add dependencies.
- Add a regression test before fixing any defect discovered during extraction.
- Finish this plan with a clean worktree and passing frontend test, layout, typecheck, and build commands.

---

## File Map

- Create `frontend/src/api/client.ts`: `api`, request methods, envelope parsing, request logging.
- Create `frontend/src/api/errors.ts`: provider/error normalization helpers.
- Create `frontend/src/api/types.ts`: all exported API types.
- Create `frontend/src/api/auth.ts`: `authAPI`, `uploadAPI`.
- Create `frontend/src/api/projects.ts`: project/content APIs.
- Create `frontend/src/api/media.ts`: media generation and composition APIs.
- Create `frontend/src/api/billing.ts`: wallet/payment APIs and pagination helper.
- Create `frontend/src/api/configuration.ts`: configuration, skills, preferences, automation APIs.
- Modify `frontend/src/composables/useApi.ts`: compatibility re-exports only.
- Create `frontend/src/composables/__tests__/api-module-boundary.test.ts`: facade identity and structural boundary checks.

### Task 1: Extract transport, errors, and shared types

**Files:**
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/api/errors.ts`
- Create: `frontend/src/api/types.ts`
- Modify: `frontend/src/composables/useApi.ts`
- Test: `frontend/src/composables/__tests__/upload-api.test.ts`

**Interfaces:**
- Produces: `api.get/post/put/patch/del`, `uploadRequest`, `normalizeApiErrorMessage`, `ApiRequestBody`, and all currently exported model types.
- Consumes: native `fetch`, `FormData`, and the existing `/api/v1` response envelope.

- [ ] **Step 1: Redirect the existing error test to the future owning module**

Change only the error import in `upload-api.test.ts` while leaving `uploadAPI` on the compatibility facade:

```ts
import { normalizeApiErrorMessage } from '../../api/errors.ts'
import { uploadAPI } from '../useApi.ts'
```

- [ ] **Step 2: Run the focused test and verify the new module is missing**

Run: `node node_modules/tsx/dist/cli.mjs src/composables/__tests__/upload-api.test.ts`

Expected: FAIL with `Cannot find module '../../api/errors.ts'`.

- [ ] **Step 3: Move shared definitions without editing their bodies**

Move `ApiMethod`, `ApiRequestBody`, `ApiEnvelope`, the exported data types, and `PaginationParams` to `api/types.ts`. Move `getErrorMessage`, record/string readers, JSON extraction, compacting, provider-friendly mapping, and `normalizeApiErrorMessage` to `api/errors.ts`. Export the error normalizer exactly:

```ts
export function normalizeApiErrorMessage(message: unknown, fallback = '操作失败') {
  // Existing implementation moved verbatim.
}
```

Move `req`, `uploadReq`, and the generic `api` object to `api/client.ts`, using these imports:

```ts
import { normalizeApiErrorMessage } from './errors.ts'
import type { ApiEnvelope, ApiEntity, ApiRequestBody } from './types.ts'

const BASE = '/api/v1'

export const api = {
  get: <T = ApiEntity>(path: string) => req<T>('GET', path),
  post: <T = ApiEntity>(path: string, body?: ApiRequestBody) => req<T>('POST', path, body),
  put: <T = ApiEntity>(path: string, body?: ApiRequestBody) => req<T>('PUT', path, body),
  patch: <T = ApiEntity>(path: string, body?: ApiRequestBody) => req<T>('PATCH', path, body),
  del: <T = ApiEntity>(path: string) => req<T>('DELETE', path),
}

export const uploadRequest = uploadReq
```

Re-export moved names from `useApi.ts` while its domain objects remain in place:

```ts
export { api } from '../api/client.ts'
export { normalizeApiErrorMessage } from '../api/errors.ts'
export type * from '../api/types.ts'
```

- [ ] **Step 4: Run focused behavior and type verification**

Run: `node node_modules/tsx/dist/cli.mjs src/composables/__tests__/upload-api.test.ts`

Expected: all three upload/error tests PASS.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Commit the shared client extraction**

```bash
git add frontend/src/api/client.ts frontend/src/api/errors.ts frontend/src/api/types.ts frontend/src/composables/useApi.ts frontend/src/composables/__tests__/upload-api.test.ts
git commit -m "refactor(frontend): extract shared API transport"
```

### Task 2: Extract authentication, project, and media domains

**Files:**
- Create: `frontend/src/api/auth.ts`
- Create: `frontend/src/api/projects.ts`
- Create: `frontend/src/api/media.ts`
- Modify: `frontend/src/composables/useApi.ts`
- Test: `frontend/src/composables/__tests__/upload-api.test.ts`

**Interfaces:**
- Produces: `authAPI`, `uploadAPI`, `dramaAPI`, `chapterAPI`, `storyboardAPI`, `characterAPI`, `characterAssetAPI`, `sceneAPI`, `imageAPI`, `gridAPI`, `videoAPI`, `composeAPI`, and `mergeAPI`.
- Consumes: `api`, `uploadRequest`, and types from Task 1.

- [ ] **Step 1: Add direct domain imports to the upload test**

```ts
import { uploadAPI as facadeUploadAPI } from '../useApi.ts'
import { uploadAPI } from '../../api/auth.ts'

assert.strictEqual(facadeUploadAPI, uploadAPI)
```

- [ ] **Step 2: Run the test and verify the auth module is missing**

Run: `node node_modules/tsx/dist/cli.mjs src/composables/__tests__/upload-api.test.ts`

Expected: FAIL with `Cannot find module '../../api/auth.ts'`.

- [ ] **Step 3: Move domain objects and their private helpers**

Move authentication and all upload helpers to `auth.ts`; move drama through scene objects to `projects.ts`; move image through video plus compose/merge objects to `media.ts`. Each module imports the shared client and types directly, for example:

```ts
import { api, uploadRequest } from './client.ts'
import type { ApiRequestBody, Drama, Episode, UploadResult } from './types.ts'

export const dramaAPI = {
  list: () => api.get<Drama[]>('/dramas'),
  get: (id: number) => api.get<Drama>(`/dramas/${id}`),
  create: (data: ApiRequestBody) => api.post<Drama>('/dramas', data),
  update: (id: number, data: ApiRequestBody) => api.put<Drama>(`/dramas/${id}`, data),
  del: (id: number) => api.del(`/dramas/${id}`),
}
```

Use the exact existing method bodies and paths when moving every object. Replace their old definitions in `useApi.ts` with re-exports:

```ts
export { authAPI, uploadAPI } from '../api/auth.ts'
export {
  dramaAPI, chapterAPI, storyboardAPI, characterAPI, characterAssetAPI, sceneAPI,
} from '../api/projects.ts'
export { imageAPI, gridAPI, videoAPI, composeAPI, mergeAPI } from '../api/media.ts'
```

- [ ] **Step 4: Run upload tests and typecheck**

Run: `node node_modules/tsx/dist/cli.mjs src/composables/__tests__/upload-api.test.ts`

Expected: all tests PASS, including facade identity.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Commit the content-domain extraction**

```bash
git add frontend/src/api/auth.ts frontend/src/api/projects.ts frontend/src/api/media.ts frontend/src/composables/useApi.ts frontend/src/composables/__tests__/upload-api.test.ts
git commit -m "refactor(frontend): extract API domain modules"
```

### Task 3: Extract billing/configuration and lock the compatibility facade

**Files:**
- Create: `frontend/src/api/billing.ts`
- Create: `frontend/src/api/configuration.ts`
- Modify: `frontend/src/composables/useApi.ts`
- Create: `frontend/src/composables/__tests__/api-module-boundary.test.ts`

**Interfaces:**
- Produces: the remaining wallet, payment, configuration, skills, preferences, and automation exports.
- Guarantees: every former `useApi.ts` value and type remains importable from the same path.

- [ ] **Step 1: Write the failing facade boundary test**

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import * as facade from '../useApi.ts'
import { walletAPI, paymentAPI } from '../../api/billing.ts'
import { aiConfigAPI, agentConfigAPI, skillsAPI, preferencesAPI, automationAPI } from '../../api/configuration.ts'

assert.strictEqual(facade.walletAPI, walletAPI)
assert.strictEqual(facade.paymentAPI, paymentAPI)
assert.strictEqual(facade.aiConfigAPI, aiConfigAPI)
assert.strictEqual(facade.agentConfigAPI, agentConfigAPI)
assert.strictEqual(facade.skillsAPI, skillsAPI)
assert.strictEqual(facade.preferencesAPI, preferencesAPI)
assert.strictEqual(facade.automationAPI, automationAPI)

const source = readFileSync(fileURLToPath(new URL('../useApi.ts', import.meta.url)), 'utf8')
assert.equal(source.includes('fetch('), false)
assert.equal(source.split(/\r?\n/).length < 80, true)
console.log('PASS useApi remains a thin compatibility facade')
```

- [ ] **Step 2: Run the test and verify missing domain modules**

Run: `node node_modules/tsx/dist/cli.mjs src/composables/__tests__/api-module-boundary.test.ts`

Expected: FAIL because `api/billing.ts` or `api/configuration.ts` does not exist.

- [ ] **Step 3: Move the final domains and reduce the facade**

Move `paginationQuery`, `walletAPI`, and `paymentAPI` to `billing.ts`. Move `aiConfigAPI`, `agentConfigAPI`, `skillsAPI`, `preferencesAPI`, and `automationAPI` to `configuration.ts`. Final `useApi.ts` contains only re-exports:

```ts
export { api } from '../api/client.ts'
export { normalizeApiErrorMessage } from '../api/errors.ts'
export type * from '../api/types.ts'
export { authAPI, uploadAPI } from '../api/auth.ts'
export * from '../api/projects.ts'
export * from '../api/media.ts'
export * from '../api/billing.ts'
export * from '../api/configuration.ts'
```

- [ ] **Step 4: Run focused and full verification**

Run: `node node_modules/tsx/dist/cli.mjs src/composables/__tests__/api-module-boundary.test.ts`

Expected: PASS.

Run: `npm test`

Expected: all frontend unit and layout tests PASS.

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm run build`

Expected: Vite production build succeeds.

- [ ] **Step 5: Commit the completed API refactor**

```bash
git add frontend/src/api/billing.ts frontend/src/api/configuration.ts frontend/src/composables/useApi.ts frontend/src/composables/__tests__/api-module-boundary.test.ts
git commit -m "refactor(frontend): split API client by domain"
```
