import { computed, reactive } from 'vue'
import { authAPI, type AuthLoginPayload, type AuthRegisterPayload, type AuthSession, type AuthUser } from './useApi.ts'

const AUTH_STORAGE_KEY = 'aidrama-auth'

export type AuthStorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type StoredAuth = {
  user: AuthUser
}

type AuthState = {
  user: AuthUser | null
  hydrated: boolean
}

const state = reactive<AuthState>({
  user: null,
  hydrated: false,
})

function browserStorage(): AuthStorageLike | null {
  return typeof window !== 'undefined' ? window.localStorage : null
}

function isAuthUser(value: unknown): value is AuthUser {
  const user = value as Partial<AuthUser> | null
  return !!user
    && typeof user.id === 'number'
    && typeof user.username === 'string'
    && typeof user.email === 'string'
    && typeof user.phone === 'string'
    && typeof user.status === 'string'
}

export function createMemoryAuthStorage(): AuthStorageLike {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value)
    },
    removeItem: (key) => {
      map.delete(key)
    },
  }
}

export function readStoredAuth(storage: AuthStorageLike | null = browserStorage()): StoredAuth | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredAuth>
    if (!isAuthUser(parsed.user)) return null
    return { user: parsed.user }
  } catch {
    return null
  }
}

export function writeStoredAuth(storage: AuthStorageLike | null, auth: StoredAuth) {
  storage?.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth))
}

export function clearStoredAuth(storage: AuthStorageLike | null = browserStorage()) {
  storage?.removeItem(AUTH_STORAGE_KEY)
}

export type AuthSessionValidationOptions = {
  storage?: AuthStorageLike | null
  loadSession?: () => Promise<{ user: AuthUser }>
}

export function hydrateAuthState(storage: AuthStorageLike | null = browserStorage()) {
  if (state.hydrated) return
  const stored = readStoredAuth(storage)
  state.user = stored?.user ?? null
  state.hydrated = true
}

function applySession(session: AuthSession, storage: AuthStorageLike | null = browserStorage()) {
  state.user = session.user
  state.hydrated = true
  writeStoredAuth(storage, { user: session.user })
}

export async function validateStoredAuthSession(options: AuthSessionValidationOptions = {}) {
  const storage = Object.hasOwn(options, 'storage') ? options.storage ?? null : browserStorage()
  const stored = readStoredAuth(storage)
  state.user = stored?.user ?? null
  state.hydrated = true

  try {
    const loadSession = options.loadSession ?? authAPI.session
    const session = await loadSession()
    state.user = session.user
    writeStoredAuth(storage, { user: session.user })
    return session.user
  } catch {
    state.user = null
    state.hydrated = true
    clearStoredAuth(storage)
    return null
  }
}

export function useAuth() {
  hydrateAuthState()
  const isAuthenticated = computed(() => !!state.user)

  async function login(payload: AuthLoginPayload) {
    const session = await authAPI.login(payload)
    applySession(session)
    return session
  }

  async function register(payload: AuthRegisterPayload) {
    const session = await authAPI.register(payload)
    applySession(session)
    return session
  }

  async function refreshSession() {
    return validateStoredAuthSession()
  }

  async function logout() {
    try {
      await authAPI.logout()
    } finally {
      clear()
    }
  }

  function clear() {
    state.user = null
    state.hydrated = true
    clearStoredAuth()
  }

  return {
    state,
    isAuthenticated,
    login,
    register,
    refreshSession,
    logout,
    clear,
  }
}
