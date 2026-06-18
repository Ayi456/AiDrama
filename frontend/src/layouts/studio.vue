<template>
  <div class="studio-fullscreen">
    <slot />
  </div>
</template>

<style scoped>
.studio-fullscreen { height: 100vh; display: flex; flex-direction: column; overflow: hidden; background: var(--bg-base); }

@media (max-width: 860px) {
  .studio-fullscreen {
    display: block;
    height: 100dvh;
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
}
</style>
