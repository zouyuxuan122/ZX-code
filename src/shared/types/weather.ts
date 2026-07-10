/** wttr.in 天气 API 响应（简化版） */
export interface WeatherData {
  temp: string
  desc: string
  humidity: string
  city: string
}

export interface WeatherApi {
  /** 代理天气请求（绕过 renderer CSP 限制） */
  fetch: (city: string) => Promise<{ ok: true; data: WeatherData } | { ok: false; error: string }>
}
