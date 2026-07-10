import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/mysql2'
import mysql from 'mysql2/promise'

import { mysqlConfig } from './config.js'
import { installQueryExecutionHelpers } from './query-helpers.js'
import * as schema from './schema.js'

export const mysqlPool = mysql.createPool(mysqlConfig)
export const db = drizzle(mysqlPool, { schema, mode: 'default' })

installQueryExecutionHelpers(db.select().from(schema.dramas))
installQueryExecutionHelpers(db.insert(schema.dramas).values({ title: '', createdAt: '', updatedAt: '' }))
installQueryExecutionHelpers(db.update(schema.dramas).set({ updatedAt: '' }).where(eq(schema.dramas.id, 0)))
installQueryExecutionHelpers(db.delete(schema.dramas).where(eq(schema.dramas.id, 0)))

export { schema }
export type DB = typeof db
