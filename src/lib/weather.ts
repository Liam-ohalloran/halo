// Perth weather from Open-Meteo (no key, nothing private is sent). Used by the Home tab.

export interface Weather {
  /** Degrees C, rounded. */
  temp: number
  /** Plain words, e.g. "Showers". */
  desc: string
  /** Highest chance of rain in the next six hours, 0 to 100. */
  chance: number
  /** Chance of rain for each of the next six hours, 0 to 1. */
  hours: number[]
}

const URL_PERTH = 'https://api.open-meteo.com/v1/forecast?latitude=-31.95&longitude=115.86&current=temperature_2m,weather_code&hourly=precipitation_probability&timezone=Australia%2FPerth&forecast_days=2'

/** WMO weather codes, in words short enough for a tile. */
export function describe(code: number): string {
  if (code === 0) return 'Clear'
  if (code <= 2) return 'Mostly fine'
  if (code === 3) return 'Cloudy'
  if (code === 45 || code === 48) return 'Fog'
  if (code >= 51 && code <= 57) return 'Drizzle'
  if (code >= 61 && code <= 67) return 'Rain'
  if (code >= 80 && code <= 82) return 'Showers'
  if (code >= 95) return 'Storms'
  return 'Fine'
}

interface Raw { current?: { time: string; temperature_2m: number; weather_code: number }; hourly?: { time: string[]; precipitation_probability: (number | null)[] } }

/** Pure, so it can be tested: turn Open-Meteo's answer into what the tile shows. */
export function parseWeather(raw: Raw): Weather | null {
  const c = raw.current
  const hr = raw.hourly
  if (!c || !hr) return null
  const from = Math.max(0, hr.time.findIndex((t) => t >= c.time.slice(0, 13)))
  const hours = hr.precipitation_probability.slice(from, from + 6).map((p) => Math.min(1, Math.max(0, (p ?? 0) / 100)))
  while (hours.length < 6) hours.push(0)
  return { temp: Math.round(c.temperature_2m), desc: describe(c.weather_code), chance: Math.round(Math.max(...hours) * 100), hours }
}

export async function fetchPerthWeather(): Promise<Weather | null> {
  try {
    const res = await fetch(URL_PERTH)
    if (!res.ok) return null
    return parseWeather((await res.json()) as Raw)
  } catch {
    return null
  }
}
