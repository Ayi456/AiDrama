import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const KEY_LENGTH = 64
const PASSWORD_PREFIX = 'scrypt'

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const derived = await scrypt(password, salt, KEY_LENGTH) as Buffer
  return `${PASSWORD_PREFIX}:${salt}:${derived.toString('hex')}`
}

export async function verifyPassword(password: string, storedHash: string) {
  const [prefix, salt, hash] = storedHash.split(':')
  if (prefix !== PASSWORD_PREFIX || !salt || !hash) return false

  const expected = Buffer.from(hash, 'hex')
  if (expected.length !== KEY_LENGTH) return false

  const actual = await scrypt(password, salt, KEY_LENGTH) as Buffer
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
