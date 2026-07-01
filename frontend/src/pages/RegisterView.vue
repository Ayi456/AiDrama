<template>
  <main class="auth-shell">
    <section class="auth-stage auth-stage-register">
      <div class="auth-visual" aria-hidden="true">
        <div class="auth-frame">
          <div class="auth-frame-top">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <div class="auth-frame-body">
            <ShieldCheck :size="42" :stroke-width="1.6" />
            <p>Secure Studio Access</p>
          </div>
        </div>
        <div class="auth-copy">
          <p class="auth-kicker">注册</p>
          <h1>创建你的创作账户</h1>
          <p>短信验证码用于确认手机号，方便后续找回账户。</p>
        </div>
      </div>

      <form class="auth-panel auth-panel-register" @submit.prevent="submit">
        <div class="auth-panel-head">
          <p class="auth-kicker">新账户</p>
          <h2>加入 AiDrama</h2>
          <p>填写基础信息后即可进入工作台。</p>
        </div>

        <label class="auth-field">
          <span>用户名</span>
          <span class="auth-input-wrap">
            <User :size="17" :stroke-width="1.8" class="auth-icon" />
            <input v-model.trim="form.username" class="auth-input" autocomplete="username" placeholder="至少 3 个字符" />
          </span>
        </label>

        <label class="auth-field">
          <span>邮箱</span>
          <span class="auth-input-wrap">
            <Mail :size="17" :stroke-width="1.8" class="auth-icon" />
            <input v-model.trim="form.email" class="auth-input" type="email" autocomplete="email" placeholder="name@example.com" />
          </span>
        </label>

        <label class="auth-field">
          <span>手机号</span>
          <span class="auth-input-wrap">
            <Phone :size="17" :stroke-width="1.8" class="auth-icon" />
            <input v-model.trim="form.phone" class="auth-input" autocomplete="tel" inputmode="tel" maxlength="11" placeholder="请输入 11 位手机号" />
          </span>
        </label>

        <label class="auth-field">
          <span>验证码</span>
          <span class="auth-code-row">
            <span class="auth-input-wrap">
              <ShieldCheck :size="17" :stroke-width="1.8" class="auth-icon" />
              <input v-model.trim="form.smsCode" class="auth-input" inputmode="numeric" maxlength="6" placeholder="6 位数字" />
            </span>
            <button class="auth-secondary-button" type="button" :disabled="codeLoading || countdown > 0" @click="sendCode">
              {{ codeButtonLabel }}
            </button>
          </span>
          <small v-if="devCode" class="auth-helper">开发验证码：{{ devCode }}</small>
        </label>

        <label class="auth-field">
          <span>密码</span>
          <span class="auth-input-wrap">
            <Lock :size="17" :stroke-width="1.8" class="auth-icon" />
            <input v-model="form.password" class="auth-input" type="password" autocomplete="new-password" placeholder="至少 6 个字符" />
          </span>
        </label>

        <label class="auth-field">
          <span>确认密码</span>
          <span class="auth-input-wrap">
            <LockKeyhole :size="17" :stroke-width="1.8" class="auth-icon" />
            <input v-model="confirmPassword" class="auth-input" type="password" autocomplete="new-password" placeholder="再次输入密码" />
          </span>
        </label>

        <p v-if="error" class="auth-error">{{ error }}</p>

        <button class="auth-button" type="submit" :disabled="loading">
          <UserPlus :size="17" :stroke-width="1.8" />
          <span>{{ loading ? '创建中...' : '创建账户' }}</span>
        </button>

        <p class="auth-switch">
          已有账户？
          <RouterLink to="/login">去登录</RouterLink>
        </p>
      </form>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { Lock, LockKeyhole, Mail, Phone, ShieldCheck, User, UserPlus } from 'lucide-vue-next'
import { authAPI } from '../composables/useApi'
import { useAuth } from '../composables/useAuth'
import '@/assets/auth.css'

const form = reactive({
  username: '',
  email: '',
  phone: '',
  smsCode: '',
  password: '',
})
const confirmPassword = ref('')
const loading = ref(false)
const codeLoading = ref(false)
const countdown = ref(0)
const devCode = ref('')
const error = ref('')
const auth = useAuth()
const router = useRouter()
let countdownTimer: ReturnType<typeof setInterval> | null = null

const codeButtonLabel = computed(() => {
  if (codeLoading.value) return '发送中...'
  if (countdown.value > 0) return `${countdown.value}s`
  return '获取验证码'
})

function readErrorMessage(value: unknown) {
  return value instanceof Error ? value.message : '操作失败，请稍后重试'
}

function startCountdown() {
  countdown.value = 60
  if (countdownTimer) clearInterval(countdownTimer)
  countdownTimer = setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0 && countdownTimer) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
  }, 1000)
}

async function sendCode() {
  if (!/^1[3-9]\d{9}$/.test(form.phone)) {
    error.value = '请先填写有效手机号'
    return
  }

  codeLoading.value = true
  error.value = ''
  try {
    const result = await authAPI.sendRegisterCode(form.phone)
    devCode.value = result.dev_code || ''
    if (devCode.value) form.smsCode = devCode.value
    toast.success(devCode.value ? '验证码已生成' : '验证码已发送')
    startCountdown()
  } catch (err) {
    error.value = readErrorMessage(err)
  } finally {
    codeLoading.value = false
  }
}

async function submit() {
  if (form.password !== confirmPassword.value) {
    error.value = '两次输入的密码不一致'
    return
  }

  loading.value = true
  error.value = ''
  try {
    await auth.register({
      username: form.username,
      email: form.email,
      phone: form.phone,
      password: form.password,
      sms_code: form.smsCode,
    })
    toast.success('账户已创建')
    router.replace('/workspace')
  } catch (err) {
    error.value = readErrorMessage(err)
  } finally {
    loading.value = false
  }
}

onBeforeUnmount(() => {
  if (countdownTimer) clearInterval(countdownTimer)
})
</script>
