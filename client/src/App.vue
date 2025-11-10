<script setup>
import { ref, onMounted, computed, watch, onBeforeUnmount } from "vue"
import RadialGauge from "./components/RadialGauge.vue"
import Sparkline from "./components/Sparkline.vue"
import ToggleSwitch from "./components/ToggleSwitch.vue"

const lat = ref("")
const lon = ref("")
const city = ref("")
const suggestions = ref([])
const loading = ref(false)
const error = ref("")
const probability = ref(null)
const visibility = ref(null)
const cloud = ref(null)
const cloudSeries = ref([])
const kp = ref(null)
const space = ref(null)
const yr = ref(null)
const source = ref("")
const timestamp = ref("")
const dark = ref(null)

const lastUpdated = computed(() => (timestamp.value ? fmtTime(timestamp.value) : ""))
const isDark = ref(false)
const autoRefresh = ref(false)
const refreshMs = ref(300000)
let refreshTimer = null

function fmtTime(iso) {
  if (!iso) return ""
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

async function fetchAurora() {
  error.value = ""
  probability.value = null
  cloud.value = null
  source.value = ""
  timestamp.value = ""
  const latNum = parseFloat(lat.value)
  const lonNum = parseFloat(lon.value)
  if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
    error.value = "Enter valid coordinates"
    return
  }
  loading.value = true
  try {
    const r = await fetch(`/api/aurora?lat=${encodeURIComponent(latNum)}&lon=${encodeURIComponent(lonNum)}`)
    const data = await r.json()
    if (!data.ok) throw new Error(data.message || "API error")
    probability.value = data.probability
    cloud.value = data.cloud
    visibility.value = data.visibility ?? null
    dark.value = data.dark ?? null
    kp.value = data.kp
    source.value = data.source
    timestamp.value = data.timestamps?.forecast || data.timestamps?.observation || ""
    fetchCloudSeries(latNum, lonNum)
    fetchSpace()
    fetchYr(latNum, lonNum)
  } catch (e) {
    error.value = "Data not available, try again"
  } finally {
    loading.value = false
  }
}

function geolocate() {
  error.value = ""
  if (!("geolocation" in navigator)) {
    error.value = "Geolocation unavailable. Enter manually."
    return
  }
  loading.value = true
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      lat.value = pos.coords.latitude.toFixed(4)
      lon.value = pos.coords.longitude.toFixed(4)
      city.value = "My location"
      loading.value = false
      fetchAurora()
    },
    () => {
      error.value = "Permission denied. Enter manually."
      loading.value = false
    },
    { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
  )
}

onMounted(() => {
  const pref = localStorage.getItem("theme")
  if (pref === "dark" || (!pref && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
    isDark.value = true
    document.body.classList.add("dark")
  }
  city.value = "Tromso, NO"
  lat.value = "69.6492"
  lon.value = "18.9553"
  fetchAurora()
})

function toggleDark() {
  isDark.value = !isDark.value
  document.body.classList.toggle("dark", isDark.value)
  localStorage.setItem("theme", isDark.value ? "dark" : "light")
}

async function searchCity() {
  suggestions.value = []
  if (!city.value || city.value.length < 2) return
  try {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search")
    url.searchParams.set("name", city.value)
    url.searchParams.set("count", "5")
    url.searchParams.set("language", "en")
    const r = await fetch(url)
    if (!r.ok) return
    const data = await r.json()
    suggestions.value = (data?.results || []).map((x) => ({
      name: x.name,
      country: x.country_code,
      admin: x.admin1 || "",
      lat: x.latitude,
      lon: x.longitude,
    }))
  } catch {}
}

function pickSuggestion(s) {
  lat.value = s.lat.toFixed(4)
  lon.value = s.lon.toFixed(4)
  city.value = `${s.name}, ${s.country}`
  suggestions.value = []
  fetchAurora()
}

async function applyCityEnter() {
  if (suggestions.value.length) {
    pickSuggestion(suggestions.value[0])
    return
  }
  if (!city.value || city.value.length < 2) return
  try {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search")
    url.searchParams.set("name", city.value)
    url.searchParams.set("count", "1")
    url.searchParams.set("language", "en")
    const r = await fetch(url)
    if (!r.ok) return
    const data = await r.json()
    const s = (data?.results || [])[0]
    if (s) pickSuggestion({ name: s.name, country: s.country_code, lat: s.latitude, lon: s.longitude })
  } catch {}
}

onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})

watch(autoRefresh, (v) => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
  if (v) {
    refreshTimer = setInterval(() => fetchAurora(), refreshMs.value)
  }
})

watch([lat, lon], () => {
  const la = parseFloat(lat.value)
  const lo = parseFloat(lon.value)
  if (Number.isFinite(la) && Number.isFinite(lo)) fetchCloudSeries(la, lo)
})

async function fetchCloudSeries(la, lo) {
  cloudSeries.value = []
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast")
    url.searchParams.set("latitude", String(la))
    url.searchParams.set("longitude", String(lo))
    url.searchParams.set("hourly", "cloudcover")
    url.searchParams.set("forecast_days", "1")
    url.searchParams.set("timezone", "auto")
    const rr = await fetch(url)
    if (!rr.ok) return
    const dj = await rr.json()
    const vals = dj?.hourly?.cloudcover || []
    cloudSeries.value = vals.slice(0, 12).map((v) => 100 - Math.max(0, Math.min(100, v)))
  } catch {}
}

async function fetchSpace() {
  try {
    const r = await fetch("/api/spaceweather")
    const j = await r.json()
    if (j && j.ok) space.value = j
  } catch {}
}

async function fetchYr(la, lo) {
  try {
    const r = await fetch(`/api/yr?lat=${encodeURIComponent(la)}&lon=${encodeURIComponent(lo)}`)
    const j = await r.json()
    if (j && j.ok) yr.value = j
  } catch {}
}

// Clouds widget: use Yr.no cloud cover (precise), no fallback
const cloudPctPrecise = computed(() => {
  const v = yr.value?.cloud_area_fraction_percent
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null
})

const cloudStatus = computed(() => {
  if (cloudPctPrecise.value == null) return null
  return cloudPctPrecise.value <= 40 ? 'Clear' : 'Cloudy'
})
</script>

<template>
  <div class="page-bg"></div>
  <main class="page">
    <header class="topbar">
      <div class="brand">
        <span class="dot"></span>
        <h1>Borealis Hub</h1>
        <span class="subtitle">Local aurora snapshot</span>
      </div>
      <div class="actions">
        <div class="city">
          <input v-model="city" @input="searchCity" @keydown.enter.prevent="applyCityEnter" placeholder="Search city (e.g. Tromso)" />
          <div v-if="suggestions.length" class="dropdown">
            <button v-for="s in suggestions" :key="s.name + s.lat" @click="pickSuggestion(s)">
              {{ s.name }}<span class="muted">, {{ s.admin || s.country }}</span>
            </button>
          </div>
        </div>
        <div class="chips">
          <button class="chip" @click="pickSuggestion({name:'Tromso', country:'NO', lat:69.6492, lon:18.9553})">Tromso</button>
          <button class="chip" @click="pickSuggestion({name:'Reykjavik', country:'IS', lat:64.1466, lon:-21.9426})">Reykjavik</button>
          <button class="chip" @click="pickSuggestion({name:'Fairbanks', country:'US', lat:64.8378, lon:-147.7164})">Fairbanks</button>
          <button class="chip" @click="pickSuggestion({name:'Yellowknife', country:'CA', lat:62.4540, lon:-114.3718})">Yellowknife</button>
        </div>
        <button class="ghost" @click="geolocate" :disabled="loading" title="Use current location">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 10v10"/><path d="M12 2v2"/><path d="M2 12h2"/><path d="M20 12h2"/><circle cx="12" cy="12" r="6"/></svg>
          Use current location
        </button>
        <button class="ghost" @click="toggleDark" :aria-pressed="isDark" title="Toggle dark mode">
          <svg v-if="!isDark" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
          <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          {{ isDark ? 'Light' : 'Dark' }}
        </button>
        <ToggleSwitch v-model="autoRefresh" label="Auto refresh" />
        <button class="primary" @click="fetchAurora" :disabled="loading">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9"/><path d="M21 3v6h-6"/></svg>
          Refresh
        </button>
      </div>
    </header>

    <section class="metrics">
      <div class="metric">
        <div class="m-title">Probability</div>
        <div class="m-value">{{ probability !== null ? probability + '%' : 'N/A' }}</div>
      </div>
      <div class="metric">
        <div class="m-title">Visibility</div>
        <div class="m-value">{{ visibility !== null ? visibility + '%' : 'N/A' }}</div>
      </div>
      <div class="metric">
        <div class="m-title">Kp now (global)</div>
        <div class="m-value">{{ kp?.value ?? 'N/A' }}</div>
      </div>
      <div class="metric" v-if="space">
        <div class="m-title">Solar wind</div>
        <div class="m-value">{{ Math.round(space.speed_km_s) }} km/s, Bz {{ space.bz_nT.toFixed(1) }} nT</div>
      </div>
    </section>

    <section class="content">
      <article class="card highlight">
        <div class="card-head">
          <div class="title">Aurora</div>
          <span v-if="lastUpdated" class="muted">Updated: {{ lastUpdated }}</span>
        </div>
        <div class="centerbox">
          <div v-if="loading" class="spinner" aria-label="Loading"></div>
          <RadialGauge v-else-if="probability !== null" :value="probability" :size="300" label="Probability now" />
          <div v-if="visibility !== null" class="muted" style="margin-top:.6rem">Visibility (clouds + night): {{ visibility }}%</div>
          <div v-else class="nd">N/A</div>
        </div>
      </article>

      <article class="card">
        <div class="card-head">
          <div class="title">Clouds</div>
        </div>
        <div class="cloudbox">
          <div class="status" :class="cloudStatus === 'Clear' ? 'ok' : 'warn'">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a7 7 0 0 0-6.8 5.3A5 5 0 0 0 5 18h11a5 5 0 0 0 1-9.9A7 7 0 0 0 12 2Z"/></svg>
            <span>{{ cloudStatus ?? 'N/A' }}</span>
          </div>
          <div class="bar" v-if="cloudPctPrecise != null">
            <div class="fill" :style="{ width: (cloudPctPrecise || 0) + '%' }"></div>
          </div>
          <div class="muted" v-if="cloudPctPrecise != null">Cloud cover: {{ cloudPctPrecise.toFixed(1) }}%</div>
          <Sparkline v-if="cloudSeries.length" :data="cloudSeries" :width="260" :height="64" label="Next 12h clearer skies" />
          <div class="muted">{{ dark?.isNight === false ? 'Daylight now' : 'Nighttime' }}</div>
          <div class="muted" v-if="cloudPctPrecise == null">N/A</div>
        </div>
      </article>

      <article class="card">
        <div class="card-head">
          <div class="title">Weather (yr.no)</div>
        </div>
        <ul class="meta">
          <li v-if="yr"><strong>Temp:</strong> {{ yr.temperature_c?.toFixed?.(1) ?? 'N/A' }} Â°C</li>
          <li v-if="yr"><strong>Wind:</strong> {{ yr.wind_speed_mps?.toFixed?.(1) ?? 'N/A' }} m/s</li>
          <li v-if="yr"><strong>Clouds:</strong> {{ yr.cloud_area_fraction_percent ?? 'N/A' }}%</li>
          <li v-if="yr && yr.precipitation_mm != null"><strong>Precip (next):</strong> {{ yr.precipitation_mm }} mm</li>
          <li v-if="yr && yr.updated_at"><strong>Updated:</strong> <span class="muted">{{ fmtTime(yr.updated_at) }}</span></li>
          <li v-if="!yr"><span class="muted">N/A</span></li>
        </ul>
        <div class="links">
          <a href="https://developer.yr.no/" target="_blank">Yr.no API</a>
        </div>
      </article>

      <article class="card">
        <div class="card-head">
          <div class="title">Source</div>
        </div>
        <ul class="meta">
          <li><strong>Model:</strong> NOAA OVATION (SWPC)</li>
          <li><strong>Coordinates:</strong> {{ lat || 'â€”' }}, {{ lon || 'â€”' }}</li>
          <li><strong>Timestamp:</strong> <span class="muted">{{ lastUpdated || 'N/A' }}</span></li>
          <li v-if="kp"><strong>Kp (global):</strong> {{ kp.value }}</li>
          <li v-if="space"><strong>Solar wind:</strong> {{ Math.round(space.speed_km_s) }} km/s, Bz {{ space.bz_nT.toFixed(1) }} nT, Np {{ space.density_p_cm3.toFixed(1) }} cm3</li>
        </ul>
        <div class="links">
          <a href="https://services.swpc.noaa.gov/json/ovation_aurora_latest.json" target="_blank">NOAA feed</a>
          <span>Â·</span>
          <a href="https://open-meteo.com/" target="_blank">Open-Meteo</a>
          <span>Â·</span>
          <a href="https://www.spaceweatherlive.com/" target="_blank">SpaceWeatherLive</a>
        </div>
      </article>
    </section>

    <p v-if="error" class="error">{{ error }}</p>
  </main>

</template>

<style src="./styles/App.scss" lang="scss" scoped></style>
