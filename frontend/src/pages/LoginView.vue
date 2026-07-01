<template>
  <main class="auth-shell">
    <section class="auth-stage">
      <div class="auth-visual" aria-hidden="true">
        <div class="auth-frame">
          <div class="auth-frame-top">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <div class="auth-frame-body">
            <Film :size="42" :stroke-width="1.6" />
            <p>AI Drama Studio</p>
          </div>
        </div>
        <div class="auth-copy">
          <p class="auth-kicker">AiDrama</p>
          <h1>回到你的短剧工作台</h1>
          <p>继续管理项目、角色资产和分镜生成流程。</p>
        </div>
      </div>

      <form class="auth-panel" @submit.prevent="submit">
        <div class="auth-panel-head">
          <p class="auth-kicker">登录</p>
          <h2>欢迎回来</h2>
          <p>使用邮箱或手机号进入工作台。</p>
        </div>

        <label class="auth-field">
          <span>邮箱或手机号</span>
          <span class="auth-input-wrap">
            <Mail :size="17" :stroke-width="1.8" class="auth-icon" />
            <input v-model.trim="identifier" class="auth-input" autocomplete="username" placeholder="name@example.com" />
          </span>
        </label>

        <label class="auth-field">
          <span>密码</span>
          <span class="auth-input-wrap">
            <Lock :size="17" :stroke-width="1.8" class="auth-icon" />
            <input v-model="password" class="auth-input" type="password" autocomplete="current-password" placeholder="请输入密码" />
          </span>
        </label>

        <p v-if="error" class="auth-error">{{ error }}</p>

        <button class="auth-button" type="submit" :disabled="loading">
          <LogIn :size="17" :stroke-width="1.8" />
          <span>{{ loading ? '登录中...' : '登录' }}</span>
        </button>

        <p class="auth-switch">
          还没有账户？
          <RouterLink to="/register">创建账户</RouterLink>
        </p>
      </form>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { Film, Lock, LogIn, Mail } from 'lucide-vue-next'
import { useAuth } from '../composables/useAuth'
import '@/assets/auth.css'

const identifier = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')
const auth = useAuth()
const router = useRouter()
const route = useRoute()

function readErrorMessage(value: unknown) {
  return value instanceof Error ? value.message : '登录失败，请稍后重试'
}

async function submit() {
  if (!identifier.value || !password.value) {
    error.value = '请填写邮箱或手机号和密码'
    return
  }

  loading.value = true
  error.value = ''
  try {
    await auth.login({ identifier: identifier.value, password: password.value })
    toast.success('登录成功')
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/')
      ? route.query.redirect
      : '/workspace'
    router.replace(redirect)
  } catch (err) {
    error.value = readErrorMessage(err)
  } finally {
    loading.value = false
  }
}
</script>
