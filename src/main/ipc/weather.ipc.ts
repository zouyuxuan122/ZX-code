import { ipcMain } from 'electron'
import https from 'node:https'
import { logger } from '../services/logger.service'
import type { WeatherData } from '@shared/types/weather'

interface WttrResponse {
  current_condition?: Array<{
    temp_C?: string
    humidity?: string
    lang_zh?: Array<{ value?: string }>
    weatherDesc?: Array<{ value?: string }>
  }>
  nearest_area?: Array<{
    areaName?: Array<{ value?: string }>
  }>
}

export function registerWeatherIpc(): void {
  /**
   * 代理天气请求（绕过 renderer CSP 限制）
   * 使用 wttr.in 免费 API，无需 key
   */
  ipcMain.handle(
    'weather:fetch',
    async (_event, city: string): Promise<{ ok: true; data: WeatherData } | { ok: false; error: string }> => {
      const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1&lang=zh`
      return new Promise((resolve) => {
        const req = https.get(url, { timeout: 10000 }, (res) => {
          if (res.statusCode !== 200) {
            resolve({ ok: false, error: `HTTP ${res.statusCode}` })
            res.resume()
            return
          }
          let body = ''
          res.setEncoding('utf-8')
          res.on('data', (chunk) => { body += chunk })
          res.on('end', () => {
            try {
              const json = JSON.parse(body) as WttrResponse
              const cur = json.current_condition?.[0]
              if (!cur) {
                resolve({ ok: false, error: '无天气数据' })
                return
              }
              const data: WeatherData = {
                temp: cur.temp_C ?? '--',
                desc: cur.lang_zh?.[0]?.value ?? cur.weatherDesc?.[0]?.value ?? '--',
                humidity: cur.humidity ?? '--',
                city: json.nearest_area?.[0]?.areaName?.[0]?.value ?? city,
              }
              resolve({ ok: true, data })
            } catch (err) {
              resolve({ ok: false, error: `JSON 解析失败: ${(err as Error).message}` })
            }
          })
        })
        req.on('error', (err) => {
          logger.error(`天气请求失败: ${err.message}`)
          resolve({ ok: false, error: err.message })
        })
        req.on('timeout', () => {
          req.destroy()
          resolve({ ok: false, error: '请求超时' })
        })
      })
    },
  )
}
