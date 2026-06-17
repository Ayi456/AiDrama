import { setVideoPricePerSecond } from '../services/billing/billing-settings.js'
import { mysqlPool } from '../db/index.js'

const value = process.env.VIDEO_PRICE_PER_SECOND

if (!value) {
  console.error('VIDEO_PRICE_PER_SECOND is required, for example: 1.20')
  process.exitCode = 1
} else {
  try {
    const saved = await setVideoPricePerSecond(value)
    console.log(`video_price_per_second=${saved}`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  } finally {
    await mysqlPool.end()
  }
}
