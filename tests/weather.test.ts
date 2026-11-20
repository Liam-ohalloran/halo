import test from 'node:test'
import assert from 'node:assert/strict'
import { describe, parseWeather } from '../src/lib/weather.ts'

test('describe turns weather codes into short words', () => {
  assert.equal(describe(0), 'Clear')
  assert.equal(describe(3), 'Cloudy')
  assert.equal(describe(81), 'Showers')
  assert.equal(describe(96), 'Storms')
})

test('parseWeather reads the next six hours from the current hour', () => {
  const hourly = { time: ['2026-11-21T09:00', '2026-11-21T10:00', '2026-11-21T11:00', '2026-11-21T12:00', '2026-11-21T13:00', '2026-11-21T14:00', '2026-11-21T15:00', '2026-11-21T16:00'], precipitation_probability: [0, 10, 40, 90, 70, 20, 0, 0] }
  const w = parseWeather({ current: { time: '2026-11-21T10:15', temperature_2m: 25.6, weather_code: 80 }, hourly })
  assert.equal(w?.temp, 26)
  assert.equal(w?.desc, 'Showers')
  assert.equal(w?.chance, 90)
  assert.deepEqual(w?.hours, [0.1, 0.4, 0.9, 0.7, 0.2, 0])
})

test('parseWeather answers null when the data is missing', () => {
  assert.equal(parseWeather({}), null)
})
