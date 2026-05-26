<template>
  <div class="drama-detail page">
    <div v-if="loading" class="route-state card">
      <div class="route-state-title">正在加载剧集</div>
      <div class="route-state-desc">正在读取项目详情...</div>
    </div>

    <div v-else-if="loadError" class="route-state card route-state-error">
      <div class="route-state-title">项目加载失败</div>
      <div class="route-state-desc">{{ loadError }}</div>
      <div class="route-state-actions">
        <button class="btn" @click="router.push('/')">返回项目</button>
        <button class="btn btn-primary" @click="load">重试</button>
      </div>
    </div>

    <template v-else-if="drama">
    <div class="drama-detail-main">
      <!-- Crumb -->
      <div class="dd-crumb">
        <a class="dd-crumb__link" @click.prevent="router.push('/')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg>
          项目
        </a>
        <svg class="dd-crumb__sep" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        <span class="dd-crumb__current">{{ drama.title }}</span>
      </div>

      <!-- Hero -->
      <section class="dd-hero">
        <div class="dd-hero__grid">
          <div class="dd-hero__copy">
            <div class="dd-hero__eyebrow-row">
              <span class="dd-eyebrow">Project</span>
              <span v-if="drama.style" class="dd-tag">{{ getProjectStyleLabel(drama.style) }}</span>
            </div>
            <h1 class="dd-hero__title">{{ drama.title }}</h1>
            <div class="dd-hero__meta">
              <span class="dd-meta__item"><b>{{ drama.characters?.length || 0 }}</b> 角色</span>
              <span class="dd-meta__dot"></span>
              <span class="dd-meta__item"><b>{{ drama.scenes?.length || 0 }}</b> 场景</span>
              <span class="dd-meta__dot"></span>
              <span class="dd-meta__item"><b>{{ drama.episodes?.length || 0 }}</b> 集</span>
              <span class="dd-meta__dot"></span>
              <span :class="['dd-sync', styleDirty ? 'is-dirty' : 'is-clean']" :title="styleDirty ? '风格未保存' : '风格已同步'">
                <span class="dd-sync__led"></span>
                {{ styleDirty ? '未保存' : '已同步' }}
              </span>
            </div>
          </div>

          <div class="dd-hero__right">
            <div class="dd-ring">
              <svg width="96" height="96" viewBox="0 0 96 96">
                <circle class="dd-ring__track" cx="48" cy="48" r="40" stroke-width="8" fill="none" />
                <circle
                  class="dd-ring__bar"
                  cx="48" cy="48" r="40" stroke-width="8" fill="none"
                  :stroke-dasharray="ringCircumference"
                  :stroke-dashoffset="ringDashOffset"
                />
              </svg>
              <div class="dd-ring__text">
                <b>{{ progressPercent }}<span class="dd-ring__percent">%</span></b>
              </div>
            </div>
            <div class="dd-ring__stats">
              <div><b>{{ doneCount }}</b> / {{ totalCount }} 集已完成</div>
              <div v-if="avgDuration">平均时长 <b>{{ avgDuration }}s</b></div>
              <div v-if="pendingCount">{{ pendingCount }} 集 待编写</div>
            </div>
            <button class="btn btn-primary dd-add-btn" @click="openAddChapter">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
              添加集
            </button>
          </div>
        </div>

        <!-- Style row -->
        <div class="dd-style-row">
          <span class="dd-style-row__label">风格</span>
          <div class="dd-style-row__input">
            <ProjectStyleInput
              v-model="styleDraft"
              :disabled="savingStyle"
              :custom-presets="customStylePresets"
              allow-custom
              compact
              @update:custom-presets="updateCustomStylePresets"
            />
          </div>
        </div>

        <!-- Progress bar -->
        <div class="dd-progress" v-if="totalCount">
          <div class="dd-progress__track"><span class="dd-progress__fill" :style="{ width: progressPercent + '%' }"></span></div>
          <div class="dd-progress__meta">
            <b>{{ doneCount }}</b> 已完成 · <b>{{ pendingCount }}</b> 待编写
          </div>
        </div>
      </section>

      <!-- Section head -->
      <div class="dd-section-head">
        <div>
          <div class="dd-section-title">剧集列表</div>
          <div class="dd-section-sub">点击任意集卡进入分镜工作台</div>
        </div>
        <div class="dd-filter-tabs" v-if="totalCount">
          <button
            v-for="tab in filterTabs"
            :key="tab.value"
            type="button"
            :class="['dd-filter-tab', { 'is-on': filter === tab.value }]"
            @click="filter = tab.value"
          >
            {{ tab.label }}
            <span class="dd-filter-tab__count">{{ tab.count }}</span>
          </button>
        </div>
      </div>

      <!-- Episode grid -->
      <div class="dd-ep-grid">
        <article
          v-for="(ep, i) in filteredEpisodes"
          :key="ep.id"
          :class="['dd-ep', hasScript(ep) ? 'is-done' : 'is-draft']"
          :style="{ animationDelay: `${i * 0.04}s` }"
          @click="router.push(`/drama/${drama.id}/chapter/${ep.episode_number || ep.episodeNumber}`)"
        >
          <div class="dd-ep__num">
            <span class="dd-ep__num-tag">EP</span>
            <span class="dd-ep__num-value">{{ String(ep.episode_number || ep.episodeNumber).padStart(2, '0') }}</span>
          </div>
          <div class="dd-ep__body">
            <h3 class="dd-ep__title">
              {{ ep.title }}
              <span v-if="!hasScript(ep)" class="dd-ep__draft">Draft</span>
            </h3>
            <div class="dd-ep__meta">
              <span class="dd-ep__led"></span>
              <span class="dd-ep__status">{{ hasScript(ep) ? '已完成剧本' : '待编写' }}</span>
              <template v-if="ep.duration">
                <span class="dd-ep__pipe">/</span>
                <span class="dd-ep__duration">{{ ep.duration }}s</span>
              </template>
              <span v-if="(ep.automation_status || ep.automationStatus) === 'running'" class="badge-running">自动化中</span>
              <span v-else-if="(ep.automation_status || ep.automationStatus) === 'failed'" class="badge-failed">自动化失败</span>
              <span v-else-if="(ep.automation_status || ep.automationStatus) === 'paused'" class="badge-paused">已暂停</span>
            </div>
          </div>
          <div class="dd-ep__go">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
          </div>
        </article>

        <!-- Add card (always last) -->
        <button v-if="filter === 'all'" class="dd-ep dd-ep-add" type="button" @click="openAddChapter">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
          添加新一集
        </button>

        <!-- Empty -->
        <div v-if="!drama.episodes?.length" class="dd-ep-empty">
          <div class="dd-ep-empty__icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          </div>
          <p>点击「添加集」创建第一集</p>
        </div>
      </div>
    </div>

    <div v-if="addDialog" class="dialog-mask" @click.self="addDialog = false">
      <div class="card dialog">
        <div class="dialog-head">
          <div class="dialog-head-copy">
            <div class="dialog-kicker">Chapter Setup</div>
            <div class="dialog-title-row">
              <div class="dialog-title">创建新集</div>
              <span class="dialog-badge">配置将锁定</span>
            </div>
            <div class="dialog-sub">为这一集预先锁定图片和视频生成服务。创建后，这些生成链路将始终跟随当前集配置。</div>
          </div>
          <button class="back-btn" @click="addDialog = false">取消</button>
        </div>
        <div class="dialog-summary">
          <div class="summary-chip">图片 · {{ imageConfigs.length }} 可选</div>
          <div class="summary-chip">视频 · {{ videoConfigs.length }} 可选</div>
        </div>
        <div class="dialog-body">
          <div class="dialog-section">
            <div class="dialog-section-head">
              <span class="dialog-section-title">基础信息</span>
              <span class="dialog-section-copy">这一项只影响显示名称，不影响生成配置</span>
            </div>
            <label class="field">
              <span class="field-label">标题</span>
              <input v-model="newChapterTitle" class="input" placeholder="默认按章节序号自动命名" />
              <span class="field-hint">留空时会自动按集数命名，例如“第 3 集”。</span>
            </label>
          </div>

          <div class="dialog-section">
            <div class="dialog-section-head">
              <span class="dialog-section-title">生成配置</span>
              <span class="dialog-section-copy">创建后不可更改，建议在这里一次性选对</span>
            </div>
            <div class="config-grid">
              <label class="config-card">
                <span class="config-card-kicker">IMAGE</span>
                <span class="field-label">图片配置</span>
                <BaseSelect v-model="newChapterImageConfigId" :options="imageConfigOptions" placeholder="选择图片服务" searchable />
              </label>
              <label class="config-card">
                <span class="config-card-kicker">VIDEO</span>
                <span class="field-label">视频配置</span>
                <BaseSelect v-model="newChapterVideoConfigId" :options="videoConfigOptions" placeholder="选择视频服务" searchable />
              </label>
            </div>
          </div>
        </div>
        <div class="dialog-foot">
          <div class="dialog-foot-copy">创建后，工作台中的图片与视频生成入口都会锁定到当前集。</div>
          <button class="btn btn-primary" :disabled="creatingChapter || !canCreateChapter" @click="addChapter">
            {{ creatingChapter ? '创建中...' : '创建并锁定配置' }}
          </button>
        </div>
      </div>
    </div>
    </template>
  </div>
</template>

<script setup>
import { toast } from 'vue-sonner'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BaseSelect from '@/components/BaseSelect.vue'
import ProjectStyleInput from '@/components/ProjectStyleInput.vue'
import { aiConfigAPI, chapterAPI, dramaAPI } from '@/composables/useApi'
import '@/assets/automation.css'
import { getProjectStyleLabel, normalizeProjectStyleInput } from '@/utils/project-style'

const route = useRoute()
const router = useRouter()
const drama = ref(null)
const dramaId = Number(route.params.id)
const loading = ref(true)
const loadError = ref('')
const addDialog = ref(false)
const creatingChapter = ref(false)
const savingStyle = ref(false)
const newChapterTitle = ref('')
const styleDraft = ref('')
const customStylePresets = ref([])
const imageConfigs = ref([])
const videoConfigs = ref([])
const newChapterImageConfigId = ref(null)
const newChapterVideoConfigId = ref(null)
const filter = ref('all')

function hasScript(ep) { return !!(ep.script_content || ep.scriptContent) }

const totalCount = computed(() => drama.value?.episodes?.length || 0)
const doneCount = computed(() => (drama.value?.episodes || []).filter(hasScript).length)
const pendingCount = computed(() => totalCount.value - doneCount.value)
const progressPercent = computed(() => (
  totalCount.value ? Math.round((doneCount.value / totalCount.value) * 100) : 0
))
const ringCircumference = 2 * Math.PI * 40
const ringDashOffset = computed(() => (
  ringCircumference - (ringCircumference * progressPercent.value) / 100
))
const avgDuration = computed(() => {
  const eps = drama.value?.episodes || []
  const withDuration = eps.filter(ep => Number(ep.duration) > 0)
  if (!withDuration.length) return 0
  const total = withDuration.reduce((sum, ep) => sum + Number(ep.duration || 0), 0)
  return Math.round(total / withDuration.length)
})

const filterTabs = computed(() => [
  { value: 'all', label: '全部', count: totalCount.value },
  { value: 'done', label: '已完成', count: doneCount.value },
  { value: 'pending', label: '待编写', count: pendingCount.value },
])

const filteredEpisodes = computed(() => {
  const eps = drama.value?.episodes || []
  if (filter.value === 'done') return eps.filter(hasScript)
  if (filter.value === 'pending') return eps.filter(ep => !hasScript(ep))
  return eps
})

function configLabel(config) {
  if (!config) return ''
  let modelName = ''
  if (Array.isArray(config.model)) modelName = config.model[0] || ''
  else try { const m = JSON.parse(config.model || '[]'); modelName = Array.isArray(m) ? (m[0] || '') : (m || '') } catch { modelName = config.model || '' }
  return modelName ? `${config.name} · ${modelName} (${config.provider})` : `${config.name} (${config.provider})`
}

const imageConfigOptions = computed(() => imageConfigs.value.map(c => ({ label: configLabel(c), value: c.id })))
const videoConfigOptions = computed(() => videoConfigs.value.map(c => ({ label: configLabel(c), value: c.id })))
const canCreateChapter = computed(() => !!(newChapterImageConfigId.value && newChapterVideoConfigId.value))
const dramaImageConfigId = computed(() => drama.value?.image_config_id || drama.value?.imageConfigId || null)
const dramaVideoConfigId = computed(() => drama.value?.video_config_id || drama.value?.videoConfigId || null)
const styleDirty = computed(() => (
  normalizeProjectStyleInput(styleDraft.value) !== normalizeProjectStyleInput(drama.value?.style || '')
))

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    drama.value = await dramaAPI.get(dramaId)
    styleDraft.value = drama.value?.style || ''
    customStylePresets.value = readStylePresetsFromMetadata(drama.value?.metadata)
    if (dramaImageConfigId.value) newChapterImageConfigId.value = dramaImageConfigId.value
    if (dramaVideoConfigId.value) newChapterVideoConfigId.value = dramaVideoConfigId.value
  } catch (e) {
    loadError.value = e?.message || '项目详情加载失败'
    toast.error(loadError.value)
  } finally {
    loading.value = false
  }
}

function parseDramaMetadata(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function readStylePresetsFromMetadata(raw) {
  const meta = parseDramaMetadata(raw)
  const list = Array.isArray(meta.stylePresets) ? meta.stylePresets : []
  return list.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim())
}

async function updateCustomStylePresets(next) {
  const dedup = []
  const seen = new Set()
  for (const item of (next || [])) {
    const value = typeof item === 'string' ? item.trim() : ''
    if (!value || seen.has(value)) continue
    seen.add(value)
    dedup.push(value)
  }
  const prev = customStylePresets.value
  customStylePresets.value = dedup
  try {
    const metadata = { ...parseDramaMetadata(drama.value?.metadata), stylePresets: dedup }
    await dramaAPI.update(dramaId, { metadata })
    drama.value = { ...drama.value, metadata }
  } catch (e) {
    customStylePresets.value = prev
    toast.error(e.message)
  }
}

async function loadConfigs() {
  try {
    const [imgs, vids] = await Promise.all([
      aiConfigAPI.list('image'),
      aiConfigAPI.list('video'),
    ])
    imageConfigs.value = imgs || []
    videoConfigs.value = vids || []
    if (!newChapterImageConfigId.value) newChapterImageConfigId.value = dramaImageConfigId.value || imageConfigs.value[0]?.id || null
    if (!newChapterVideoConfigId.value) newChapterVideoConfigId.value = dramaVideoConfigId.value || videoConfigs.value[0]?.id || null
  } catch (e) {
    toast.error(e.message)
  }
}

function openAddChapter() {
  newChapterTitle.value = ''
  if (!newChapterImageConfigId.value) newChapterImageConfigId.value = dramaImageConfigId.value || imageConfigs.value[0]?.id || null
  if (!newChapterVideoConfigId.value) newChapterVideoConfigId.value = dramaVideoConfigId.value || videoConfigs.value[0]?.id || null
  addDialog.value = true
}

async function addChapter() {
  try {
    creatingChapter.value = true
    await chapterAPI.create({
      drama_id: dramaId,
      title: newChapterTitle.value || undefined,
      image_config_id: newChapterImageConfigId.value,
      video_config_id: newChapterVideoConfigId.value,
    })
    toast.success('已添加新集')
    addDialog.value = false
    load()
  } catch (e) {
    toast.error(e.message)
  } finally {
    creatingChapter.value = false
  }
}

async function saveProjectStyle() {
  if (!drama.value || !styleDirty.value) return
  try {
    savingStyle.value = true
    const style = normalizeProjectStyleInput(styleDraft.value)
    await dramaAPI.update(dramaId, { style })
    drama.value = { ...drama.value, style }
    styleDraft.value = style
  } catch (e) {
    toast.error(e.message)
  } finally {
    savingStyle.value = false
  }
}

let styleSaveTimer = null
watch(styleDraft, () => {
  if (!drama.value) return
  if (!styleDirty.value) return
  if (styleSaveTimer) clearTimeout(styleSaveTimer)
  styleSaveTimer = setTimeout(() => {
    styleSaveTimer = null
    saveProjectStyle()
  }, 600)
})

onMounted(() => { load(); loadConfigs() })
</script>

<style>
@import url('@/assets/drama-detail.css');
</style>
