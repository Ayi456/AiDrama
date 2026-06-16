import type { CurrentUser } from '../../middleware/auth.js'

export type OwnedRow = {
  userId?: number | null
}

export function ownerIdFromCurrentUser(user: Pick<CurrentUser, 'id'>) {
  return Number(user.id)
}

export function isOwnedByUser(row: OwnedRow | null | undefined, userId: number) {
  return !!row && Number(row.userId) === Number(userId)
}

export function filterRowsOwnedByUser<T extends OwnedRow>(rows: T[], userId: number) {
  return rows.filter((row) => isOwnedByUser(row, userId))
}
