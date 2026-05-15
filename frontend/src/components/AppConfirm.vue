<template>
  <Teleport to="body">
    <div v-if="confirmState.open" class="app-confirm-host" aria-live="assertive">
      <div class="app-confirm-backdrop" @click="cancelConfirm"></div>
      <section
        :class="['app-confirm-panel', `is-${confirmState.variant}`]"
        role="alertdialog"
        aria-labelledby="app-confirm-title"
        aria-describedby="app-confirm-message"
      >
        <div class="app-confirm-icon">
          <AlertTriangle :size="18" />
        </div>
        <div class="app-confirm-content">
          <h2 id="app-confirm-title">{{ confirmState.title }}</h2>
          <p id="app-confirm-message">{{ confirmState.message }}</p>
          <div class="app-confirm-actions">
            <button class="btn btn-ghost app-confirm-cancel" type="button" @click="cancelConfirm">
              {{ confirmState.cancelText }}
            </button>
            <button :class="['btn app-confirm-ok', confirmState.variant === 'danger' && 'is-danger']" type="button" @click="acceptConfirm">
              {{ confirmState.confirmText }}
            </button>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { AlertTriangle } from 'lucide-vue-next'
import { useConfirmController } from '@/composables/useConfirm'

const { confirmState, acceptConfirm, cancelConfirm } = useConfirmController()
</script>

<style scoped>
.app-confirm-host {
  position: fixed;
  inset: 0;
  z-index: 240;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  pointer-events: auto;
}

.app-confirm-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(24, 33, 50, 0.34);
  backdrop-filter: blur(6px);
  animation: confirmFadeIn 0.16s var(--ease-out);
}

.app-confirm-panel {
  position: relative;
  z-index: 1;
  width: min(390px, 100%);
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 12px;
  padding: 16px;
  border: 1px solid rgba(188, 201, 217, 0.78);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 18px 40px rgba(35, 48, 74, 0.18), 0 6px 16px rgba(35, 48, 74, 0.1);
  backdrop-filter: blur(14px);
  animation: confirmIn 0.2s var(--ease-out);
}

.app-confirm-panel.is-danger {
  border-color: rgba(210, 79, 102, 0.24);
}

.app-confirm-icon {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--warning-bg);
  color: var(--warning);
}

.app-confirm-panel.is-danger .app-confirm-icon {
  background: var(--error-bg);
  color: var(--error);
}

.app-confirm-content {
  min-width: 0;
}

.app-confirm-content h2 {
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0;
}

.app-confirm-content p {
  margin-top: 4px;
  color: var(--text-2);
  font-size: 12px;
  line-height: 1.6;
  word-break: break-word;
}

.app-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.app-confirm-cancel,
.app-confirm-ok {
  min-width: 70px;
  min-height: 32px;
}

.app-confirm-ok {
  border-color: transparent;
  background: var(--accent);
  color: #fff;
}

.app-confirm-ok:hover {
  background: var(--accent-dark);
  color: #fff;
}

.app-confirm-ok.is-danger {
  background: var(--error);
  color: #fff;
}

.app-confirm-ok.is-danger:hover {
  filter: brightness(0.94);
  color: #fff;
}

@keyframes confirmIn {
  from {
    opacity: 0;
    transform: translate3d(0, 8px, 0) scale(0.98);
  }

  to {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
}

@keyframes confirmFadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}
</style>
