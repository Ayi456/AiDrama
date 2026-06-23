<template>
  <div v-if="scriptStep === 0" class="step-editor">
    <div class="step-toolbar">
      <div class="toolbar-left">
        <div class="step-indicator">
          <span class="step-num">01</span>
          <span class="step-name">原始内容</span>
        </div>
      </div>
      <div class="toolbar-right">
        <span v-if="rawLen" class="char-count">{{ rawLen }} 字</span>
        <button class="btn btn-sm" @click="handleSaveRaw">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          保存
        </button>
      </div>
    </div>
    <textarea
      class="fill-textarea"
      :value="localRaw"
      placeholder="粘贴小说原文、故事大纲或分镜描述..."
      @input="emit('update:localRaw', $event.target.value)"
    />
  </div>

  <div v-else-if="scriptStep === 1" class="step-editor">
    <div class="step-toolbar">
      <div class="toolbar-left">
        <div class="step-indicator">
          <span class="step-num">02</span>
          <span class="step-name">AI 改写</span>
        </div>
      </div>
      <div class="toolbar-right">
        <span v-if="scriptLen" class="char-count">{{ scriptLen }} 字</span>
        <button v-if="rawContent" class="btn btn-sm" @click="emit('skip-rewrite')">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/><path d="M13 18l6-6-6-6"/></svg>
          跳过改写
        </button>
        <button v-if="scriptContent" class="btn btn-sm" @click="emit('rewrite')" :disabled="rn">
          <Loader2 v-if="rn && rt === 'script_rewriter'" :size="11" class="animate-spin" />
          <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
          重新改写
        </button>
        <button v-if="canStartAutomation" class="btn btn-sm btn-primary" @click="emit('start-automation')" :disabled="automationStarting">
          <Loader2 v-if="automationStarting" :size="11" class="animate-spin" />
          <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          一键开始
        </button>
      </div>
    </div>

    <div v-if="!scriptContent && !rn" class="step-empty">
      <div class="empty-visual">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
        </svg>
      </div>
      <div class="empty-title">AI 改写为格式化剧本</div>
      <div class="empty-desc">你可以先用 AI 把原始内容整理成格式化剧本，也可以跳过这一步，直接使用原始内容继续提取角色与场景。</div>
      <div class="step-empty-actions">
        <button class="btn btn-primary" @click="emit('rewrite')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          开始改写
        </button>
        <button class="btn" @click="emit('skip-rewrite')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14"/><path d="M13 18l6-6-6-6"/></svg>
          跳过改写
        </button>
      </div>
    </div>
    <div v-else-if="rn && rt === 'script_rewriter'" class="step-loading">
      <Loader2 :size="24" class="animate-spin" style="color:var(--accent)" />
      <div class="loading-text">正在改写剧本...</div>
    </div>
    <textarea
      v-else
      class="fill-textarea"
      :value="localScript"
      placeholder="格式化剧本内容..."
      @input="emit('update:localScript', $event.target.value)"
    />
  </div>

  <div v-else-if="scriptStep === 2" class="step-editor">
    <div class="step-toolbar">
      <div class="toolbar-left">
        <div class="step-indicator">
          <span class="step-num">03</span>
          <span class="step-name">提取角色与场景</span>
        </div>
      </div>
      <div class="toolbar-right">
        <span v-if="chars.length" class="char-count">{{ chars.length }} 角色 · {{ scenes.length }} 场景</span>
        <button v-if="chars.length" class="btn btn-sm" @click="emit('extract')" :disabled="rn">
          <Loader2 v-if="rn && rt === 'extractor'" :size="11" class="animate-spin" />
          <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          重新提取
        </button>
        <button v-if="canStartAutomation" class="btn btn-sm btn-primary" @click="emit('start-automation')" :disabled="automationStarting">
          <Loader2 v-if="automationStarting" :size="11" class="animate-spin" />
          <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          一键开始
        </button>
      </div>
    </div>

    <div v-if="!chars.length && !rn" class="step-empty">
      <div class="empty-visual">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </div>
      <div class="empty-title">从剧本提取角色与场景</div>
      <div class="empty-desc">AI 自动分析当前剧本，生成本集角色信息和场景列表；再次提取会用新结果替换当前集旧结果。</div>
      <button class="btn btn-primary" @click="emit('extract')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        开始提取
      </button>
    </div>
    <div v-else-if="rn && rt === 'extractor'" class="step-loading">
      <Loader2 :size="24" class="animate-spin" style="color:var(--accent)" />
      <div class="loading-text">正在提取角色和场景...</div>
    </div>
    <div v-else class="extract-stage">
      <aside class="card extract-summary">
        <div class="extract-summary-kicker">Extraction Board</div>
        <div class="extract-summary-title">角色与场景结果</div>
        <div class="extract-summary-desc">从当前剧本提取出的角色和场景已经入库。重新提取会刷新当前集关联和描述字段，确认无误后进入后续制作。</div>
        <div class="extract-summary-stats">
          <div class="extract-summary-stat">
            <span>角色</span>
            <strong>{{ chars.length }}</strong>
          </div>
          <div class="extract-summary-stat">
            <span>场景</span>
            <strong>{{ scenes.length }}</strong>
          </div>
        </div>
        <div class="extract-summary-note">提取阶段不再做人工修改；角色描述词和场景图片提示词放到后续制作阶段调整。</div>
      </aside>

      <div class="card extract-card">
        <div class="extract-card-head">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span>角色</span>
          <span class="tag tag-accent">{{ chars.length }}</span>
        </div>
        <div class="extract-list">
          <div v-for="character in chars" :key="character.id" class="extract-row">
            <div class="char-avatar">{{ character.name?.[0] || '?' }}</div>
            <div class="extract-info">
              <div class="extract-name-row">
                <span class="extract-name">{{ character.name || '未命名角色' }}</span>
                <span class="extract-role-chip">{{ character.role || '角色' }}</span>
              </div>
              <div class="extract-meta wrap">{{ mergeCharDesc(character) || '暂无角色描述' }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="card extract-card" v-if="scenes.length">
        <div class="extract-card-head">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <span>场景</span>
          <span class="tag tag-accent">{{ scenes.length }}</span>
        </div>
        <div class="extract-list">
          <div v-for="scene in scenes" :key="scene.id" class="extract-row">
            <div class="scene-icon">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            </div>
            <div class="extract-info">
              <div class="extract-name-row">
                <span class="extract-name">{{ scene.location || '未命名场景' }}</span>
                <span class="extract-role-chip">{{ scene.time || '未设时间' }}</span>
              </div>
              <div class="extract-meta wrap">{{ scene.prompt || scene.description || '暂无场景描述' }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { toast } from 'vue-sonner'
import { Loader2 } from 'lucide-vue-next'

defineProps({
  scriptStep: {
    type: Number,
    default: 0,
  },
  rawLen: {
    type: Number,
    default: 0,
  },
  scriptLen: {
    type: Number,
    default: 0,
  },
  localRaw: {
    type: String,
    default: '',
  },
  localScript: {
    type: String,
    default: '',
  },
  rawContent: {
    type: String,
    default: '',
  },
  scriptContent: {
    type: String,
    default: '',
  },
  rn: {
    type: Boolean,
    default: false,
  },
  rt: {
    type: String,
    default: '',
  },
  chars: {
    type: Array,
    default: () => [],
  },
  scenes: {
    type: Array,
    default: () => [],
  },
  mergeCharDesc: {
    type: Function,
    default: () => '',
  },
  canStartAutomation: {
    type: Boolean,
    default: false,
  },
  automationStarting: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:localRaw', 'update:localScript', 'save-raw', 'skip-rewrite', 'rewrite', 'extract', 'start-automation'])

function handleSaveRaw() {
  emit('save-raw')
  toast.success('已保存')
}
</script>
