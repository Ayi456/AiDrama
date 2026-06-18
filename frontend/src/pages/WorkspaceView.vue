<template>
  <div class="page home-workbench">
    <section class="home-hero" aria-labelledby="home-title">
      <div class="home-intro">
        <div class="home-intro-content">
          <span class="home-kicker">{{ stats.total }} 个项目正在该账号下管理</span>
          <h1 id="home-title" class="home-title">短剧工作台</h1>
          <p class="home-lead">
            在这里查看和管理你的短剧项目，快速进入制作、继续未完成任务，并掌握正在生成的进度。
          </p>
          <div class="home-action-row">
            <button class="btn btn-primary" type="button" @click="showCreate = true">
              <Plus :size="15" :stroke-width="2.2" />
              新建项目
            </button>
            <button class="btn" type="button" :disabled="!latestProject" @click="continueLatestProject">
              <Play :size="15" :stroke-width="2" />
              继续最近项目
            </button>
            <button class="btn" type="button" @click="router.push('/character-assets')">
              <Users :size="15" :stroke-width="2" />
              进入形象库
            </button>
          </div>
        </div>
      </div>

      <aside class="rhythm-panel" aria-label="今日制片节奏">
        <div class="section-head">
          <div>
            <h2 class="section-title">今日制片节奏</h2>
            <p class="section-note">按当前账号的项目汇总</p>
          </div>
          <span class="live-pill" :class="{ muted: stats.automation === 0 }">
            {{ stats.automation > 0 ? '运行中' : '待启动' }}
          </span>
        </div>

        <div class="metric-grid">
          <div class="metric">
            <b>{{ stats.total }}</b>
            <span>项目总数</span>
          </div>
          <div class="metric">
            <b>{{ stats.running }}</b>
            <span>制作中</span>
          </div>
          <div class="metric">
            <b>{{ stats.characters }}</b>
            <span>角色资产</span>
          </div>
          <div class="metric">
            <b>{{ stats.automation }}</b>
            <span>自动化队列</span>
          </div>
        </div>

        <div v-if="activityItems.length" class="next-list">
          <button
            v-for="item in activityItems"
            :key="item.key"
            class="next-item"
            type="button"
            @click="goToProject(item.project)"
          >
            <span class="activity-dot" :class="item.tone"></span>
            <span class="next-main">
              <strong>{{ item.title }}</strong>
              <span>{{ item.detail }}</span>
            </span>
            <span class="next-time">{{ item.time }}</span>
          </button>
        </div>

        <div v-else class="next-empty">
          <CircleAlert :size="16" :stroke-width="1.9" />
          <span>暂无待处理事项</span>
        </div>
      </aside>
    </section>

    <section class="quick-actions" aria-label="快速动作">
      <button class="quick-action" type="button" @click="showCreate = true">
        <FolderPlus :size="18" :stroke-width="1.9" />
        <strong>从剧本创建</strong>
        <small>导入文本并拆分分集</small>
      </button>
      <button class="quick-action" type="button" @click="router.push('/character-assets')">
        <Boxes :size="18" :stroke-width="1.9" />
        <strong>管理角色资产</strong>
        <small>统一查看该账号素材</small>
      </button>
      <button class="quick-action" type="button" @click="router.push('/settings')">
        <Settings2 :size="18" :stroke-width="1.9" />
        <strong>检查模型配置</strong>
        <small>图片与视频生成偏好</small>
      </button>
      <button class="quick-action" type="button" :disabled="!latestProject" @click="continueLatestProject">
        <Clock3 :size="18" :stroke-width="1.9" />
        <strong>查看生成队列</strong>
        <small>追踪自动化任务状态</small>
      </button>
    </section>

    <section class="home-toolbar" aria-label="项目筛选">
      <label class="search-field">
        <Search :size="15" :stroke-width="2" />
        <input v-model.trim="searchQuery" type="search" placeholder="搜索项目、风格、角色" autocomplete="off" />
      </label>

      <div class="segmented" role="group" aria-label="状态筛选">
        <button
          v-for="option in statusOptions"
          :key="option.key"
          type="button"
          :class="{ active: statusFilter === option.key }"
          :aria-pressed="statusFilter === option.key"
          @click="statusFilter = option.key"
        >
          <span>{{ option.label }}</span>
          <small>{{ option.count }}</small>
        </button>
      </div>

      <select v-model="sortKey" class="sort-select" aria-label="项目排序">
        <option value="updated">最近更新</option>
        <option value="progress">制作进度</option>
        <option value="episodes">集数最多</option>
      </select>
    </section>

    <section v-if="loading" class="loading-state" aria-label="正在加载项目">
      <div class="loading-grid">
        <div v-for="i in 3" :key="i" class="skeleton-card card"></div>
      </div>
    </section>

    <section v-else class="project-grid" aria-label="项目列表">
      <article
        v-for="(d, i) in displayedProjects"
        :key="d.id"
        class="card project-card"
        :style="{ animationDelay: `${i * 0.05}s` }"
        role="button"
        tabindex="0"
        @click="goToProject(d)"
        @keydown.enter.prevent="goToProject(d)"
      >
        <div class="project-poster" aria-hidden="true">
          <Clapperboard :size="22" :stroke-width="1.7" />
        </div>

        <div class="project-body">
          <div class="card-top">
            <span class="status-badge" :class="getProjectStatus(d).tone">{{ getProjectStatus(d).label }}</span>
            <span class="updated">{{ fmtDate(d.updated_at || d.updatedAt) }}</span>
          </div>

          <h2 class="project-title">{{ d.title || '未命名项目' }}</h2>
          <p class="project-desc">{{ getProjectDescription(d) }}</p>

          <div class="meta-row">
            <span><Clapperboard :size="13" :stroke-width="1.8" />{{ getCount(d, 'episodes') }} 集</span>
            <span><Users :size="13" :stroke-width="1.8" />{{ getCount(d, 'characters') }} 角色</span>
            <span><ImageIcon :size="13" :stroke-width="1.8" />{{ getCount(d, 'scenes') }} 场景</span>
          </div>

          <div class="progress-block">
            <div class="progress-head">
              <span>制作进度</span>
              <span>{{ getProgress(d) }}%</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" :style="{ width: `${getProgress(d)}%` }"></div>
            </div>
          </div>
        </div>

        <div class="project-footer">
          <span class="next-action">{{ getNextAction(d) }}</span>
          <div class="project-card-actions">
            <button class="continue-btn" type="button" @click.stop="goToProject(d)">
              <Play :size="13" :stroke-width="2" />
              继续
            </button>
            <button class="btn btn-ghost btn-icon card-delete" type="button" @click.stop="delDrama(d)" title="删除项目">
              <Trash2 :size="14" :stroke-width="1.9" />
            </button>
          </div>
        </div>
      </article>

      <button v-if="!dramas.length" class="card empty-card" type="button" @click="showCreate = true">
        <span class="empty-icon"><Plus :size="24" :stroke-width="1.8" /></span>
        <span class="empty-title">新建第一个短剧项目</span>
        <span class="empty-desc">从剧本到成片，AI 助力的短剧制作工作台</span>
      </button>
    </section>

    <section v-if="!loading && dramas.length && !displayedProjects.length" class="card filtered-empty" aria-live="polite">
      <div>
        <h2>没有匹配的项目</h2>
        <p>换一个关键词或状态筛选，也可以直接创建一个新项目。</p>
      </div>
      <button class="btn btn-primary" type="button" @click="showCreate = true">
        <Plus :size="15" :stroke-width="2.2" />
        新建项目
      </button>
    </section>

    <div v-if="showCreate" class="overlay" @click.self="showCreate = false">
      <div class="modal card">
        <div class="modal-header">
          <div class="modal-icon">
            <Plus :size="18" :stroke-width="2" />
          </div>
          <h2 class="modal-title">新建短剧项目</h2>
          <p class="modal-desc">输入项目基本信息，即可开始制作。</p>
        </div>
        <form class="modal-form" @submit.prevent="create">
          <label class="field">
            <span class="field-label">项目名称 <span class="required">*</span></span>
            <input v-model="form.title" class="input" placeholder="例如：都市情感短剧《时光邮局》" required autofocus />
          </label>
          <label class="field">
            <span class="field-label">项目风格</span>
            <ProjectStyleInput v-model="form.style" />
            <span class="field-hint">这会影响整个项目的图片和视频生成风格。</span>
          </label>
          <label class="field">
            <span class="field-label">计划集数</span>
            <input v-model.number="form.total_episodes" class="input" type="number" min="1" max="100" />
          </label>
          <div class="field-row">
            <label class="field">
              <span class="field-label">图片模型</span>
              <BaseSelect v-model="form.image_config_id" :options="imageConfigOptions" placeholder="选择图片模型" searchable />
            </label>
            <label class="field">
              <span class="field-label">视频模型</span>
              <BaseSelect v-model="form.video_config_id" :options="videoConfigOptions" placeholder="选择视频模型" searchable />
            </label>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn" @click="showCreate = false">取消</button>
            <button type="submit" class="btn btn-primary">
              <Plus :size="14" :stroke-width="2.2" />
              创建项目
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { toast } from 'vue-sonner'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  Boxes,
  CircleAlert,
  Clapperboard,
  Clock3,
  FolderPlus,
  ImageIcon,
  Play,
  Plus,
  Search,
  Settings2,
  Trash2,
  Users,
} from 'lucide-vue-next'
import { aiConfigAPI, dramaAPI, type AiConfig, type Drama } from '@/composables/useApi'
import '@/assets/automation.css'
import { useConfirm } from '@/composables/useConfirm'
import BaseSelect from '@/components/BaseSelect.vue'
import ProjectStyleInput from '@/components/ProjectStyleInput.vue'
import { DEFAULT_PROJECT_STYLE, getProjectStyleLabel, normalizeProjectStyleInput } from '@/utils/project-style'
import {
  filterHomeProjects,
  getHomeProjectProgress,
  getHomeProjectStats,
  getHomeProjectStatus,
  sortHomeProjects,
  type HomeProjectSortKey,
  type HomeProjectStatusKey,
} from './home-workbench-policy'

const router = useRouter()
const { confirm } = useConfirm()
const dramas = ref<Drama[]>([])
const loading = ref(false)
const showCreate = ref(false)
const imageConfigs = ref<AiConfig[]>([])
const videoConfigs = ref<AiConfig[]>([])
const searchQuery = ref('')
const statusFilter = ref<HomeProjectStatusKey>('all')
const sortKey = ref<HomeProjectSortKey>('updated')
const form = ref({
  title: '',
  style: DEFAULT_PROJECT_STYLE,
  total_episodes: 1,
  image_config_id: null as number | null,
  video_config_id: null as number | null,
})

const imageConfigOptions = computed(() => imageConfigs.value.map((config) => ({ label: configLabel(config), value: config.id })))
const videoConfigOptions = computed(() => videoConfigs.value.map((config) => ({ label: configLabel(config), value: config.id })))
const stats = computed(() => getHomeProjectStats(dramas.value))
const latestProject = computed(() => sortHomeProjects(dramas.value, 'updated')[0] as Drama | undefined)
const displayedProjects = computed(() => {
  const filtered = filterHomeProjects(dramas.value, statusFilter.value, searchQuery.value)
  return sortHomeProjects(filtered, sortKey.value) as Drama[]
})
const statusOptions = computed(() => [
  { key: 'all' as const, label: '全部', count: stats.value.total },
  { key: 'running' as const, label: '制作中', count: stats.value.running },
  { key: 'draft' as const, label: '草稿', count: stats.value.draft },
  { key: 'done' as const, label: '已完成', count: stats.value.done },
])
const activityItems = computed(() => {
  const source = sortHomeProjects(dramas.value, 'updated') as Drama[]
  return source.slice(0, 3).map((project) => {
    const status = getHomeProjectStatus(project)
    return {
      key: `${project.id || project.title}-${status.key}`,
      project,
      tone: status.tone,
      title: project.title || '未命名项目',
      detail: getNextAction(project).replace('下一步：', ''),
      time: fmtDate(project.updated_at || project.updatedAt),
    }
  })
})

function configLabel(config: AiConfig) {
  if (!config) return ''
  let modelName = ''
  if (Array.isArray(config.model)) {
    modelName = String(config.model[0] || '')
  } else {
    try {
      const model = JSON.parse(String(config.model || '[]'))
      modelName = Array.isArray(model) ? String(model[0] || '') : String(model || '')
    } catch {
      modelName = String(config.model || '')
    }
  }
  return modelName ? `${config.name} · ${modelName} (${config.provider})` : `${config.name} (${config.provider})`
}

async function load() {
  loading.value = true
  try {
    const res = await dramaAPI.list()
    dramas.value = res.items || []
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    loading.value = false
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
    if (!form.value.image_config_id && imageConfigs.value.length) form.value.image_config_id = Number(imageConfigs.value[0].id)
    if (!form.value.video_config_id && videoConfigs.value.length) form.value.video_config_id = Number(videoConfigs.value[0].id)
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

async function create() {
  if (!form.value.title?.trim()) return
  try {
    const drama = await dramaAPI.create({
      ...form.value,
      style: normalizeProjectStyleInput(form.value.style),
    })
    showCreate.value = false
    goToProject(drama)
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

async function delDrama(drama: Drama) {
  const ok = await confirm({
    title: '删除项目',
    message: `确定删除「${drama.title || '未命名项目'}」？此操作不可恢复。`,
    confirmText: '删除',
    variant: 'danger',
  })
  if (!ok || !drama.id) return
  try {
    await dramaAPI.del(Number(drama.id))
    toast.success('已删除')
    load()
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

function continueLatestProject() {
  if (latestProject.value) goToProject(latestProject.value)
}

function goToProject(drama: Drama) {
  if (!drama?.id) return
  router.push(`/drama/${drama.id}`)
}

function getProjectStatus(drama: Drama) {
  return getHomeProjectStatus(drama)
}

function getProjectDescription(drama: Drama) {
  const style = drama.style ? getProjectStyleLabel(String(drama.style)) : '短剧'
  const episodes = getCount(drama, 'episodes')
  if (episodes > 0) return `${style}方向，已规划 ${episodes} 集内容。`
  return `${style}方向，等待补齐分集脚本和角色设定。`
}

function getNextAction(drama: Drama) {
  const progress = getProgress(drama)
  const automation = Number(drama.automation_running_count || (drama as any).automationRunningCount || 0)
  if (automation > 0) return '下一步：查看自动化队列'
  if (progress >= 100) return '下一步：查看成片资产'
  if (getCount(drama, 'episodes') === 0) return '下一步：创建第一集脚本'
  if (getCount(drama, 'characters') === 0) return '下一步：绑定主角形象'
  if (progress === 0) return '下一步：完善分集脚本'
  return '下一步：继续制作镜头'
}

function fmtDate(value: unknown) {
  if (!value) return '未更新'
  const date = new Date(String(value))
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (!Number.isFinite(diff)) return '未更新'
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function getProgress(drama: Drama) {
  return getHomeProjectProgress(drama)
}

function getCount(drama: Drama, key: 'episodes' | 'characters' | 'scenes') {
  const value = (drama as Record<string, unknown>)[key]
  return Array.isArray(value) ? value.length : 0
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

onMounted(() => {
  load()
  loadConfigs()
})
</script>

<style>
@import url('@/assets/workspace.css');
</style>
