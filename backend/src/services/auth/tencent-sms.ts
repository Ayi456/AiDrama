import { createHash, createHmac, randomBytes } from 'node:crypto'

export type TencentSmsConfig = {
  enabled: boolean
  missing: string[]
  secretId: string
  secretKey: string
  region: string
  sdkAppId: string
  signName: string
  templateId: string
}

type SmsPayloadInput = {
  phone: string
  code: string
  expireMinutes: number
  sdkAppId: string
  signName: string
  templateId: string
}

type SendSmsInput = SmsPayloadInput & {
  config: TencentSmsConfig
  now?: Date
  fetchImpl?: typeof fetch
}

function envValue(env: Record<string, string | undefined>, key: string) {
  return String(env[key] || '').trim()
}

export function normalizeTencentSmsConfig(env: Record<string, string | undefined> = process.env): TencentSmsConfig {
  const config = {
    secretId: envValue(env, 'TENCENT_SECRET_ID'),
    secretKey: envValue(env, 'TENCENT_SECRET_KEY'),
    region: envValue(env, 'TENCENT_SMS_REGION') || 'ap-guangzhou',
    sdkAppId: envValue(env, 'TENCENT_SMS_SDK_APP_ID'),
    signName: envValue(env, 'TENCENT_SMS_SIGN_NAME'),
    templateId: envValue(env, 'TENCENT_SMS_TEMPLATE_ID'),
  }
  const missing = [
    !config.secretId && 'TENCENT_SECRET_ID',
    !config.secretKey && 'TENCENT_SECRET_KEY',
    !config.sdkAppId && 'TENCENT_SMS_SDK_APP_ID',
    !config.signName && 'TENCENT_SMS_SIGN_NAME',
    !config.templateId && 'TENCENT_SMS_TEMPLATE_ID',
  ].filter(Boolean) as string[]

  return { ...config, enabled: missing.length === 0, missing }
}

export function createSmsCode(random = Math.random) {
  let code = ''
  for (let i = 0; i < 6; i += 1) {
    code += String(Math.floor(random() * 10))
  }
  return code
}

export function createSmsCodeSalt() {
  return randomBytes(12).toString('hex')
}

export function hashSmsCode(phone: string, code: string, salt: string) {
  return createHash('sha256').update(`${phone}:${code}:${salt}`).digest('hex')
}

export function buildTencentSmsPayload(input: SmsPayloadInput) {
  return {
    PhoneNumberSet: [`+86${input.phone}`],
    SmsSdkAppId: input.sdkAppId,
    SignName: input.signName,
    TemplateId: input.templateId,
    TemplateParamSet: [input.code, String(input.expireMinutes)],
  }
}

export function shouldExposeDevSmsCode(nodeEnv = process.env.NODE_ENV) {
  return nodeEnv !== 'production'
}

function sha256Hex(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function hmac(key: Buffer | string, value: string) {
  return createHmac('sha256', key).update(value).digest()
}

function hmacHex(key: Buffer | string, value: string) {
  return createHmac('sha256', key).update(value).digest('hex')
}

function formatUtcDate(input: Date) {
  return input.toISOString().slice(0, 10)
}

export async function sendTencentSmsCode(input: SendSmsInput) {
  const config = input.config
  if (!config.enabled) {
    return { ok: false, message: `腾讯云短信未配置：${config.missing.join(', ')}` }
  }

  const service = 'sms'
  const host = 'sms.tencentcloudapi.com'
  const action = 'SendSms'
  const version = '2021-01-11'
  const algorithm = 'TC3-HMAC-SHA256'
  const timestamp = Math.floor((input.now?.getTime() ?? Date.now()) / 1000)
  const date = formatUtcDate(new Date(timestamp * 1000))
  const payload = JSON.stringify(buildTencentSmsPayload(input))
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`
  const signedHeaders = 'content-type;host;x-tc-action'
  const canonicalRequest = [
    'POST',
    '/',
    '',
    canonicalHeaders,
    signedHeaders,
    sha256Hex(payload),
  ].join('\n')
  const credentialScope = `${date}/${service}/tc3_request`
  const stringToSign = [
    algorithm,
    String(timestamp),
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n')
  const secretDate = hmac(`TC3${config.secretKey}`, date)
  const secretService = hmac(secretDate, service)
  const secretSigning = hmac(secretService, 'tc3_request')
  const signature = hmacHex(secretSigning, stringToSign)
  const authorization = `${algorithm} Credential=${config.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const resp = await (input.fetchImpl || fetch)(`https://${host}`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json; charset=utf-8',
      Host: host,
      'X-TC-Action': action,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Version': version,
      'X-TC-Region': config.region,
    },
    body: payload,
  })
  const json = await resp.json().catch(() => null) as {
    Response?: { SendStatusSet?: Array<{ Code?: string; Message?: string }> }
  } | null
  const status = json?.Response?.SendStatusSet?.[0]

  if (resp.ok && status?.Code === 'Ok') return { ok: true, message: '验证码已发送' }
  return { ok: false, message: status?.Message || `腾讯云短信发送失败 (${resp.status})` }
}
