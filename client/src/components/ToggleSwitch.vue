<script setup>
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  label: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue'])
function toggle() { emit('update:modelValue', !props.modelValue) }
</script>

<template>
  <button class="toggle" :aria-pressed="modelValue" @click="toggle">
    <span class="knob" :class="{ on: modelValue }"></span>
    <span class="tlabel" v-if="label">{{ label }}</span>
  </button>
</template>

<style src="../styles/ToggleSwitch.scss" lang="scss" scoped></style>
