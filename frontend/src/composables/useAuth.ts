import { computed, reactive } from 'vue'
import { authAPI, type AuthLoginPayload, type AuthRegisterPayload, type AuthSession, type AuthUser } from './useApi.ts'

const AUTH_STORAGE_KEY = 'aidrama-auth'

export type AuthStorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type StoredAuth = {
  token: string
  user: AuthUser
}

type AuthState = {
  token: string | null
  user: AuthUser | null
  hydrated: boolean
}

const state = reactive<AuthState>({
  token: null,
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
    if (typeof parsed.token !== 'string' || !parsed.token || !isAuthUser(parsed.user)) return null
    return { token: parsed.token, user: parsed.user }
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

export function hydrateAuthState(storage: AuthStorageLike | null = browserStorage()) {
  if (state.hydrated) return
  const stored = readStoredAuth(storage)
  state.token = stored?.token ?? null
  state.user = stored?.user ?? null
  state.hydrated = true
}

function applySession(session: AuthSession, storage: AuthStorageLike | null = browserStorage()) {
  state.token = session.token
  state.user = session.user
  state.hydrated = true
  writeStoredAuth(storage, session)
}

export function getAuthToken() {
  hydrateAuthState()
  return state.token
}

export function useAuth() {
  hydrateAuthState()
  const isAuthenticated = computed(() => !!state.token && !!state.user)

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
    if (!state.token) return null
    try {
      const session = await authAPI.session()
      state.user = session.user
      return session.user
    } catch {
      clear()
      return null
    }
  }

  async function logout() {
    try {
      await authAPI.logout()
    } finally {
      clear()
    }
  }

  function clear() {
    state.token = null
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
