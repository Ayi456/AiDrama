<template>
  <div class="prod-content">
    <div v-if="selectedShot" class="prod-content video-workbench">
      <section class="shot-panel shot-panel--studio video-panel video-panel--studio">
        <div class="shot-panel__head shot-panel__head--compact">
          <div>
            <div class="shot-panel__title">视频创作</div>
            <div class="shot-panel__desc">基于当前镜头信息与参考帧生成视频，切换中间镜头列表时左右两栏同步更新。</div>
          </div>
          <div class="shot-panel__head-tags">
            <span class="tag mono">#{{ selectedShotIndexLabel }}</span>
            <span v-if="state.lockedVideoProvider" class="tag">{{ state.lockedVideoProvider }}</span>
          </div>
        </div>

        <div class="shot-panel__scroll shot-panel__scroll--studio">
          <div class="shot-studio__group shot-studio__group--settings">
            <div class="shot-studio__group-head">
              <span class="shot-studio__label">基础设置</span>
              <span class="shot-studio__counter">{{ promptDraft.length }} 字</span>
            </div>

            <div class="shot-studio__settings-grid">
              <div class="shot-studio__field shot-studio__field--full">
                <span class="shot-studio__field-label">当前模型</span>
                <div class="shot-studio__select-like">
                  <span>{{ state.lockedVideoModelName || state.lockedVideoConfigLabel || '未配置模型' }}</span>
                  <small v-if="state.lockedVideoProvider">{{ state.lockedVideoProvider }}</small>
                </div>
              </div>

              <div class="shot-studio__field shot-studio__field--full">
                <span class="shot-studio__field-label">镜头信息</span>
                <div class="shot-studio__shot-meta">
                  <span class="tag">{{ selectedShot.title || `镜头 ${selectedShotIndexLabel}` }}</span>
                  <span class="tag">{{ selectedShot.shot_type || selectedShot.shotType || '未设景别' }}</span>
                  <span class="tag mono">{{ selectedShot.duration || 10 }}s</span>
                  <span :class="['prod-state-pill', state.getVideoStateClass(selectedShot)]">{{ state.getVideoStateText(selectedShot) }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="shot-studio__group">
            <div class="shot-studio__group-head">
              <span class="shot-studio__label">视频提示词</span>
              <span class="shot-studio__counter">{{ promptDraft.length }} 字</span>
            </div>
            <textarea
              v-model="promptDraft"
              class="shot-studio__textarea"
              rows="7"
              placeholder="按镜头动作、节奏、运镜和情绪拆分视频提示词"
              @blur="savePromptDraft()"
            />
            <div class="shot-studio__helper">留空时会用当前镜头信息自动生成默认视频提示词，点击生成前会自动保存。</div>
          </div>

          <div class="shot-studio__group">
            <div class="shot-studio__group-head">
              <span class="shot-studio__label">参考画面</span>
              <span class="shot-studio__counter">{{ referenceCountLabel }}</span>
            </div>

            <div class="video-workbench__modebar">
              <button
                type="button"
                :class="['video-workbench__mode', { active: referenceMode === 'auto' }]"
                @click="setReferenceMode('auto')"
              >
                <ImageIcon :size="13" />
                首尾帧
              </button>
              <button
                type="button"
                :class="['video-workbench__mode', { active: referenceMode === 'capture' }]"
                @click="setReferenceMode('capture')"
              >
                <Camera :size="13" />
                截帧
              </button>
              <button
                type="button"
                :class="['video-workbench__mode', { active: referenceMode === 'multimodal' }]"
                @click="setReferenceMode('multimodal')"
              >
                <Film :size="13" />
                多模态
              </button>
            </div>

            <template v-if="referenceMode !== 'multimodal'">
              <div v-if="referenceMode === 'capture'" class="video-workbench__capture-source">
                <div class="video-workbench__capture-head">
                  <div class="shot-studio__field-label">上一镜头视频</div>
                  <div class="video-workbench__capture-actions">
                    <button
                      class="btn btn-sm"
                      type="button"
                      :disabled="isCapturingFrame || !captureSourceVideoUrl"
                      @click="captureCurrentFrame"
                    >
                      <Camera v-if="!isCapturingFrame" :size="12" />
                      <Loader2 v-else :size="12" class="animate-spin" />
                      {{ isCapturingFrame ? '截取中...' : '截取上一镜头当前帧' }}
                    </button>
                    <button
                      v-if="capturedFrameUrl"
                      class="btn btn-sm"
                      type="button"
                      @click="clearCapturedFrame"
                    >
                      <Trash2 :size="12" />
                      清除截帧
                    </button>
                  </div>
                  <span v-if="captureSourceLabel" class="dim" style="font-size:12px">来源：{{ captureSourceLabel }}</span>
                </div>
                <video
                  v-if="captureSourceVideoUrl"
                  ref="captureSourceVideoEl"
                  :src="assetUrl(captureSourceVideoUrl)"
                  class="prod-video prod-video--source"
                  controls
                  crossorigin="anonymous"
                  preload="metadata"
                  playsinline
                />
                <div v-else class="shot-empty-block">当前没有上一镜头视频可截取</div>
                <div class="shot-studio__helper">暂停上一镜头视频到目标帧后再截取。</div>
              </div>

              <div class="video-workbench__refs">
                <button class="video-workbench__ref" type="button" @click="openReference(activeFirstFrame, `镜头 #${selectedShotIndexLabel} ${activeFirstFrameLabel}`)">
                  <img v-if="activeFirstFrame" :src="assetUrl(activeFirstFrame)" class="previewable-image" />
                  <div v-else class="prod-cover-empty">{{ activeFirstFrameEmptyText }}</div>
                  <b>{{ activeFirstFrameLabel }}</b>
                </button>
                <button class="video-workbench__ref" type="button" @click="openReference(activeLastFrame, `镜头 #${selectedShotIndexLabel} ${activeLastFrameLabel}`)">
                  <img v-if="activeLastFrame" :src="assetUrl(activeLastFrame)" class="previewable-image" />
                  <div v-else class="prod-cover-empty">{{ activeLastFrameEmptyText }}</div>
                  <b>{{ activeLastFrameLabel }}</b>
                </button>
              </div>

              <div v-if="referenceMode === 'capture'" class="video-workbench__tail-picker">
                <div class="video-workbench__tail-picker-head">
                  <div class="shot-studio__field-label">当前镜头图片</div>
                  <span class="shot-studio__counter">{{ tailFrameOptions.length }}</span>
                </div>
                <div v-if="tailFrameOptions.length" class="video-workbench__tail-grid">
                  <button
                    v-for="option in tailFrameOptions"
                    :key="option.key"
                    type="button"
                    :class="['video-workbench__tail-option', { selected: option.url === selectedTailFrameUrl }]"
                    @click="selectTailFrame(option.url)"
                  >
                    <img :src="assetUrl(option.url)" />
                    <span>{{ option.label }}</span>
                  </button>
                </div>
                <div v-else class="shot-empty-block">当前镜头还没有可选图片，先去出帧页生成首帧或尾帧</div>
              </div>

              <div class="shot-studio__helper">{{ activeReferenceSummary }}</div>
            </template>

            <template v-else>
              <div class="video-workbench__multi-summary">
                <span class="tag"><ImageIcon :size="11" /> 图片 {{ multimodalImageUrls.length }}/9</span>
                <span class="tag"><Film :size="11" /> 视频 {{ multimodalVideoUrls.length }}/3</span>
                <span class="tag"><Music :size="11" /> 音频 {{ multimodalAudioUrls.length }}/3</span>
              </div>

              <div class="video-workbench__multi-block video-workbench__capture-source video-workbench__capture-source--multi">
                <div class="video-workbench__capture-head">
                  <div class="shot-studio__field-label">上一镜头截帧</div>
                  <div class="video-workbench__capture-actions">
                    <button
                      class="btn btn-sm"
                      type="button"
                      :disabled="isCapturingFrame || !captureSourceVideoUrl"
                      @click="captureCurrentFrame"
                    >
                      <Camera v-if="!isCapturingFrame" :size="12" />
                      <Loader2 v-else :size="12" class="animate-spin" />
                      {{ isCapturingFrame ? '截取中...' : '截取当前帧' }}
                    </button>
                    <button
                      v-if="capturedFrameUrl"
                      class="btn btn-sm"
                      type="button"
                      @click="clearCapturedFrame"
                    >
                      <Trash2 :size="12" />
                      移除截帧
                    </button>
                  </div>
                  <span v-if="captureSourceLabel" class="dim" style="font-size:12px">来源：{{ captureSourceLabel }}</span>
                </div>
                <video
                  v-if="captureSourceVideoUrl"
                  ref="captureSourceVideoEl"
                  :src="assetUrl(captureSourceVideoUrl)"
                  class="prod-video prod-video--source prod-video--source-compact"
                  controls
                  crossorigin="anonymous"
                  preload="metadata"
                  playsinline
                />
                <div v-else class="shot-empty-block">当前没有上一镜头视频可截取</div>
                <div v-if="capturedFrameUrl" class="video-workbench__refs video-workbench__refs--compact">
                  <button class="video-workbench__ref" type="button" @click="openReference(capturedFrameUrl, '多模态截帧参考')">
                    <img :src="assetUrl(capturedFrameUrl)" class="previewable-image" />
                    <b>截帧参考</b>
                    <span class="video-workbench__remove" @click.stop="clearCapturedFrame">×</span>
                  </button>
                </div>
                <div class="shot-studio__helper">截取的画面会作为 1 张参考图，与下方图片、视频、音频一起参与多模态生成。</div>
              </div>

              <div class="video-workbench__multi-block">
                <div class="video-workbench__multi-head">
                  <div class="shot-studio__field-label">参考图</div>
                  <button class="btn btn-sm" type="button" :disabled="isUploadingMedia('image')" @click="imageUploadInput?.click()">
                    <Loader2 v-if="isUploadingMedia('image')" :size="12" class="animate-spin" />
                    上传图片
                  </button>
                </div>
                <input ref="imageUploadInput" class="sr-only" type="file" accept="image/*" multiple @change="uploadReferenceFiles('image', $event)" />
                <div v-if="selectedReferenceImages.length" class="video-workbench__refs video-workbench__refs--compact">
                  <button
                    v-for="item in selectedReferenceImages"
                    :key="item.url"
                    class="video-workbench__ref"
                    type="button"
                    @click="openReference(item.url, item.label)"
                  >
                    <img :src="assetUrl(item.url)" class="previewable-image" />
                    <b>{{ item.label }}</b>
                    <span class="video-workbench__remove" @click.stop="removeReference('image', item.url)">×</span>
                  </button>
                </div>
                <div v-else class="shot-empty-block">请上传参考图，或从已生成的角色/场景图片中选择</div>

                <div v-if="characterReferenceOptions.length || sceneReferenceOptions.length" class="video-workbench__source-groups">
                  <div v-if="characterReferenceOptions.length" class="video-workbench__source-group">
                    <div class="video-workbench__source-title">角色图片</div>
                    <div class="video-workbench__source-grid">
                      <button
                        v-for="item in characterReferenceOptions"
                        :key="item.url"
                        type="button"
                        :class="['video-workbench__source', { selected: isReferenceSelected('image', item.url) }]"
                        @click="toggleReferenceImage(item)"
                      >
                        <img :src="assetUrl(item.url)" />
                        <span>{{ item.label }}</span>
                      </button>
                    </div>
                  </div>
                  <div v-if="sceneReferenceOptions.length" class="video-workbench__source-group">
                    <div class="video-workbench__source-title">场景图片</div>
                    <div class="video-workbench__source-grid">
                      <button
                        v-for="item in sceneReferenceOptions"
                        :key="item.url"
                        type="button"
                        :class="['video-workbench__source', { selected: isReferenceSelected('image', item.url) }]"
                        @click="toggleReferenceImage(item)"
                      >
                        <img :src="assetUrl(item.url)" />
                        <span>{{ item.label }}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div class="video-workbench__multi-block">
                <div class="video-workbench__multi-head">
                  <div class="shot-studio__field-label">参考视频</div>
                  <button class="btn btn-sm" type="button" :disabled="isUploadingMedia('video')" @click="videoUploadInput?.click()">
                    <Loader2 v-if="isUploadingMedia('video')" :size="12" class="animate-spin" />
                    上传视频
                  </button>
                </div>
                <input ref="videoUploadInput" class="sr-only" type="file" accept="video/*" multiple @change="uploadReferenceFiles('video', $event)" />
                <div v-if="selectedReferenceVideos.length" class="video-workbench__clip-grid">
                  <div v-for="item in selectedReferenceVideos" :key="item.url" class="video-workbench__clip selected">
                    <video :src="assetUrl(item.url)" muted playsinline preload="metadata" />
                    <span>{{ item.label }}</span>
                    <button class="video-workbench__remove video-workbench__remove--button" type="button" @click="removeReference('video', item.url)">×</button>
                  </div>
                </div>
                <div v-else class="shot-empty-block">请上传参考视频，最多 3 个</div>
              </div>

              <div class="video-workbench__multi-block">
                <div class="video-workbench__multi-head">
                  <div class="shot-studio__field-label">参考音频</div>
                  <button class="btn btn-sm" type="button" :disabled="isUploadingMedia('audio')" @click="audioUploadInput?.click()">
                    <Loader2 v-if="isUploadingMedia('audio')" :size="12" class="animate-spin" />
                    上传音频
                  </button>
                </div>
                <input ref="audioUploadInput" class="sr-only" type="file" accept="audio/*" multiple @change="uploadReferenceFiles('audio', $event)" />
                <div v-if="selectedReferenceAudios.length" class="video-workbench__audio-list">
                  <div v-for="item in selectedReferenceAudios" :key="item.url" class="video-workbench__audio-item">
                    <Music :size="13" />
                    <span>{{ item.label }}</span>
                    <button type="button" @click="removeReference('audio', item.url)">移除</button>
                  </div>
                </div>
                <div v-else class="shot-empty-block">请上传参考音频，最多 3 个</div>
              </div>
            </template>
          </div>

          <div v-if="state.videoFailMessage(selectedShot.id)" class="shot-studio__group shot-studio__group--optional">
            <div class="shot-studio__group-head">
              <span class="shot-studio__label">最近失败信息</span>
            </div>
            <div class="prod-error">{{ state.videoFailMessage(selectedShot.id) }}</div>
          </div>
        </div>

        <div class="shot-studio__footer">
          <button class="btn btn-sm shot-studio__reset" type="button" @click="applyDefaultPrompt()">重置提示词</button>
          <div class="shot-studio__actions">
            <button class="btn btn-primary video-workbench__generate-btn" :disabled="state.isPendingVideo(selectedShot.id)" @click="generateSelectedVideo()">
              <Loader2 v-if="state.isPendingVideo(selectedShot.id)" :size="13" class="animate-spin" />
              <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              {{ state.getVideoGenerateActionLabel(selectedShot) }}
            </button>
          </div>
        </div>
      </section>

      <section class="shot-panel shot-panel--board video-panel video-panel--board">
        <div class="shot-panel__head shot-panel__head--board">
          <div>
            <div class="shot-panel__title">镜头列表 <span>可切换</span></div>
            <div class="shot-panel__desc">保留全部镜头列表，点击任意镜头后左侧提示词和右侧结果会切到当前镜头。</div>
          </div>
          <div class="shot-panel__head-tags">
            <span class="tag">{{ state.sbs.length }} 个镜头</span>
            <span class="tag mono">{{ selectedShotIndexLabel }}/{{ state.sbs.length }}</span>
          </div>
        </div>

        <div class="shot-panel__scroll shot-panel__scroll--board">
          <div class="shot-board__list">
            <article
              v-for="(sb, index) in state.sbs"
              :key="sb.id"
              :class="['shot-board__item', { active: sb.id === selectedShot.id }]"
              role="button"
              tabindex="0"
              @click="selectShot(sb)"
              @keydown.enter="selectShot(sb)"
              @keydown.space.prevent="selectShot(sb)"
            >
              <div class="shot-board__thumb">
                <video
                  v-if="state.hasVid(sb)"
                  :src="assetUrl(state.getVideoUrl(sb))"
                  muted
                  playsinline
                  preload="metadata"
                />
                <img v-else-if="state.hasImg(sb)" :src="assetUrl(state.getStoryboardCover(sb))" class="previewable-image" />
                <div v-else class="shot-board__thumb-empty">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                </div>
              </div>

              <div class="shot-board__copy">
                <div class="shot-board__head">
                  <span class="shot-board__index">镜头 {{ formatShotIndex(index) }}</span>
                  <span class="shot-board__badge">{{ sb.shot_type || sb.shotType || '未设景别' }}</span>
                </div>
                <div class="shot-board__title">{{ sb.title || `镜头 ${formatShotIndex(index)}` }}</div>
                <div class="shot-board__desc">{{ sb.description || sb.title || '暂无镜头描述' }}</div>
                <div class="shot-board__meta">
                  <span :class="['shot-board__status', state.getVideoStateClass(sb)]">视频 {{ state.getVideoStateText(sb) }}</span>
                  <span :class="['shot-board__status', hasReferencePreview(sb) ? 'is-ready' : 'is-empty']">{{ getReferenceSummary(sb) }}</span>
                </div>
              </div>

              <button class="shot-board__delete" type="button" title="切换到当前镜头" @click.stop="selectShot(sb)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </article>
          </div>
        </div>

        <div class="shot-board__summary">
          <div class="shot-board__summary-head">
            <span class="shot-results__refs-title">视频生成进度</span>
            <span class="shot-studio__counter">{{ videoGenerationProgress }}%</span>
          </div>
          <div class="shot-board__summary-tags">
            <span class="shot-board__summary-chip">{{ state.lockedVideoConfigLabel || '默认模型' }}</span>
            <span class="shot-board__summary-chip">{{ state.shotVidCount }}/{{ state.sbs.length }} 已生成</span>
            <span class="shot-board__summary-chip">{{ pendingCount }} 个处理中</span>
          </div>
          <div class="shot-board__summary-track">
            <span class="shot-board__summary-fill" :style="{ width: `${videoGenerationProgress}%` }"></span>
          </div>
          <div class="shot-board__summary-meta">
            <span>当前镜头 {{ selectedShot.title || `#${selectedShotIndexLabel}` }}</span>
            <span>{{ activeReferenceSummary }}</span>
          </div>
        </div>
      </section>

      <section class="shot-panel shot-panel--results video-panel video-panel--result">
        <div class="shot-panel__head shot-panel__head--results">
          <div>
            <div class="shot-panel__title">生成结果</div>
            <div class="shot-panel__desc">{{ selectedShot.title || `镜头 ${selectedShotIndexLabel}` }} 的视频输出与当前参考画面。</div>
          </div>
          <div class="shot-panel__head-tags shot-panel__head-tags--results">
            <span :class="['prod-state-pill', state.getVideoStateClass(selectedShot)]">{{ state.getVideoStateText(selectedShot) }}</span>
          </div>
        </div>

        <div class="video-workbench__result">
          <video
            v-if="state.hasVid(selectedShot)"
            ref="selectedVideoEl"
            :src="assetUrl(state.getVideoUrl(selectedShot))"
            class="prod-video"
            controls
            crossorigin="anonymous"
            preload="metadata"
            playsinline
          />
          <img
            v-else-if="state.hasImg(selectedShot)"
            :src="assetUrl(state.getStoryboardCover(selectedShot))"
            class="previewable-image"
            @click.stop="handlers.openImageByPath(state.getStoryboardCover(selectedShot), `镜头 #${selectedShotIndexLabel} 参考图`)"
          />
          <div v-else class="prod-cover-empty">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
          </div>
        </div>

        <div class="shot-results__history video-history-panel">
          <div class="shot-results__history-head">
            <span class="shot-results__history-title"><History :size="13" /> 视频历史记录</span>
            <button class="btn btn-sm" type="button" :disabled="selectedVideoHistoryLoading" @click="reloadSelectedVideoHistory">
              <Loader2 v-if="selectedVideoHistoryLoading" :size="12" class="animate-spin" />
              <RefreshCw v-else :size="12" />
              刷新
            </button>
          </div>

          <div v-if="selectedVideoHistoryLoading && !selectedVideoHistory.length" class="shot-empty-block">正在加载视频历史...</div>
          <div v-else-if="selectedVideoHistory.length" class="video-history-list">
            <button
              v-for="(item, index) in selectedVideoHistory"
              :key="item.id || state.videoHistoryUrl(item)"
              type="button"
              :class="['video-history-item', { active: isActiveHistoryVideo(item) }]"
              @click="selectHistoryVideo(item)"
            >
              <span class="video-history-thumb">
                <video :src="assetUrl(state.videoHistoryUrl(item))" muted playsinline preload="metadata" />
              </span>
              <span class="video-history-copy">
                <span class="video-history-title">{{ videoHistoryTitle(item, index) }}</span>
                <span class="video-history-meta">{{ videoHistoryMeta(item, index) }}</span>
              </span>
              <span class="video-history-action">
                <Check v-if="isActiveHistoryVideo(item)" :size="13" />
                {{ videoHistoryActionLabel(item) }}
              </span>
            </button>
          </div>
          <div v-else class="shot-empty-block">这个镜头还没有历史视频，生成完成后会出现在这里。</div>
          <div v-if="state.videoFailMessage(selectedShot.id)" class="prod-error">{{ state.videoFailMessage(selectedShot.id) }}</div>
        </div>

        <div class="shot-studio__footer">
          <button class="btn btn-sm shot-studio__reset" type="button" @click="handlers.batchVideos()">批量生成</button>
          <div class="shot-studio__actions">
            <button class="btn btn-primary video-workbench__generate-btn" :disabled="state.isPendingVideo(selectedShot.id)" @click="generateSelectedVideo()">
              <Loader2 v-if="state.isPendingVideo(selectedShot.id)" :size="13" class="animate-spin" />
              <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
              {{ state.getVideoGenerateActionLabel(selectedShot) }}
            </button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { Camera, Check, Film, History, Image as ImageIcon, Loader2, Music, RefreshCw, Trash2 } from 'lucide-vue-next'
import { uploadAPI } from '@/composables/useApi'
import { buildMultimodalReferenceOptions } from '@/composables/chapter/chapterShotMediaPolicy'
import {
  getCaptureSourceVideoUrl,
  getCaptureTailFrameOptions,
  getDefaultCaptureTailFrameUrl,
  getPreviousStoryboard,
} from '@/composables/chapter/chapterVideoCaptureTargets'
import { captureVideoFrameFile } from '@/composables/chapter/chapterVideoFrameCapture'
import { assetUrl } from '@/utils/asset-url'

const props = defineProps({
  state: {
    type: Object,
    required: true,
  },
  handlers: {
    type: Object,
    required: true,
  },
})

const selectedShot = computed(() => (
  props.state.activeVideoSb || props.state.sbs[0] || null
))

const selectedShotIndex = computed(() => (
  selectedShot.value ? props.state.sbs.findIndex(sb => sb.id === selectedShot.value.id) : -1
))

const selectedShotIndexLabel = computed(() => String(selectedShotIndex.value + 1).padStart(2, '0'))
const selectedShotKey = computed(() => String(selectedShot.value?.id || selectedShotIndex.value || 'current'))
const selectedVideoHistory = computed(() => (
  selectedShot.value ? props.state.getVideoHistory(selectedShot.value.id) : []
))
const selectedVideoHistoryLoading = computed(() => (
  selectedShot.value ? props.state.isVideoHistoryLoading(selectedShot.value.id) : false
))
const selectedVideoUrl = computed(() => (
  selectedShot.value ? props.state.getVideoUrl(selectedShot.value) : ''
))

const promptDraft = ref('')
const referenceMode = ref('auto')
const selectedVideoEl = ref(null)
const captureSourceVideoEl = ref(null)
const capturedFrameByShot = ref({})
const capturedFrameSourceLabelByShot = ref({})
const selectedTailFrameByShot = ref({})
const isCapturingFrame = ref(false)
const selectedReferenceImagesByShot = ref({})
const selectedReferenceVideosByShot = ref({})
const selectedReferenceAudiosByShot = ref({})
const uploadingMediaTypes = ref([])
const imageUploadInput = ref(null)
const videoUploadInput = ref(null)
const audioUploadInput = ref(null)

watch(
  () => [
    selectedShot.value?.id || 0,
    selectedShot.value?.video_prompt || selectedShot.value?.videoPrompt || '',
  ],
  () => {
    const shot = selectedShot.value
    if (!shot) {
      promptDraft.value = ''
      return
    }
    promptDraft.value = shot.video_prompt || shot.videoPrompt || props.state.buildDefaultVideoPrompt(shot)
  },
  { immediate: true },
)

watch(
  () => selectedShot.value?.id || 0,
  (id) => {
    if (id) void props.state.loadVideoHistory(id)
  },
  { immediate: true },
)

const firstFrame = computed(() => (
  selectedShot.value ? props.state.getFirstFrame(selectedShot.value) : ''
))

const lastFrame = computed(() => (
  selectedShot.value ? props.state.getLastFrame(selectedShot.value) : ''
))

const previousShot = computed(() => (
  selectedShot.value ? getPreviousStoryboard(selectedShot.value, props.state.sbs) : null
))

const captureSourceVideoUrl = computed(() => (
  selectedShot.value ? getCaptureSourceVideoUrl(selectedShot.value, props.state.sbs) : ''
))

const captureSourceLabel = computed(() => {
  if (!previousShot.value || !captureSourceVideoUrl.value) return ''
  const previousIndexLabel = selectedShotIndex.value > 0
    ? String(selectedShotIndex.value).padStart(2, '0')
    : ''
  const base = previousIndexLabel ? `镜头 #${previousIndexLabel}` : '上一镜头'
  return previousShot.value.title ? `${base} ${previousShot.value.title}` : base
})

const tailFrameOptions = computed(() => (
  selectedShot.value ? getCaptureTailFrameOptions(selectedShot.value) : []
))

const capturedFrameUrl = computed(() => (
  capturedFrameByShot.value[selectedShotKey.value] || ''
))

const capturedFrameSourceLabel = computed(() => (
  capturedFrameSourceLabelByShot.value[selectedShotKey.value] || ''
))

const selectedTailFrameUrl = computed(() => {
  if (!selectedShot.value) return ''
  if (referenceMode.value !== 'capture') return lastFrame.value
  return selectedTailFrameByShot.value[selectedShotKey.value] || getDefaultCaptureTailFrameUrl(selectedShot.value)
})

const selectedTailFrameLabel = computed(() => {
  if (referenceMode.value !== 'capture') return '尾帧'
  const match = tailFrameOptions.value.find(item => item.url === selectedTailFrameUrl.value)
  return match?.label || '尾帧'
})

watch(
  () => [selectedShotKey.value, tailFrameOptions.value.map(item => item.url).join('|')],
  () => {
    if (!selectedShot.value) return
    const key = selectedShotKey.value
    const current = selectedTailFrameByShot.value[key] || ''
    const next = tailFrameOptions.value[0]?.url || ''
    if (current && tailFrameOptions.value.some(item => item.url === current)) return
    if (next) {
      selectedTailFrameByShot.value = {
        ...selectedTailFrameByShot.value,
        [key]: next,
      }
      return
    }
    if (!current) return
    const nextMap = { ...selectedTailFrameByShot.value }
    delete nextMap[key]
    selectedTailFrameByShot.value = nextMap
  },
  { immediate: true },
)

const activeFirstFrame = computed(() => (
  referenceMode.value === 'capture' ? capturedFrameUrl.value : firstFrame.value
))

const activeLastFrame = computed(() => (
  referenceMode.value === 'capture' ? selectedTailFrameUrl.value : lastFrame.value
))

const activeFirstFrameLabel = computed(() => (
  referenceMode.value === 'capture'
    ? '截帧'
    : '首帧'
))

const activeFirstFrameEmptyText = computed(() => (
  referenceMode.value === 'capture' ? '暂无截帧' : '暂无首帧'
))

const activeLastFrameLabel = computed(() => (
  referenceMode.value === 'capture'
    ? selectedTailFrameLabel.value
    : '尾帧'
))

const activeLastFrameEmptyText = computed(() => (
  referenceMode.value === 'capture'
    ? '暂无当前镜头图片'
    : '暂无尾帧'
))

const selectedReferenceImages = computed(() => (
  selectedReferenceImagesByShot.value[selectedShotKey.value] || []
))

const selectedReferenceVideos = computed(() => (
  selectedReferenceVideosByShot.value[selectedShotKey.value] || []
))

const selectedReferenceAudios = computed(() => (
  selectedReferenceAudiosByShot.value[selectedShotKey.value] || []
))

const currentMultimodalReferenceOptions = computed(() => (
  buildMultimodalReferenceOptions({
    storyboard: selectedShot.value,
    chars: props.state.chars || props.state.visualChars || [],
    scenes: props.state.scenes || [],
  })
))

const characterReferenceOptions = computed(() => (
  currentMultimodalReferenceOptions.value.filter(item => item.source === 'character')
))

const sceneReferenceOptions = computed(() => (
  currentMultimodalReferenceOptions.value.filter(item => item.source === 'scene')
))

const multimodalImageUrls = computed(() => (
  uniqueStrings([capturedFrameUrl.value, ...selectedReferenceImages.value.map(item => item.url)]).slice(0, 9)
))

watch(
  () => [selectedShotKey.value, currentMultimodalReferenceOptions.value.map(item => item.url).join('|')],
  () => {
    if (!selectedShot.value) return
    const key = selectedShotKey.value
    if (Object.prototype.hasOwnProperty.call(selectedReferenceImagesByShot.value, key)) return
    if (!currentMultimodalReferenceOptions.value.length) return
    selectedReferenceImagesByShot.value = {
      ...selectedReferenceImagesByShot.value,
      [key]: currentMultimodalReferenceOptions.value,
    }
  },
  { immediate: true },
)

const multimodalVideoUrls = computed(() => (
  uniqueStrings(selectedReferenceVideos.value.map(item => item.url)).slice(0, 3)
))

const multimodalAudioUrls = computed(() => (
  uniqueStrings(selectedReferenceAudios.value.map(item => item.url)).slice(0, 3)
))

const referenceCountLabel = computed(() => {
  if (referenceMode.value === 'multimodal') {
    return `${multimodalImageUrls.value.length} 图 / ${multimodalVideoUrls.value.length} 视频 / ${multimodalAudioUrls.value.length} 音频`
  }
  let count = 0
  if (activeFirstFrame.value) count += 1
  if (activeLastFrame.value) count += 1
  return `${count} 张`
})

function getReferenceSummary(storyboard) {
  if (!storyboard) return '仅文本生成'
  if (referenceMode.value === 'capture' && selectedShot.value?.id === storyboard.id) {
    return activeReferenceSummary.value
  }
  return props.state.getVideoReferenceSummary(storyboard)
}

function hasReferencePreview(storyboard) {
  if (!storyboard) return false
  if (referenceMode.value === 'capture' && selectedShot.value?.id === storyboard.id) {
    return Boolean(capturedFrameUrl.value || selectedTailFrameUrl.value)
  }
  return props.state.hasImg(storyboard)
}

const activeReferenceSummary = computed(() => {
  if (!selectedShot.value) return '仅文本生成'
  if (referenceMode.value !== 'capture') {
    return props.state.getVideoReferenceSummary(selectedShot.value)
  }
  if (!captureSourceVideoUrl.value) return '当前没有上一镜头视频'
  const firstLabel = capturedFrameUrl.value
    ? (capturedFrameSourceLabel.value ? `首帧：${capturedFrameSourceLabel.value}` : '首帧：上一镜头视频')
    : '首帧：待截取'
  const tailLabel = selectedTailFrameUrl.value
    ? `尾帧：${selectedTailFrameLabel.value}`
    : '尾帧：待选择'
  return `${firstLabel} / ${tailLabel}`
})

const videoGenerationProgress = computed(() => {
  if (!props.state.sbs.length) return 0
  return Math.round((props.state.shotVidCount / props.state.sbs.length) * 100)
})

const pendingCount = computed(() => (
  props.state.sbs.filter(sb => props.state.isPendingVideo(sb.id)).length
))

function savePromptDraft(nextValue = promptDraft.value) {
  if (!selectedShot.value) return
  const value = String(nextValue ?? '').trim()
  promptDraft.value = value
  props.handlers.handleShotFieldUpdate({
    sb: selectedShot.value,
    field: 'video_prompt',
    value,
  })
}

function applyDefaultPrompt() {
  if (!selectedShot.value) return
  const nextPrompt = props.state.buildDefaultVideoPrompt(selectedShot.value)
  promptDraft.value = nextPrompt
  savePromptDraft(nextPrompt)
}

function selectShot(sb) {
  props.handlers.handleShotSelection(sb)
}

function generateSelectedVideo() {
  if (!selectedShot.value) return
  savePromptDraft()
  if (referenceMode.value === 'capture') {
    if (!capturedFrameUrl.value) {
      toast.error('请先截取上一镜头视频帧')
      return
    }
    const lastFrameUrl = selectedTailFrameUrl.value || ''
    props.handlers.genVid(selectedShot.value, {
      reference_mode: 'capture',
      first_frame_url: capturedFrameUrl.value,
      last_frame_url: lastFrameUrl || undefined,
    })
    return
  }
  if (referenceMode.value !== 'multimodal') {
    props.handlers.genVid(selectedShot.value)
    return
  }

  if (!multimodalImageUrls.value.length && !multimodalVideoUrls.value.length && multimodalAudioUrls.value.length) {
    toast.error('音频参考需要至少配合一张图或一个视频')
    return
  }

  props.handlers.genVid(selectedShot.value, {
    reference_mode: 'multimodal',
    first_frame_url: capturedFrameUrl.value || undefined,
    reference_image_urls: multimodalImageUrls.value,
    reference_video_urls: multimodalVideoUrls.value,
    reference_audio_urls: multimodalAudioUrls.value,
  })
}

function isActiveHistoryVideo(item) {
  return !!selectedVideoUrl.value && props.state.videoHistoryUrl(item) === selectedVideoUrl.value
}

function videoHistoryTitle(item, index) {
  const model = item?.model || item?.provider || ''
  return model ? `${model}` : `历史视频 ${index + 1}`
}

function videoHistoryMeta(item, index) {
  const rawDate = item?.created_at || item?.createdAt || ''
  const date = rawDate ? new Date(rawDate) : null
  const dateLabel = date && Number.isFinite(date.getTime())
    ? date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : `#${item?.id || index + 1}`
  return item?.status ? `${dateLabel} · ${item.status}` : dateLabel
}

function videoHistoryActionLabel(item) {
  return isActiveHistoryVideo(item) ? '当前' : '使用'
}

function reloadSelectedVideoHistory() {
  if (!selectedShot.value?.id) return
  void props.state.loadVideoHistory(selectedShot.value.id)
}

function selectHistoryVideo(item) {
  if (!selectedShot.value || isActiveHistoryVideo(item)) return
  props.handlers.restoreVideoFromHistory(selectedShot.value, item)
}

function openReference(path, title) {
  if (!path) return
  props.handlers.openImageByPath(path, title)
}

function formatShotIndex(index) {
  return String(index + 1).padStart(2, '0')
}

function setReferenceMode(mode) {
  referenceMode.value = mode
}

function selectTailFrame(url) {
  if (!selectedShot.value || !url) return
  selectedTailFrameByShot.value = {
    ...selectedTailFrameByShot.value,
    [selectedShotKey.value]: url,
  }
}

function clearCapturedFrame() {
  if (!selectedShot.value) return
  const key = selectedShotKey.value
  const nextCaptured = { ...capturedFrameByShot.value }
  const nextSourceLabels = { ...capturedFrameSourceLabelByShot.value }
  delete nextCaptured[key]
  delete nextSourceLabels[key]
  capturedFrameByShot.value = nextCaptured
  capturedFrameSourceLabelByShot.value = nextSourceLabels
}

async function captureCurrentFrame() {
  if (!captureSourceVideoEl.value || !selectedShot.value || !captureSourceVideoUrl.value) {
    toast.error('当前没有上一镜头视频可截取')
    return
  }
  if (referenceMode.value === 'multimodal' && !capturedFrameUrl.value && mediaItemsFor('image').length >= mediaLimit('image')) {
    toast.error('参考图已达到上限，请先移除一张图片再截帧')
    return
  }
  isCapturingFrame.value = true
  try {
    const file = await captureVideoFrameFile(captureSourceVideoEl.value, {
      filenamePrefix: `shot-${selectedShotIndexLabel.value}-prev`,
    })
    const uploaded = await uploadAPI.image(file)
    const nextCaptured = uploaded?.url || uploaded?.path || ''
    if (!nextCaptured) throw new Error('截帧上传失败')
    capturedFrameByShot.value = {
      ...capturedFrameByShot.value,
      [selectedShotKey.value]: nextCaptured,
    }
    capturedFrameSourceLabelByShot.value = {
      ...capturedFrameSourceLabelByShot.value,
      [selectedShotKey.value]: captureSourceLabel.value || '上一镜头视频',
    }
    if (referenceMode.value !== 'multimodal') referenceMode.value = 'capture'
    toast.success('已截取上一镜头帧')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '截帧失败')
  } finally {
    isCapturingFrame.value = false
  }
}

function mediaRefFor(type) {
  if (type === 'video') return selectedReferenceVideosByShot
  if (type === 'audio') return selectedReferenceAudiosByShot
  return selectedReferenceImagesByShot
}

function mediaItemsFor(type) {
  if (type === 'video') return selectedReferenceVideos.value
  if (type === 'audio') return selectedReferenceAudios.value
  return selectedReferenceImages.value
}

function mediaLimit(type) {
  if (type === 'image') return 9
  return 3
}

function mediaCount(type) {
  const count = mediaItemsFor(type).length
  if (type !== 'image' || referenceMode.value !== 'multimodal') return count
  if (!capturedFrameUrl.value) return count
  return mediaItemsFor(type).some(item => item.url === capturedFrameUrl.value) ? count : count + 1
}

function setReferenceItems(type, items) {
  const targetRef = mediaRefFor(type)
  targetRef.value = {
    ...targetRef.value,
    [selectedShotKey.value]: uniqueByUrl(items).slice(0, mediaLimit(type)),
  }
}

function addReference(type, item) {
  if (!item?.url) return
  const current = mediaItemsFor(type)
  if (current.some(ref => ref.url === item.url)) return
  if (mediaCount(type) >= mediaLimit(type)) {
    toast.error(`参考${type === 'image' ? '图' : type === 'video' ? '视频' : '音频'}最多 ${mediaLimit(type)} 个`)
    return
  }
  setReferenceItems(type, [...current, item])
}

function removeReference(type, url) {
  setReferenceItems(type, mediaItemsFor(type).filter(item => item.url !== url))
}

function toggleReferenceImage(item) {
  if (isReferenceSelected('image', item.url)) {
    removeReference('image', item.url)
    return
  }
  addReference('image', item)
}

function isReferenceSelected(type, url) {
  return mediaItemsFor(type).some(item => item.url === url)
}

function isUploadingMedia(type) {
  return uploadingMediaTypes.value.includes(type)
}

async function uploadReferenceFiles(type, event) {
  const input = event?.target
  const files = Array.from(input?.files || [])
  if (input) input.value = ''
  if (!files.length) return

  const remaining = mediaLimit(type) - mediaCount(type)
  if (remaining <= 0) {
    toast.error(`参考${type === 'image' ? '图' : type === 'video' ? '视频' : '音频'}已达到上限`)
    return
  }

  const selectedFiles = files.slice(0, remaining)
  if (files.length > remaining) toast.info(`只添加前 ${remaining} 个文件`)

  uploadingMediaTypes.value = uniqueStrings([...uploadingMediaTypes.value, type])
  try {
    for (const file of selectedFiles) {
      if (type === 'image' && !file.type.startsWith('image/')) throw new Error('请选择图片文件')
      if (type === 'video' && !file.type.startsWith('video/')) throw new Error('请选择视频文件')
      if (type === 'audio' && !file.type.startsWith('audio/')) throw new Error('请选择音频文件')

      const uploaded = type === 'image'
        ? await uploadAPI.image(file)
        : type === 'video'
          ? await uploadAPI.video(file)
          : await uploadAPI.audio(file)
      addReference(type, {
        label: file.name,
        url: uploaded.url || `/${uploaded.path}`,
        source: 'upload',
      })
    }
    toast.success('参考素材已添加')
  } catch (error) {
    toast.error(error?.message || '上传参考素材失败')
  } finally {
    uploadingMediaTypes.value = uploadingMediaTypes.value.filter(item => item !== type)
  }
}

function uniqueStrings(values) {
  return Array.from(new Set(values.map(item => String(item || '').trim()).filter(Boolean)))
}

function uniqueByUrl(items) {
  const seen = new Set()
  return items.filter((item) => {
    if (!item.url || seen.has(item.url)) return false
    seen.add(item.url)
    return true
  })
}
</script>

<style>
@import url('@/assets/production-shot-frames.css');
</style>
