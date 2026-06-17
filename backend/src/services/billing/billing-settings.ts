import type { RowDataPacket } from 'mysql2'

import { mysqlPool } from '../../db/index.js'
import { now } from '../../utils/response.js'
import { assertBillingPrice, toMoney, type MoneyString } from './money.js'

type BillingSettingRow = RowDataPacket & {
  setting_value: string
}

export const VIDEO_PRICE_PER_SECOND_KEY = 'video_price_per_second'

export async function getVideoPricePerSecond(): Promise<MoneyString> {
  const [rows] = await mysqlPool.execute<BillingSettingRow[]>(
    `SELECT setting_value
       FROM billing_settings
      WHERE setting_key = ?
      LIMIT 1`,
    [VIDEO_PRICE_PER_SECOND_KEY],
  )
  return toMoney(rows[0]?.setting_value || '1.00')
}

export async function setVideoPricePerSecond(value: string): Promise<MoneyString> {
  const price = assertBillingPrice(value)
  await mysqlPool.execute(
    `INSERT INTO billing_settings (setting_key, setting_value, updated_at)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = VALUES(updated_at)`,
    [VIDEO_PRICE_PER_SECOND_KEY, price, now()],
  )
  return price
}
