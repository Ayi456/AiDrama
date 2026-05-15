import { reactive, readonly } from 'vue'

export type ConfirmVariant = 'default' | 'danger'

export type ConfirmOptions = {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: ConfirmVariant
}

type ConfirmState = Required<ConfirmOptions> & {
  open: boolean
}

const defaultState: ConfirmState = {
  open: false,
  title: '确认操作',
  message: '',
  confirmText: '确定',
  cancelText: '取消',
  variant: 'default',
}

export const confirmState = reactive<ConfirmState>({ ...defaultState })

let activeResolver: ((confirmed: boolean) => void) | null = null

function resetConfirmState() {
  Object.assign(confirmState, defaultState)
}

export function requestConfirm(options: ConfirmOptions) {
  if (activeResolver) activeResolver(false)

  Object.assign(confirmState, {
    ...defaultState,
    ...options,
    open: true,
    message: String(options.message || '').trim(),
  })

  return new Promise<boolean>((resolve) => {
    activeResolver = resolve
  })
}

export function resolveConfirm(confirmed: boolean) {
  const resolver = activeResolver
  activeResolver = null
  resetConfirmState()
  if (resolver) resolver(confirmed)
}

export function useConfirm() {
  return {
    confirm: requestConfirm,
  }
}

export function useConfirmController() {
  return {
    confirmState: readonly(confirmState),
    acceptConfirm: () => resolveConfirm(true),
    cancelConfirm: () => resolveConfirm(false),
  }
}
