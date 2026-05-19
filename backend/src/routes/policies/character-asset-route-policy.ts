type RouteBody = Record<string, unknown>

export type CharacterAssetBody = RouteBody & {
  name?: string
  gender?: string
  role_preset?: string
  image_url?: string
  local_path?: string
  description?: string
  appearance?: string
  tags?: unknown
  is_default?: boolean
  is_active?: boolean
}

export type CharacterAssetPublicSource = {
  id: number
  name: string
  gender?: string | null
  rolePreset?: string | null
  imageUrl?: string | null
  localPath?: string | null
  description?: string | null
  appearance?: string | null
  tags?: string | null
  isDefault?: boolean | number | null
  isActive?: boolean | number | null
  createdAt?: string | null
  updatedAt?: string | null
}

const VALID_GENDERS = new Set(['male', 'female', 'unknown'])
const VALID_ROLE_PRESETS = new Set(['male_lead', 'female_lead', 'supporting', 'villain', 'custom'])

function hasOwn(body: RouteBody, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key)
}

function normalizeGender(value: unknown) {
  const gender = String(value || '').trim()
  return VALID_GENDERS.has(gender) ? gender : 'unknown'
}

function normalizeRolePreset(value: unknown) {
  const rolePreset = String(value || '').trim()
  return VALID_ROLE_PRESETS.has(rolePreset) ? rolePreset : 'custom'
}

function stringifyTags(value: unknown) {
  if (Array.isArray(value)) {
    const tags = value.map(item => String(item || '').trim()).filter(Boolean)
    return tags.length ? JSON.stringify([...new Set(tags)]) : null
  }
  if (typeof value === 'string') {
    const tags = value.split(/[,，\n]/).map(item => item.trim()).filter(Boolean)
    return tags.length ? JSON.stringify([...new Set(tags)]) : null
  }
  return null
}

function parseTags(value: string | null | undefined) {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(item => String(item || '').trim()).filter(Boolean) : []
  } catch {
    return value.split(/[,，\n]/).map(item => item.trim()).filter(Boolean)
  }
}

export function validateCharacterAssetCreateBody(body: CharacterAssetBody) {
  if (!body.name || !body.image_url) return 'name and image_url are required'
  return null
}

export function buildCharacterAssetCreateValues(body: CharacterAssetBody, timestamp: string) {
  return {
    name: String(body.name || '').trim(),
    gender: normalizeGender(body.gender),
    rolePreset: normalizeRolePreset(body.role_preset),
    imageUrl: String(body.image_url || '').trim(),
    localPath: body.local_path ? String(body.local_path).trim() : null,
    description: body.description ? String(body.description).trim() : null,
    appearance: body.appearance ? String(body.appearance).trim() : null,
    tags: stringifyTags(body.tags),
    isDefault: Boolean(body.is_default),
    isActive: body.is_active !== false,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function buildCharacterAssetUpdatePatch(body: CharacterAssetBody, updatedAt: string) {
  const patch: Record<string, unknown> = { updatedAt }
  if (hasOwn(body, 'name')) patch.name = String(body.name || '').trim()
  if (hasOwn(body, 'gender')) patch.gender = normalizeGender(body.gender)
  if (hasOwn(body, 'role_preset')) patch.rolePreset = normalizeRolePreset(body.role_preset)
  if (hasOwn(body, 'image_url')) patch.imageUrl = String(body.image_url || '').trim()
  if (hasOwn(body, 'local_path')) patch.localPath = body.local_path ? String(body.local_path).trim() : null
  if (hasOwn(body, 'description')) patch.description = body.description ? String(body.description).trim() : null
  if (hasOwn(body, 'appearance')) patch.appearance = body.appearance ? String(body.appearance).trim() : null
  if (hasOwn(body, 'tags')) patch.tags = stringifyTags(body.tags)
  if (hasOwn(body, 'is_default')) patch.isDefault = Boolean(body.is_default)
  if (hasOwn(body, 'is_active')) patch.isActive = Boolean(body.is_active)
  return patch
}

export function buildCharacterAssetPublicPayload(row: CharacterAssetPublicSource) {
  return {
    id: row.id,
    name: row.name,
    gender: row.gender || 'unknown',
    role_preset: row.rolePreset || 'custom',
    image_url: row.imageUrl || '',
    local_path: row.localPath || '',
    description: row.description || '',
    appearance: row.appearance || '',
    tags: parseTags(row.tags),
    is_default: Boolean(row.isDefault),
    is_active: row.isActive !== false && row.isActive !== 0,
    created_at: row.createdAt || null,
    updated_at: row.updatedAt || null,
  }
}
