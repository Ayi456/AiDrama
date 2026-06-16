<template>
  <main ref="landingRef" class="public-landing">
    <header class="public-nav" aria-label="主导航">
      <RouterLink class="public-brand" to="/" aria-label="AiDrama 首页">
        <span class="public-brand-mark" aria-hidden="true">
          <Play :size="14" :stroke-width="2.4" />
        </span>
        <span>AiDrama</span>
      </RouterLink>

      <nav class="public-nav-links" aria-label="页面导航">
        <a href="#workflow">制作流程</a>
        <a href="#capability">核心能力</a>
        <a href="#gallery">成果示例</a>
      </nav>

      <div class="public-nav-actions">
        <RouterLink class="public-btn" :to="secondaryRoute">{{ secondaryLabel }}</RouterLink>
        <RouterLink class="public-btn public-btn-primary" :to="primaryRoute">
          <span>{{ primaryLabel }}</span>
          <ArrowRight :size="16" :stroke-width="2" />
        </RouterLink>
      </div>
    </header>

    <section class="public-hero" aria-labelledby="public-home-title">
      <div class="public-hero-copy">
        <span class="public-kicker">AI 驱动 · 让创意触手可及</span>
        <h1 id="public-home-title">
          AiDrama
          <span>AI 短剧制作平台</span>
        </h1>
        <p>
          从一句故事梗概开始，拆解分集、设定角色、生成分镜与视频镜头，
          让短剧项目从灵感快速进入可执行制作。
        </p>

        <div class="public-hero-actions">
          <RouterLink class="public-btn public-btn-primary" :to="primaryRoute">
            <span>{{ primaryLabel }}</span>
            <ArrowRight :size="16" :stroke-width="2" />
          </RouterLink>
          <a class="public-btn" href="#workflow">
            <Play :size="16" :stroke-width="2" />
            <span>查看流程</span>
          </a>
        </div>

        <div class="public-proof-grid" aria-label="产品能力摘要">
          <div class="public-proof-item">
            <strong>剧本</strong>
            <span>分集拆解与制作线索</span>
          </div>
          <div class="public-proof-item">
            <strong>角色</strong>
            <span>统一资产与形象复用</span>
          </div>
          <div class="public-proof-item">
            <strong>视频</strong>
            <span>镜头任务与合成追踪</span>
          </div>
        </div>
      </div>

      <div ref="heroVisualRef" class="public-hero-visual">
        <canvas ref="particleCanvasRef" class="public-particle-canvas" aria-hidden="true"></canvas>
        <div class="public-liquid-sheet" aria-hidden="true"></div>
        <div class="public-hero-image">
          <img
            src="/landing/public-landing-hero.png"
            alt="AI 短剧制作台，包含分镜稿、角色设定、脚本和视频画面"
          />
        </div>
        <aside class="public-visual-card">
          <strong>剧本、角色、画面和视频任务，在同一个项目里连续推进。</strong>
          <span>适合短剧团队沉淀角色资产、统一视觉风格，并追踪每一集的制作进度。</span>
        </aside>
      </div>

      <span class="public-scroll-cue" aria-hidden="true">SCROLL</span>
    </section>

    <section id="workflow" class="public-section public-section-block">
      <div class="public-section-copy">
        <h2>把短剧制作拆成一条清晰流水线</h2>
        <p>从故事拆解、角色资产、场景分镜到视频任务，AiDrama 把短剧生产拆成可追踪的流程，让每一步都能延续上一轮创作。</p>
      </div>

      <div class="public-flow">
        <article v-for="step in flowSteps" :key="step.title" class="public-flow-item public-reveal">
          <span class="public-flow-icon">
            <component :is="step.icon" :size="20" :stroke-width="1.8" />
          </span>
          <div>
            <h3>{{ step.title }}</h3>
            <p>{{ step.description }}</p>
          </div>
        </article>
      </div>

      <figure class="public-media-panel public-reveal">
        <img
          src="/landing/public-landing-workflow.png"
          alt="AI 短剧制作流程界面，包含分镜、镜头队列和制作素材"
        />
        <figcaption>
          <strong>从剧本到镜头的制作链路</strong>
          <span>分集结构、画面参考、镜头队列和素材状态集中呈现，制作团队可以更快判断下一步该推进什么。</span>
        </figcaption>
      </figure>
    </section>

    <section id="capability" class="public-section public-section-block">
      <div class="public-section-copy">
        <h2>让角色、场景和镜头保持连续</h2>
        <p>短剧不是一次性生成几张图。AiDrama 帮你沉淀项目上下文，让角色形象、视觉风格和分集任务在同一条制作链路里持续复用。</p>
      </div>

      <div class="public-bento">
        <article class="public-bento-cell public-bento-cell-large public-reveal">
          <h3>一个项目空间承载剧本、角色、场景和镜头任务</h3>
          <p>每部短剧都有独立上下文。角色设定、视觉参考、生成任务和分集内容集中管理，制作过程更稳。</p>
          <figure class="public-bento-media">
            <img
              src="/landing/public-landing-characters.png"
              alt="AI 短剧角色资产管理画面，展示角色设定和造型参考"
            />
          </figure>
          <div class="public-bento-lines" aria-hidden="true"></div>
          <div class="public-bento-film" aria-hidden="true"></div>
        </article>

        <article v-for="item in capabilityItems" :key="item.title" class="public-bento-cell public-reveal">
          <span class="public-bento-icon">
            <component :is="item.icon" :size="19" :stroke-width="1.85" />
          </span>
          <h3>{{ item.title }}</h3>
          <p>{{ item.description }}</p>
        </article>
      </div>
    </section>

    <section id="gallery" class="public-section public-section-block public-gallery-section public-reveal">
      <div class="public-gallery-copy">
        <h2>用画面预览短剧的最终质感</h2>
        <p>概念画面、角色氛围和成片风格放在同一条叙事线上，帮助创作者快速判断作品的视觉方向。</p>
        <ul class="public-check-list">
          <li>电影感构图与光影，突出短剧题材和情绪。</li>
          <li>示例图保持清晰呈现，方便查看角色、场景和镜头细节。</li>
          <li>从概念图到成片风格，呈现可持续迭代的制作结果。</li>
        </ul>
      </div>

      <div class="public-gallery-stack">
        <figure class="public-gallery-frame">
          <img
            src="/landing/public-landing-gallery.png"
            alt="AI 短剧概念画面示例，包含不同题材的电影画面"
          />
          <figcaption>
            <strong>概念画面矩阵</strong>
            <span>把不同题材的光影、构图和美术方向并排呈现，方便快速确认短剧调性。</span>
          </figcaption>
        </figure>
        <figure class="public-gallery-frame">
          <img
            src="/landing/public-landing-stills.png"
            alt="AI 短剧成片风格示例，展示多组电影感画面"
          />
          <figcaption>
            <strong>成片风格示例</strong>
            <span>用接近成片预览的画面展示镜头气质，为后续视频生成建立明确参考。</span>
          </figcaption>
        </figure>
      </div>
    </section>

  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  ArrowRight,
  Boxes,
  Clapperboard,
  FileText,
  Image as ImageIcon,
  ListChecks,
  Play,
  Settings2,
  ShieldCheck,
  UserRound,
  Video,
} from 'lucide-vue-next'
import { useAuth } from '@/composables/useAuth'
import '@/assets/home.css'

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  pulse: number
  color: string
  line: boolean
}

const auth = useAuth()
const landingRef = ref<HTMLElement | null>(null)
const heroVisualRef = ref<HTMLElement | null>(null)
const particleCanvasRef = ref<HTMLCanvasElement | null>(null)
const primaryRoute = computed(() => (auth.isAuthenticated.value ? '/workspace' : '/register'))
const primaryLabel = computed(() => (auth.isAuthenticated.value ? '进入工作台' : '开始创作'))
const secondaryRoute = computed(() => (auth.isAuthenticated.value ? '/workspace' : '/login'))
const secondaryLabel = computed(() => (auth.isAuthenticated.value ? '工作台' : '登录'))

const flowSteps = [
  {
    title: '输入剧本',
    description: '整理故事结构，给每一集留下可追踪的制作上下文。',
    icon: FileText,
  },
  {
    title: '建立角色',
    description: '把人物设定和形象资产放在同一个项目里复用。',
    icon: UserRound,
  },
  {
    title: '生成场景',
    description: '为分集建立画面方向，减少每次生成时的重复描述。',
    icon: ImageIcon,
  },
  {
    title: '制作分镜',
    description: '围绕镜头推进图片、视频和后续合成任务。',
    icon: Clapperboard,
  },
  {
    title: '合成成片',
    description: '用队列方式追踪视频生成进度，降低试错成本。',
    icon: Video,
  },
]

const capabilityItems = [
  {
    title: '角色资产复用',
    description: '同一账号下沉淀角色形象，让后续分集保持一致。',
    icon: Boxes,
  },
  {
    title: '模型配置',
    description: '图片、视频生成配置集中管理，减少来回切换。',
    icon: Settings2,
  },
  {
    title: '自动化队列',
    description: '生成任务不再靠手工记忆，状态和下一步动作更清楚。',
    icon: ListChecks,
  },
  {
    title: '账号隔离',
    description: '不同账号只看到自己的项目和资产，适合团队分账号使用。',
    icon: ShieldCheck,
  },
]

let resizeObserver: ResizeObserver | null = null
let revealObserver: IntersectionObserver | null = null
let animationFrame = 0

function setupReveal() {
  const root = landingRef.value
  if (!root) return
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reducedMotion) return

  root.classList.add('public-motion-ready')
  heroVisualRef.value?.classList.add('is-visible')

  const targets = Array.from(root.querySelectorAll<HTMLElement>('.public-reveal'))
  targets.forEach((element, index) => {
    element.style.setProperty('--reveal-delay', `${Math.min(index * 55, 260)}ms`)
  })

  if (!('IntersectionObserver' in window)) {
    targets.forEach((element) => element.classList.add('is-visible'))
    return
  }

  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return
      entry.target.classList.add('is-visible')
      revealObserver?.unobserve(entry.target)
    })
  }, { threshold: 0.22, rootMargin: '0px 0px -6% 0px' })

  targets.forEach((element) => revealObserver?.observe(element))
}

function setupParticles() {
  const canvas = particleCanvasRef.value
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!canvas || reducedMotion) return

  const context = canvas.getContext('2d', { alpha: true })
  if (!context) return

  const particles: Particle[] = []
  const palette = [
    'rgba(159, 211, 255, 0.76)',
    'rgba(220, 239, 255, 0.62)',
    'rgba(90, 167, 255, 0.54)',
  ]
  let width = 0
  let height = 0
  let pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
  let frame = 0
  let lastTime = 0

  function createParticle(): Particle {
    const radius = 0.8 + Math.random() * 2.4
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.12,
      vy: -0.05 - Math.random() * 0.16,
      radius,
      pulse: Math.random() * Math.PI * 2,
      color: palette[Math.floor(Math.random() * palette.length)],
      line: Math.random() > 0.72,
    }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect()
    width = Math.max(1, rect.width)
    height = Math.max(1, rect.height)
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.floor(width * pixelRatio)
    canvas.height = Math.floor(height * pixelRatio)
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)

    const targetCount = width < 640 ? 26 : 52
    particles.length = 0
    for (let index = 0; index < targetCount; index += 1) {
      particles.push(createParticle())
    }
  }

  function draw(time: number) {
    const delta = Math.min(32, time - lastTime || 16)
    lastTime = time
    frame += delta * 0.001

    context.clearRect(0, 0, width, height)

    particles.forEach((particle) => {
      particle.x += particle.vx * delta
      particle.y += particle.vy * delta
      particle.pulse += delta * 0.0014

      if (particle.y < -12 || particle.x < -16 || particle.x > width + 16) {
        Object.assign(particle, createParticle(), { y: height + Math.random() * 18 })
      }

      const alpha = 0.36 + Math.sin(particle.pulse + frame) * 0.18
      context.globalAlpha = Math.max(0.12, alpha)
      context.fillStyle = particle.color
      context.beginPath()
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2)
      context.fill()

      if (particle.line) {
        context.globalAlpha = 0.1
        context.strokeStyle = particle.color
        context.beginPath()
        context.moveTo(particle.x, particle.y)
        context.lineTo(particle.x + 22, particle.y - 14)
        context.stroke()
      }
    })

    context.globalAlpha = 1
    animationFrame = requestAnimationFrame(draw)
  }

  resizeObserver = 'ResizeObserver' in window ? new ResizeObserver(resize) : null
  resizeObserver?.observe(canvas)
  resize()
  animationFrame = requestAnimationFrame(draw)
}

onMounted(() => {
  setupReveal()
  setupParticles()
})

onBeforeUnmount(() => {
  revealObserver?.disconnect()
  resizeObserver?.disconnect()
  if (animationFrame) cancelAnimationFrame(animationFrame)
})
</script>
