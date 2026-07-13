import type { Pool, RowDataPacket } from 'mysql2/promise'

import { identifier } from './config.js'

async function ensureColumn(pool: Pool, database: string, table: string, column: string, definition: string) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 AS ok
       FROM information_schema.columns
      WHERE table_schema = ?
        AND table_name = ?
        AND column_name = ?
      LIMIT 1`,
    [database, table, column],
  )

  if (!rows.length) {
    await pool.query(`ALTER TABLE ${identifier(table)} ADD COLUMN ${identifier(column)} ${definition}`)
  }
}

async function ensureIndex(pool: Pool, database: string, table: string, indexName: string, columnsSql: string) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 AS ok
       FROM information_schema.statistics
      WHERE table_schema = ?
        AND table_name = ?
        AND index_name = ?
      LIMIT 1`,
    [database, table, indexName],
  )

  if (!rows.length) {
    await pool.query(`ALTER TABLE ${identifier(table)} ADD INDEX ${identifier(indexName)} ${columnsSql}`)
  }
}

async function backfillOwnerColumns(pool: Pool) {
  const [users] = await pool.query<RowDataPacket[]>('SELECT id FROM users ORDER BY id LIMIT 1')
  const fallbackUserId = Number(users[0]?.id || 0)
  if (!fallbackUserId) return

  await pool.query('UPDATE dramas SET user_id = ? WHERE user_id IS NULL', [fallbackUserId])
  await pool.query('UPDATE character_assets SET user_id = ? WHERE user_id IS NULL', [fallbackUserId])
  await pool.query(
    `UPDATE assets a
        JOIN dramas d ON d.id = a.drama_id
       SET a.user_id = d.user_id
     WHERE a.user_id IS NULL
       AND d.user_id IS NOT NULL`,
  )
  await pool.query('UPDATE assets SET user_id = ? WHERE user_id IS NULL', [fallbackUserId])
}

export async function runAdditiveMigrations(pool: Pool, database: string) {
  await ensureColumn(pool, database, 'episodes', 'image_config_id', 'INT')
  await ensureColumn(pool, database, 'episodes', 'video_config_id', 'INT')
  await ensureColumn(pool, database, 'episodes', 'transition_type', 'VARCHAR(32)')
  await ensureColumn(pool, database, 'episodes', 'transition_duration_ms', 'INT')
  await ensureColumn(pool, database, 'episodes', 'automation_status', "VARCHAR(16) NOT NULL DEFAULT 'idle'")
  await ensureColumn(pool, database, 'episodes', 'automation_stage', "VARCHAR(32) NOT NULL DEFAULT 'extract'")
  await ensureColumn(pool, database, 'episodes', 'automation_attempt', 'INT NOT NULL DEFAULT 0')
  await ensureColumn(pool, database, 'episodes', 'automation_error', 'TEXT')
  await ensureColumn(pool, database, 'episodes', 'automation_storyboard_chunk', 'INT NOT NULL DEFAULT 0')
  await ensureColumn(pool, database, 'video_merges', 'transition_type', 'VARCHAR(32)')
  await ensureColumn(pool, database, 'video_merges', 'transition_duration_ms', 'INT')
  await ensureColumn(pool, database, 'video_merges', 'claimed_at', 'VARCHAR(32)')
  await ensureColumn(pool, database, 'dramas', 'image_config_id', 'INT')
  await ensureColumn(pool, database, 'dramas', 'video_config_id', 'INT')
  await ensureColumn(pool, database, 'dramas', 'user_id', 'INT')
  await ensureColumn(pool, database, 'characters', 'character_asset_id', 'INT')
  await ensureColumn(pool, database, 'characters', 'image_prompt', 'TEXT')
  await ensureColumn(pool, database, 'character_assets', 'user_id', 'INT')
  await ensureColumn(pool, database, 'character_assets', 'reference_image', 'TEXT')
  await ensureColumn(pool, database, 'assets', 'user_id', 'INT')
  await ensureColumn(pool, database, 'image_generations', 'character_asset_id', 'INT')
  await ensureColumn(pool, database, 'image_generations', 'normalized_request', 'TEXT')
  await ensureColumn(pool, database, 'image_generations', 'provider_request', 'TEXT')
  await ensureColumn(pool, database, 'image_generations', 'provider_response', 'TEXT')
  await ensureColumn(pool, database, 'image_generations', 'provider_usage_completion_tokens', 'BIGINT')
  await ensureColumn(pool, database, 'image_generations', 'provider_usage_total_tokens', 'BIGINT')
  await ensureColumn(pool, database, 'image_generations', 'provider_usage_raw', 'TEXT')
  await ensureColumn(pool, database, 'video_generations', 'normalized_request', 'TEXT')
  await ensureColumn(pool, database, 'video_generations', 'user_id', 'INT')
  await ensureColumn(pool, database, 'video_generations', 'provider_request', 'TEXT')
  await ensureColumn(pool, database, 'video_generations', 'provider_response', 'TEXT')
  await ensureColumn(pool, database, 'video_generations', 'provider_usage_completion_tokens', 'BIGINT')
  await ensureColumn(pool, database, 'video_generations', 'provider_usage_total_tokens', 'BIGINT')
  await ensureColumn(pool, database, 'video_generations', 'provider_usage_raw', 'TEXT')
  await ensureColumn(pool, database, 'video_generations', 'reference_video_urls', 'TEXT')
  await ensureColumn(pool, database, 'video_generations', 'reference_audio_urls', 'TEXT')
  await ensureColumn(pool, database, 'video_generations', 'defect_check_attempt', 'INT DEFAULT 0')
  await ensureColumn(pool, database, 'video_generations', 'defect_check_parent_id', 'INT')
  await ensureColumn(pool, database, 'video_generations', 'defect_check_result', 'TEXT')
  await ensureColumn(pool, database, 'video_generations', 'tail_frame_url', 'TEXT')
  await ensureColumn(pool, database, 'video_generations', 'billing_status', "VARCHAR(32) NOT NULL DEFAULT 'unbilled'")
  await ensureColumn(pool, database, 'video_generations', 'billed_seconds', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00')
  await ensureColumn(pool, database, 'video_generations', 'billing_amount', 'DECIMAL(12,2) NOT NULL DEFAULT 0.00')
  await ensureColumn(pool, database, 'video_generations', 'billing_error', 'TEXT')
  await ensureColumn(pool, database, 'video_generations', 'pending_video_url', 'TEXT')
  await ensureColumn(pool, database, 'video_generations', 'pending_local_path', 'TEXT')
  await ensureColumn(pool, database, 'video_generations', 'pending_duration_seconds', 'DECIMAL(10,2)')
  await ensureColumn(pool, database, 'scenes', 'reference_image', 'TEXT')
  await ensureColumn(pool, database, 'storyboards', 'transition_type', 'VARCHAR(32)')
  await ensureColumn(pool, database, 'storyboards', 'transition_duration_ms', 'INT')
  await ensureColumn(pool, database, 'storyboards', 'director_intent', 'TEXT')
  await ensureColumn(pool, database, 'storyboards', 'audience_info_change', 'TEXT')
  await ensureColumn(pool, database, 'storyboards', 'emotion_shift', 'TEXT')
  await ensureColumn(pool, database, 'storyboards', 'dramatic_value', 'TEXT')
  await ensureColumn(pool, database, 'storyboards', 'first_frame_prompt', 'TEXT')
  await ensureColumn(pool, database, 'storyboards', 'last_frame_prompt', 'TEXT')
  await ensureColumn(pool, database, 'storyboards', 'transition_in', 'TEXT')
  await ensureColumn(pool, database, 'storyboards', 'transition_out', 'TEXT')
  await ensureColumn(pool, database, 'storyboards', 'screen_direction', 'TEXT')
  await ensureColumn(pool, database, 'storyboards', 'audio_bridge', 'TEXT')
  await ensureColumn(pool, database, 'storyboards', 'negative_prompt', 'TEXT')
  await ensureColumn(pool, database, 'storyboards', 'fallback_plan', 'TEXT')
  await ensureColumn(pool, database, 'storyboards', 'handle_in_ms', 'INT DEFAULT 500')
  await ensureColumn(pool, database, 'storyboards', 'handle_out_ms', 'INT DEFAULT 500')

  await ensureIndex(pool, database, 'video_generations', 'idx_video_generations_storyboard_id_id', '(`storyboard_id`, `id`)')
  await ensureIndex(pool, database, 'video_generations', 'idx_video_generations_drama_id_id', '(`drama_id`, `id`)')
  await ensureIndex(pool, database, 'video_generations', 'idx_video_generations_user_id_id', '(`user_id`, `id`)')
  await ensureIndex(pool, database, 'dramas', 'idx_dramas_user_id_deleted_at', '(`user_id`, `deleted_at`(32))')
  await ensureIndex(pool, database, 'character_assets', 'idx_character_assets_user_id_deleted_at', '(`user_id`, `deleted_at`(32))')
  await ensureIndex(pool, database, 'assets', 'idx_assets_user_id_deleted_at', '(`user_id`, `deleted_at`(32))')
  await ensureIndex(pool, database, 'users', 'uniq_users_username', '(`username`)')
  await ensureIndex(pool, database, 'users', 'uniq_users_email', '(`email`)')
  await ensureIndex(pool, database, 'users', 'uniq_users_phone', '(`phone`)')
  await ensureIndex(pool, database, 'auth_sessions', 'idx_auth_sessions_user_id', '(`user_id`)')
  await ensureIndex(pool, database, 'sms_codes', 'idx_sms_codes_phone_purpose', '(`phone`, `purpose`)')
  await ensureIndex(pool, database, 'wallet_transactions', 'idx_wallet_transactions_user_created', '(`user_id`, `created_at`)')
  await ensureIndex(pool, database, 'wallet_transactions', 'idx_wallet_transactions_order', '(`related_order_no`)')
  await ensureIndex(pool, database, 'wallet_transactions', 'idx_wallet_transactions_video', '(`related_video_generation_id`)')
  await ensureIndex(pool, database, 'payment_orders', 'idx_payment_orders_user_created', '(`user_id`, `created_at`)')
  await ensureIndex(pool, database, 'payment_orders', 'idx_payment_orders_status', '(`status`)')
  await ensureIndex(pool, database, 'video_billing_events', 'idx_video_billing_user_created', '(`user_id`, `created_at`)')
  await ensureIndex(pool, database, 'video_billing_events', 'idx_video_billing_generation', '(`video_generation_id`)')
  await pool.query(
    `INSERT IGNORE INTO billing_settings (setting_key, setting_value, updated_at)
     VALUES ('video_price_per_second', 1.00, ?)`,
    [new Date().toISOString()],
  )
  await backfillOwnerColumns(pool)
}
