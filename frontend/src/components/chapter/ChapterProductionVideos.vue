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
              @input="markPromptDraftDirty($event.target.value)"
              @blur="savePromptDraft()"
            />
            <div class="shot-studio__helper">
              {{ isPromptSaving ? '视频提示词保存中...' : '留空时会用当前镜头信息自动生成默认视频提示词，点击生成前会自动保存。' }}
            </div>
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
            <div class="shot-studio__helper">{{ referenceModeGuidance }}</div>

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
                <div class="shot-studio__helper">截取的画面会作为 1 张普通参考图参与多模态生成，不等同于强首帧；需要上下镜头衔接时切回截帧/首尾帧。</div>
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

          <div v-if="selectedBillingVisible" class="shot-studio__group shot-studio__group--optional">
            <div class="video-billing-card" :class="billingToneClass">
              <div class="video-billing-card__icon">
                <ReceiptText v-if="selectedBillingInfo.status === 'settled'" :size="16" :stroke-width="1.9" />
                <CircleAlert v-else :size="16" :stroke-width="1.9" />
              </div>
              <div class="video-billing-card__main">
                <div class="video-billing-card__title">{{ billingStatusLabel }}</div>
                <div class="video-billing-card__meta">
                  已确认 {{ selectedBillingInfo.billedSeconds || '0.00' }} 秒，已扣 ¥{{ billingAmountLabel }}
                </div>
              </div>
              <div v-if="selectedBillingInfo.status === 'billing_required'" class="video-billing-card__actions">
                <button class="btn btn-sm" type="button" @click="goWallet">
                  <Wallet :size="12" :stroke-width="2" />
                  去充值
                </button>
                <button class="btn btn-sm" type="button" @click="retrySelectedBilling">
                  重试结算
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="shot-studio__footer">
          <button class="btn btn-sm shot-studio__reset" type="button" @click="applyDefaultPrompt()">重置提示词</button>
          <div class="shot-studio__actions">
            <button class="btn btn-primary video-workbench__generate-btn" :disabled="state.isPendingVideo(selectedShot.id) || isPromptSaving" @click="generateSelectedVideo()">
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

        <div class="video-workbench__result" @click="onResultBoxClick">
          <div v-if="isSelectedVideoPending" class="prod-cover-empty video-workbench__pending-result">
            <Loader2 :size="28" class="animate-spin" />
            <div class="video-workbench__pending-title">新视频生成中</div>
            <div class="video-workbench__pending-note">
              {{ selectedVideoUrl ? '上一版视频已保留在历史记录中，新结果通过检测后会自动替换。' : '生成完成并通过检测后会自动显示在这里。' }}
            </div>
          </div>
          <div v-else-if="selectedBillingInfo.status === 'billing_required'" class="prod-cover-empty video-workbench__billing-required">
            <CircleAlert :size="28" :stroke-width="1.6" />
            <div class="video-workbench__pending-title">余额不足，视频待结算</div>
            <div class="video-workbench__pending-note">
              已确认 {{ selectedBillingInfo.billedSeconds || '0.00' }} 秒，待充值后继续扣费并发布成品。
            </div>
            <div class="video-workbench__billing-actions">
              <button class="btn btn-sm" type="button" @click="goWallet">
                <Wallet :size="12" :stroke-width="2" />
                去充值
              </button>
              <button class="btn btn-primary btn-sm" type="button" @click="retrySelectedBilling">
                重试结算
              </button>
            </div>
          </div>
          <video
            v-else-if="state.hasVid(selectedShot)"
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
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { Camera, Check, CircleAlert, Film, History, Image as ImageIcon, Loader2, Music, ReceiptText, RefreshCw, Trash2, Wallet } from 'lucide-vue-next'
import { uploadAPI } from '@/composables/useApi'
import { shouldShowVideoPendingPlaceholder } from '@/composables/chapter/chapterShotMediaPolicy'
import { storyboardStateKey } from '@/composables/chapter/chapterVideoWorkbenchPolicy'
import { useChapterVideoPromptDrafts } from '@/composables/chapter/useChapterVideoPromptDrafts'
import { useChapterVideoReferences } from '@/composables/chapter/useChapterVideoReferences'
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

const router = useRouter()

const selectedShot = computed(() => (
  props.state.activeVideoSb || props.state.sbs[0] || null
))

const selectedShotIndex = computed(() => (
  selectedShot.value ? props.state.sbs.findIndex(sb => sb.id === selectedShot.value.id) : -1
))

const selectedShotIndexLabel = computed(() => String(selectedShotIndex.value + 1).padStart(2, '0'))
const selectedShotKey = computed(() => storyboardStateKey(selectedShot.value, selectedShotIndex.value))
const selectedVideoHistory = computed(() => (
  selectedShot.value ? props.state.getVideoHistory(selectedShot.value.id) : []
))
const selectedVideoHistoryLoading = computed(() => (
  selectedShot.value ? props.state.isVideoHistoryLoading(selectedShot.value.id) : false
))
const selectedVideoUrl = computed(() => (
  selectedShot.value ? props.state.getVideoUrl(selectedShot.value) : ''
))
const isSelectedVideoPending = computed(() => (
  selectedShot.value
    ? shouldShowVideoPendingPlaceholder({
        pendingVideo: props.state.isPendingVideo(selectedShot.value.id),
        videoUrl: selectedVideoUrl.value,
      })
    : false
))

const {
  promptDraft,
  isPromptSaving,
  markPromptDraftDirty,
  savePromptDraft,
  applyDefaultPrompt,
} = useChapterVideoPromptDrafts({
  selectedShot,
  selectedShotKey,
  storyboards: () => props.state.sbs,
  buildDefaultPrompt: shot => props.state.buildDefaultVideoPrompt(shot),
  savePrompt: payload => props.handlers.handleShotFieldUpdate(payload),
  reportError: message => toast.error(message),
})

const {
  referenceMode,
  captureSourceVideoEl,
  isCapturingFrame,
  imageUploadInput,
  videoUploadInput,
  audioUploadInput,
  captureSourceVideoUrl,
  captureSourceLabel,
  tailFrameOptions,
  capturedFrameUrl,
  capturedFrameSourceLabel,
  selectedTailFrameUrl,
  activeFirstFrame,
  activeLastFrame,
  activeFirstFrameLabel,
  activeFirstFrameEmptyText,
  activeLastFrameLabel,
  activeLastFrameEmptyText,
  selectedReferenceImages,
  selectedReferenceVideos,
  selectedReferenceAudios,
  characterReferenceOptions,
  sceneReferenceOptions,
  multimodalImageReferences,
  multimodalImageUrls,
  multimodalVideoUrls,
  multimodalAudioUrls,
  referenceCountLabel,
  referenceModeGuidance,
  activeReferenceSummary,
  getReferenceSummary,
  hasReferencePreview,
  setReferenceMode,
  selectTailFrame,
  clearCapturedFrame,
  captureCurrentFrame,
  removeReference,
  toggleReferenceImage,
  isReferenceSelected,
  isUploadingMedia,
  uploadReferenceFiles,
} = useChapterVideoReferences({
  selectedShot,
  selectedShotIndex,
  selectedShotIndexLabel,
  selectedShotKey,
  storyboards: () => props.state.sbs,
  characters: () => props.state.chars || props.state.visualChars || [],
  scenes: () => props.state.scenes || [],
  getFirstFrame: shot => String(props.state.getFirstFrame(shot) || ''),
  getLastFrame: shot => String(props.state.getLastFrame(shot) || ''),
  getDefaultReferenceSummary: shot => props.state.getVideoReferenceSummary(shot),
  hasImage: shot => props.state.hasImg(shot),
  upload: uploadAPI,
  notify: toast,
})

const selectedVideoEl = ref(null)

watch(
  () => selectedShot.value?.id || 0,
  (id) => {
    if (id) void props.state.loadVideoHistory(id)
  },
  { immediate: true },
)

const videoGenerationProgress = computed(() => {
  if (!props.state.sbs.length) return 0
  return Math.round((props.state.shotVidCount / props.state.sbs.length) * 100)
})

const pendingCount = computed(() => (
  props.state.sbs.filter(sb => props.state.isPendingVideo(sb.id)).length
))

const emptyBillingInfo = {
  generationId: 0,
  status: '',
  billedSeconds: '0.00',
  billingAmount: '0.00',
  message: '',
}

const selectedBillingInfo = computed(() => {
  if (!selectedShot.value || typeof props.state.videoBillingInfo !== 'function') return emptyBillingInfo
  return props.state.videoBillingInfo(selectedShot.value.id) || emptyBillingInfo
})

const selectedBillingVisible = computed(() => {
  const info = selectedBillingInfo.value
  return Boolean(
    info.status ||
    Number(info.billingAmount || 0) > 0 ||
    Number(info.billedSeconds || 0) > 0,
  )
})

const billingStatusLabel = computed(() => {
  const status = selectedBillingInfo.value.status
  if (status === 'settled') return '视频费用已结算'
  if (status === 'billing_required') return selectedBillingInfo.value.message || '余额不足，请充值后继续结算'
  if (status === 'billing_failed') return selectedBillingInfo.value.message || '结算失败'
  return '视频费用结算中'
})

const billingToneClass = computed(() => {
  const status = selectedBillingInfo.value.status
  if (status === 'settled') return 'is-settled'
  if (status === 'billing_required') return 'is-warning'
  if (status === 'billing_failed') return 'is-error'
  return 'is-pending'
})

const billingAmountLabel = computed(() => {
  const value = Number(selectedBillingInfo.value.billingAmount || 0)
  return Number.isFinite(value) ? value.toFixed(2) : '0.00'
})

function selectShot(sb) {
  props.handlers.handleShotSelection(sb)
}

function goWallet() {
  router.push('/wallet')
}

function retrySelectedBilling() {
  if (!selectedShot.value) return
  props.handlers.retryVideoBilling(selectedShot.value.id)
}

async function generateSelectedVideo() {
  if (!selectedShot.value) return
  const saved = await savePromptDraft()
  if (!saved) return
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
    reference_image_bindings: multimodalImageReferences.value,
    reference_video_bindings: selectedReferenceVideos.value,
    reference_audio_bindings: selectedReferenceAudios.value,
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

function onResultBoxClick(event) {
  if (event.target !== event.currentTarget) return
  const video = selectedVideoEl.value
  if (!video) return
  if (video.paused) {
    video.play().catch(() => {})
  } else {
    video.pause()
  }
}

</script>

<style>
@import url('@/assets/production-shot-frames.css');
</style>
