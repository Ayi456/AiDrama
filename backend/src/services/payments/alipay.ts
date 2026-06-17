import * as AlipaySdkModule from 'alipay-sdk'

import { ensureProjectEnvLoaded } from '../../utils/project-env.js'

export type AlipayPagePayParams = {
  orderNo: string
  amount: string
  subject: string
  body: string
  returnUrl: string
  notifyUrl: string
}

function normalizePem(value: string) {
  const trimmed = value.trim().replace(/\\n/g, '\n')
  if (trimmed.includes('BEGIN')) return trimmed

  const compact = trimmed.replace(/\s/g, '')
  const lines = compact.match(/.{1,64}/g)?.join('\n') || compact
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`
}

function detectPrivateKeyType(value: string) {
  return value.includes('BEGIN RSA PRIVATE KEY') ? 'PKCS1' : 'PKCS8'
}

function readConfig() {
  ensureProjectEnvLoaded()
  const appId = process.env.ALIPAY_APP_ID || ''
  const privateKey = process.env.ALIPAY_PRIVATE_KEY || ''
  const alipayPublicKey = process.env.ALIPAY_PUBLIC_KEY || ''
  const gateway = process.env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do'

  if (!appId || !privateKey) {
    throw new Error('Alipay config missing: ALIPAY_APP_ID and ALIPAY_PRIVATE_KEY are required')
  }

  return {
    appId,
    privateKey: normalizePem(privateKey),
    alipayPublicKey: alipayPublicKey ? alipayPublicKey.trim().replace(/\\n/g, '\n') : '',
    gateway,
  }
}

function createAlipaySdk() {
  const config = readConfig()
  const AlipaySdkCtor = (
    (AlipaySdkModule as unknown as { default?: unknown }).default
    || (AlipaySdkModule as unknown as { AlipaySdk?: unknown }).AlipaySdk
    || AlipaySdkModule
  ) as new (options: Record<string, unknown>) => {
    pageExec(method: string, params: Record<string, unknown>): string
    checkNotifySign(params: Record<string, unknown>): boolean
  }

  return new AlipaySdkCtor({
    appId: config.appId,
    privateKey: config.privateKey,
    keyType: detectPrivateKeyType(config.privateKey),
    alipayPublicKey: config.alipayPublicKey || undefined,
    gateway: config.gateway,
    timeout: 5000,
    camelCase: true,
    charset: 'utf-8',
    version: '1.0',
    signType: 'RSA2',
  })
}

export function createAlipayPagePayForm(params: AlipayPagePayParams): string {
  const alipay = createAlipaySdk()
  return alipay.pageExec('alipay.trade.page.pay', {
    bizContent: {
      outTradeNo: params.orderNo,
      productCode: 'FAST_INSTANT_TRADE_PAY',
      totalAmount: params.amount,
      subject: params.subject,
      body: params.body,
    },
    returnUrl: params.returnUrl,
    notifyUrl: params.notifyUrl,
  })
}

export function verifyAlipayNotify(params: Record<string, unknown>): boolean {
  if (!process.env.ALIPAY_PUBLIC_KEY) return false
  try {
    return createAlipaySdk().checkNotifySign(params)
  } catch {
    return false
  }
}
