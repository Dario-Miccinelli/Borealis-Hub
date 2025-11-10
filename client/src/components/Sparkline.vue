<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  data: { type: Array, default: () => [] }, // numbers 0..100
  width: { type: Number, default: 260 },
  height: { type: Number, default: 60 },
  stroke: { type: String, default: 'url(#g)' },
  fill: { type: String, default: 'none' },
  smooth: { type: Boolean, default: true },
  tooltip: { type: Boolean, default: true },
  label: { type: String, default: 'Next hours' }
})

const points = computed(() => {
  const d = props.data || []
  const n = d.length || 1
  const w = props.width
  const h = props.height
  const pad = 4
  const xstep = (w - pad * 2) / Math.max(1, n - 1)
  const clamp = (v) => Math.max(0, Math.min(100, Number(v) || 0))
  return d.map((v, i) => [pad + i * xstep, h - pad - (clamp(v) / 100) * (h - pad * 2)])
})

const path = computed(() => {
  const p = points.value
  if (p.length <= 1) return ''
  if (!props.smooth) return 'M ' + p.map(([x, y]) => `${x},${y}`).join(' L ')
  // Catmull-Rom to Bezier
  const d = ['M', p[0][0], p[0][1]].join(' ')
  let seg = d
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(0, i - 1)]
    const p1 = p[i]
    const p2 = p[i + 1]
    const p3 = p[Math.min(p.length - 1, i + 2)]
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6
    seg += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`
  }
  return seg
})

const hoverX = ref(null)
const hoverIdx = ref(null)

function onMove(e) {
  if (!props.tooltip || !points.value.length) return
  const rect = e.currentTarget.getBoundingClientRect()
  const x = e.clientX - rect.left
  hoverX.value = Math.max(0, Math.min(props.width, x))
  const p = points.value
  let idx = 0
  let best = Infinity
  for (let i = 0; i < p.length; i++) {
    const d = Math.abs(p[i][0] - hoverX.value)
    if (d < best) { best = d; idx = i }
  }
  hoverIdx.value = idx
}
function onLeave() { hoverX.value = null; hoverIdx.value = null }
</script>

<template>
  <div class="sparkline" :style="{ width: width + 'px' }">
    <svg :width="width" :height="height" @mousemove="onMove" @mouseleave="onLeave" role="img" :aria-label="label">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#0ea5e9"/>
          <stop offset="100%" stop-color="#22c55e"/>
        </linearGradient>
      </defs>
      <path :d="path" :stroke="stroke" fill="none" stroke-width="2" />
      <template v-if="hoverIdx != null">
        <line :x1="points[hoverIdx][0]" y1="0" :x2="points[hoverIdx][0]" :y2="height" stroke="#94a3b8" stroke-dasharray="2,3" />
        <circle :cx="points[hoverIdx][0]" :cy="points[hoverIdx][1]" r="3" fill="#22c55e" stroke="#fff" />
      </template>
    </svg>
    <div class="legend">
      <span class="label">{{ label }}</span>
      <span class="value" v-if="hoverIdx != null">{{ Math.round((data[hoverIdx] ?? 0)) }}%</span>
    </div>
  </div>
</template>

<style src="../styles/Sparkline.scss" lang="scss" scoped></style>
