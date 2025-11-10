const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5001;

app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from Borealis Hub API' });
});

// GET /api/aurora?lat=..&lon=..
app.get('/api/aurora', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ ok: false, error: 'Invalid lat/lon' });
  }

  try {
    // NOAA OVATION latest grid
    const noaaUrl = 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json';
    const noaaResp = await fetch(noaaUrl, { headers: { 'Accept': 'application/json' } });
    if (!noaaResp.ok) throw new Error(`NOAA fetch failed: ${noaaResp.status}`);
    const noaa = await noaaResp.json();

    const coords = Array.isArray(noaa.coordinates) ? noaa.coordinates : [];
    if (!coords.length) throw new Error('NOAA data missing coordinates');

    // Find nearest grid point to requested lat/lon
    let nearest = null;
    let bestDist = Infinity;
    for (const triple of coords) {
      const [gLon, gLat, value] = triple;
      const dLat = gLat - lat;
      const dLon = gLon - lon;
      const dist2 = dLat * dLat + dLon * dLon;
      if (dist2 < bestDist) {
        bestDist = dist2;
        nearest = { lat: gLat, lon: gLon, value };
      }
    }

    let probability = nearest ? Number(nearest.value) : NaN;
    if (!Number.isFinite(probability)) throw new Error('NOAA value not numeric');
    probability = Math.max(0, Math.min(100, Math.round(probability)));

    const observationTime = noaa['Observation Time'] || null;
    const forecastTime = noaa['Forecast Time'] || null;

    // Optional: cloud cover via Open-Meteo (closest hour, local timezone)
    let cloudCover = null;
    let cloudStatus = 'N/D';
    let dark = null; // { isNight, sunrise, sunset }
    let visibility = null; // 0..100 adjusted by clouds and night
    try {
      const omUrl = new URL('https://api.open-meteo.com/v1/forecast');
      omUrl.searchParams.set('latitude', String(lat));
      omUrl.searchParams.set('longitude', String(lon));
      omUrl.searchParams.set('hourly', 'cloudcover');
      omUrl.searchParams.set('daily', 'sunrise,sunset');
      omUrl.searchParams.set('timezone', 'auto');
      const omResp = await fetch(omUrl);
      if (omResp.ok) {
        const om = await omResp.json();
        const times = om?.hourly?.time || [];
        const values = om?.hourly?.cloudcover || [];
        if (Array.isArray(times) && Array.isArray(values) && times.length === values.length && times.length) {
          const now = new Date();
          // Use nearest hour by absolute diff (times include tz offset)
          let idx = 0, bestDiff = Infinity;
          for (let i = 0; i < times.length; i++) {
            const diff = Math.abs(new Date(times[i]).getTime() - now.getTime());
            if (diff < bestDiff) { bestDiff = diff; idx = i; }
          }
          cloudCover = Math.max(0, Math.min(100, Math.round(values[idx])));
          cloudStatus = cloudCover <= 40 ? 'Visibile' : 'Coperto';
        }

        // Day/night from today's sunrise/sunset (local tz, returned with offset)
        const sunriseStr = om?.daily?.sunrise?.[0] || null;
        const sunsetStr = om?.daily?.sunset?.[0] || null;
        const sr = sunriseStr ? new Date(sunriseStr) : null;
        const ss = sunsetStr ? new Date(sunsetStr) : null;
        let isNight = null;
        if (sr && ss) {
          isNight = (new Date()) < sr || (new Date()) > ss;
        } else if (!sr && ss) {
          // polar night (no sunrise)
          isNight = true;
        } else if (sr && !ss) {
          // polar day (no sunset)
          isNight = false;
        }
        dark = { isNight, sunrise: sunriseStr, sunset: sunsetStr };
        if (Number.isFinite(probability)) {
          const nightFactor = isNight === false ? 0 : 1; // 0 if day, 1 if night/unknown
          const cloudFactor = cloudCover == null ? 1 : (1 - cloudCover / 100);
          visibility = Math.round(Math.max(0, Math.min(1, nightFactor * cloudFactor)) * probability);
        }
      }
    } catch (e) {
      // ignore cloud errors but keep primary data
    }

    // Current Kp index (planetary) from NOAA SWPC
    let kp = null;
    let kpSource = null;
    try {
      // Fallback: NOAA 1-minute planetary Kp
      const kpResp = await fetch('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json');
      if (kpResp.ok) {
        const kpData = await kpResp.json();
        if (Array.isArray(kpData) && kpData.length) {
          const latest = kpData[kpData.length - 1];
          // Prefer estimated_kp (decimal string like "1,67") then kp_index
          const estRaw = (latest?.estimated_kp ?? '').toString().replace(',', '.');
          let v = Number(estRaw);
          if (!Number.isFinite(v)) v = Number(latest?.kp_index);
          if (Number.isFinite(v)) { kp = Math.round(v * 10) / 10; kpSource = 'NOAA Planetary Kp (1m, estimated)'; }
        }
      }
    } catch (e) {
      // ignore Kp errors
    }

    res.json({
      ok: true,
      lat, lon,
      probability,
      timestamps: { observation: observationTime, forecast: forecastTime },
      source: 'NOAA OVATION (SWPC)',
      cloud: cloudCover == null ? null : { cover: cloudCover, status: cloudStatus },
      dark,
      visibility,
      kp: kp == null ? null : { value: kp, source: kpSource }
    });
  } catch (err) {
    res.status(502).json({ ok: false, error: String(err), message: 'Dati non disponibili, riprova' });
  }
});

// GET /api/spaceweather — basic solar wind summary (as shown by SWL)
app.get('/api/spaceweather', async (_req, res) => {
  try {
    // NOAA SWPC 5-minute datasets (public) provide same live values SWL displays
    const plasmaUrl = 'https://services.swpc.noaa.gov/products/solar-wind/plasma-5-minute.json';
    const magUrl = 'https://services.swpc.noaa.gov/products/solar-wind/mag-5-minute.json';

    const [plasmaResp, magResp] = await Promise.all([fetch(plasmaUrl), fetch(magUrl)]);
    if (!plasmaResp.ok || !magResp.ok) throw new Error('Space weather fetch failed');
    const plasma = await plasmaResp.json();
    const mag = await magResp.json();

    const pLast = Array.isArray(plasma) && plasma.length > 1 ? plasma[plasma.length - 1] : null; // [time, density, speed, temperature]
    const mLast = Array.isArray(mag) && mag.length > 1 ? mag[mag.length - 1] : null; // [time, bx, by, bz, lon, lat, bt]
    if (!pLast || !mLast) throw new Error('Space weather data unavailable');

    const out = {
      ok: true,
      time: pLast[0] || mLast[0] || null,
      speed_km_s: Number(pLast[2]),
      density_p_cm3: Number(pLast[1]),
      temperature_K: Number(pLast[3]),
      bz_nT: Number(mLast[3]),
      bt_nT: Number(mLast[6])
    };
    res.json(out);
  } catch (err) {
    res.status(502).json({ ok: false, error: String(err) });
  }
});

// Candidate aurora cities for default selection
const CITIES = [
  { name: 'TromsÃ¸, NO', lat: 69.6492, lon: 18.9553 },
  { name: 'ReykjavÃ­k, IS', lat: 64.1466, lon: -21.9426 },
  { name: 'Fairbanks, US', lat: 64.8378, lon: -147.7164 },
  { name: 'Yellowknife, CA', lat: 62.4540, lon: -114.3718 },
  { name: 'Rovaniemi, FI', lat: 66.5039, lon: 25.7294 },
  { name: 'Abisko, SE', lat: 68.3538, lon: 18.8300 },
  { name: 'Kiruna, SE', lat: 67.8558, lon: 20.2253 },
  { name: 'Murmansk, RU', lat: 68.9585, lon: 33.0827 },
  { name: 'Ivalo, FI', lat: 68.6531, lon: 27.5399 },
  { name: 'Nuuk, GL', lat: 64.1814, lon: -51.6941 },
  { name: 'Akureyri, IS', lat: 65.6885, lon: -18.1262 },
  { name: 'Nome, US', lat: 64.5011, lon: -165.4064 }
];

app.listen(PORT, () => {
  console.log(`API server listening at http://localhost:${PORT}`);
});
