export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
export type ApiRequestBody = Record<string, unknown> | unknown[] | string | number | boolean | null
export type ApiEnvelope<T> = {
  code?: number
  data?: T
  message?: string
}

export type ApiEntity = Record<string, unknown> & { id?: number }
export type ApiList<T> = { items: T[] }
export type UploadResult = { url: string; path: string }
export type DirectUploadTarget = UploadResult & {
  upload_url?: string
  uploadUrl?: string
  method?: string
  headers?: Record<string, string>
}
export type AuthUser = {
  id: number
  username: string
  email: string
  phone: string
  status: string
  createdAt?: string
  lastLoginAt?: string | null
}
export type AuthSession = { user: AuthUser }
export type AuthLoginPayload = { identifier: string; password: string }
export type AuthRegisterPayload = {
  username: string
  email: string
  phone: string
  password: string
  sms_code: string
}
export type AuthSmsCodePayload = {
  message?: string
  dev_code?: string
  expires_in?: number
}
export type Drama = ApiEntity & { title?: string; characters?: DramaCharacter[]; scenes?: Scene[] }
export type Episode = ApiEntity & { drama_id?: number; dramaId?: number; title?: string }
export type CharacterAsset = ApiEntity & {
  name?: string
  gender?: string
  role_preset?: string
  image_url?: string
  reference_image?: string | null
  referenceImage?: string | null
  local_path?: string
  description?: string
  appearance?: string
  tags?: string[]
  is_default?: boolean
  is_active?: boolean
}
export type DramaCharacter = ApiEntity & {
  name?: string
  role?: string
  description?: string
  appearance?: string
  personality?: string
  image_url?: string
  imageUrl?: string
  image_prompt?: string | null
  imagePrompt?: string | null
  character_asset_id?: number | null
  characterAssetId?: number | null
  character_asset?: CharacterAsset | null
  characterAsset?: CharacterAsset | null
  character_asset_image_url?: string | null
  characterAssetImageUrl?: string | null
}
export type Scene = ApiEntity & {
  location?: string
  time?: string
  prompt?: string
  image_url?: string
  imageUrl?: string
  reference_image?: string | null
  referenceImage?: string | null
}
export type Storyboard = ApiEntity & {
  storyboard_number?: number
  storyboardNumber?: number
  director_intent?: string | null
  directorIntent?: string | null
  audience_info_change?: string | null
  audienceInfoChange?: string | null
  emotion_shift?: string | null
  emotionShift?: string | null
  dramatic_value?: string | null
  dramaticValue?: string | null
  first_frame_prompt?: string | null
  firstFramePrompt?: string | null
  last_frame_prompt?: string | null
  lastFramePrompt?: string | null
  transition_in?: string | null
  transitionIn?: string | null
  transition_out?: string | null
  transitionOut?: string | null
  screen_direction?: string | null
  screenDirection?: string | null
  audio_bridge?: string | null
  audioBridge?: string | null
  negative_prompt?: string | null
  negativePrompt?: string | null
  fallback_plan?: string | null
  fallbackPlan?: string | null
  handle_in_ms?: number | null
  handleInMs?: number | null
  handle_out_ms?: number | null
  handleOutMs?: number | null
  first_frame_image?: string
  firstFrameImage?: string
  last_frame_image?: string
  lastFrameImage?: string
  video_url?: string
  videoUrl?: string
}
export type AiConfig = ApiEntity & {
  service_type?: string
  provider?: string
  name?: string
  base_url?: string
  model?: unknown
  settings?: Record<string, unknown>
  priority?: number
  is_active?: boolean
  has_api_key?: boolean
}
export type AgentConfig = ApiEntity & { type?: string; name?: string }
export type SkillSummary = { id: string; name: string; description: string }
export type GridLayout = { rows: number; cols: number }
export type GridPromptCell = Record<string, unknown> & {
  shot_number?: number
  frame_type?: string
  prompt?: string
}
export type GridPromptResponse = {
  grid_prompt: string
  cell_prompts: GridPromptCell[]
  source?: string
  grid?: GridLayout
}
export type GridGenerateResponse = {
  image_generation_id: number
  grid: GridLayout
  mode?: string
  storyboard_ids?: number[]
  prompt?: string
  reference_images?: string[]
}
export type GenerationStatus = ApiEntity & {
  status?: string
  error_msg?: string
  errorMsg?: string
}
export type ImageGeneration = GenerationStatus & {
  image_generation_id?: number
  imageGenerationId?: number
  local_path?: string
  localPath?: string
  image_url?: string
  imageUrl?: string
  minio_url?: string
  minioUrl?: string
}
export type VideoGeneration = GenerationStatus & {
  video_generation_id?: number
  videoGenerationId?: number
  effective_generation_id?: number
  effectiveGenerationId?: number
  regeneration_id?: number
  regenerationId?: number
  effective_status?: string
  effectiveStatus?: string
  original_status?: string
  originalStatus?: string
  effective_error_msg?: string
  effectiveErrorMsg?: string
  local_path?: string
  localPath?: string
  video_url?: string
  videoUrl?: string
  effective_video_url?: string
  effectiveVideoUrl?: string
  minio_url?: string
  minioUrl?: string
  provider?: string
  model?: string
  prompt?: string
  billing_status?: string
  billingStatus?: string
  billed_seconds?: string
  billedSeconds?: string
  billing_amount?: string
  billingAmount?: string
  billing_error?: string
  billingError?: string
  created_at?: string
  createdAt?: string
}
export type ImageGenerationStart = {
  image_generation_id: number
  imageGenerationId?: number
}
export type WalletSummary = {
  balance: string
  totalRecharged: string
  totalConsumed: string
  videoPricePerSecond: string
}
export type WalletVideoUsage = {
  videoGenerationId?: number | null
  video_generation_id?: number | null
  taskId?: string | null
  task_id?: string | null
  provider?: string | null
  model?: string | null
  duration?: number | string | null
  resolution?: string | null
  aspectRatio?: string | null
  aspect_ratio?: string | null
  completionTokens?: number | string | null
  completion_tokens?: number | string | null
  totalTokens?: number | string | null
  total_tokens?: number | string | null
  raw?: unknown
}
export type WalletTransaction = {
  transactionNo?: string
  transaction_no?: string
  amount: string
  balanceAfter?: string
  balance_after?: string
  type: string
  description?: string
  relatedOrderNo?: string
  related_order_no?: string
  relatedVideoGenerationId?: number
  related_video_generation_id?: number
  createdAt?: string
  created_at?: string
  videoUsage?: WalletVideoUsage | null
  video_usage?: WalletVideoUsage | null
}
export type PaymentOrder = {
  orderNo?: string
  order_no?: string
  amount: string
  status: string
  provider?: string
  alipayTradeNo?: string
  alipay_trade_no?: string
  paidAt?: string
  paid_at?: string
  createdAt?: string
  created_at?: string
}
export type RechargeOrder = { orderNo: string; amount: string; paymentFormHtml: string }
export type PendingVideoSettlement = {
  videoGenerationId: number
  storyboardId?: number
  title?: string
  durationSeconds: string
  amountDue: string
  billingStatus: string
  generationStatus?: string
  createdAt?: string
}
export type MergeClipSelection = { storyboard_id: number; video_url: string }
export type PaginatedResponse<T> = {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}
export type PaginationParams = { page?: number; pageSize?: number; limit?: number }
export type AutomationPreferences = {
  userId: string
  autoPipelineEnabled: boolean
  autoPipelineMaxRetries: number
  autoPipelineConcurrencyImage: number
  autoPipelineConcurrencyVideo: number
}
export type AutomationStage = 'extract' | 'character_image' | 'scene_image' | 'video' | 'merge' | 'done'
export type AutomationStatusValue = 'idle' | 'running' | 'paused' | 'failed' | 'done'
export type AutomationStatusPayload = {
  status: AutomationStatusValue
  stage: AutomationStage
  attempt: number
  error: string | null
  progress: { current: number; total: number; label: string }
}
