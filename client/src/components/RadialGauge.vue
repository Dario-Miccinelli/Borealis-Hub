<script setup>
import { computed } from 'vue'

const props = defineProps({
  value: { type: Number, default: 0 }, // 0..100 (ring progress)
  size: { type: Number, default: 240 },
  stroke: { type: Number, default: 16 },
  label: { type: String, default: '' },
  kpiValue: { type: [Number, String], default: null }, // e.g., Kp index
  kpiLabel: { type: String, default: 'Kp index' },
  primaryText: { type: String, default: null },
  secondaryText: { type: String, default: null }
})

const radius = computed(() => (props.size - props.stroke) / 2)
const circumference = computed(() => 2 * Math.PI * radius.value)
const progress = computed(() => Math.max(0, Math.min(100, props.value)))
const dashOffset = computed(() => circumference.value * (1 - progress.value / 100))

const color = computed(() => {
  const v = progress.value
  if (v >= 100) return '#22c55e'
  if (v >= 80) return '#16a34a'
  if (v >= 50) return '#f59e0b'
  return '#ef4444'
})
</script>

<template>
  <div class="gauge" :style="{ width: size + 'px', height: size + 'px' }">
    <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`" role="img" aria-label="Gauge">
      <circle
        class="track"
        :cx="size/2" :cy="size/2" :r="radius"
        :stroke-width="stroke"
      />
      <circle
        class="bar"
        :cx="size/2" :cy="size/2" :r="radius"
        :stroke-width="stroke"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="dashOffset"
        :style="{ stroke: color }"
      />
    </svg>
    <div class="center">
      <div class="value">{{ primaryText ?? (Math.round(progress) + '%') }}</div>
      <div v-if="secondaryText" class="kpi">{{ secondaryText }}</div>
      <div v-else-if="kpiValue != null" class="kpi">Kp {{ kpiValue }}</div>
      <div v-if="label" class="label">{{ label }}</div>
    </div>
  </div>
  
</template>

<style scoped>
.gauge { position: relative; display: inline-block }
svg { transform: rotate(-90deg); display: block }
.track { fill: none; stroke: #e5e7eb }
.bar { fill: none; stroke-linecap: round; transition: stroke-dashoffset .4s ease, stroke .2s ease }
.center { position: absolute; inset: 0; display: grid; place-items: center; text-align: center }
.value { font-size: 2.1rem; font-weight: 800; line-height: 1.1 }
.label { margin-top: .15rem; color: #6b7280; font-size: .8rem }
</style>
