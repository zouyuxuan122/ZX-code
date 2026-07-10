import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'

const { settingsGetMock, settingsSetMock, weatherFetchMock } = vi.hoisted(() => ({
  settingsGetMock: vi.fn().mockResolvedValue(null),
  settingsSetMock: vi.fn().mockResolvedValue(undefined),
  weatherFetchMock: vi.fn(),
}))

vi.mock('@/services/ipc', () => ({
  ipc: {
    settings: {
      get: settingsGetMock,
      set: settingsSetMock,
    },
    weather: {
      fetch: weatherFetchMock,
    },
  },
}))

import { WeatherPanel } from '@/components/grid/panels/WeatherPanel'

describe('WeatherPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    settingsGetMock.mockResolvedValue(null)
    weatherFetchMock.mockResolvedValue({
      ok: true,
      data: { temp: '25', desc: '晴', humidity: '60', city: '北京' },
    })
  })

  it('加载并显示天气信息', async () => {
    render(<WeatherPanel />)
    await waitFor(() => {
      expect(screen.getByTestId('weather-temp')).toHaveTextContent('25°')
      expect(screen.getByTestId('weather-desc')).toHaveTextContent('晴')
      expect(screen.getByTestId('weather-city')).toHaveTextContent('北京')
    })
  })

  it('显示湿度', async () => {
    render(<WeatherPanel />)
    await waitFor(() => {
      expect(screen.getByTestId('weather-humidity')).toHaveTextContent('60%')
    })
  })

  it('加载失败时显示错误提示和重试按钮', async () => {
    weatherFetchMock.mockResolvedValue({ ok: false, error: 'HTTP 404' })
    render(<WeatherPanel />)
    await waitFor(() => {
      expect(screen.getByText(/加载失败/)).toBeInTheDocument()
      expect(screen.getByText('重试')).toBeInTheDocument()
    })
  })

  it('点击城市名进入编辑模式，输入新城市后保存', async () => {
    weatherFetchMock.mockResolvedValue({
      ok: true,
      data: { temp: '30', desc: '多云', humidity: '70', city: '上海' },
    })
    render(<WeatherPanel />)
    await waitFor(() => expect(screen.getByTestId('weather-city')).toBeInTheDocument())

    // 点击城市名进入编辑
    await act(async () => {
      fireEvent.click(screen.getByTestId('weather-city'))
    })

    // 输入新城市
    const input = screen.getByPlaceholderText('输入城市名') as HTMLInputElement
    expect(input).toBeInTheDocument()
    await act(async () => {
      fireEvent.change(input, { target: { value: '上海' } })
    })

    // 点击确认按钮保存
    // 找到 Check 图标按钮（在编辑模式中）
    const buttons = document.querySelectorAll('button')
    const checkBtn = Array.from(buttons).find((b) => b.querySelector('svg.lucide-check'))
    expect(checkBtn).toBeTruthy()

    await act(async () => {
      fireEvent.click(checkBtn!)
    })

    // 应调用 settings.set 持久化城市
    await waitFor(() => {
      expect(settingsSetMock).toHaveBeenCalledWith('weather.city', '上海', 'weather')
    })
    // 应重新加载天气
    expect(weatherFetchMock).toHaveBeenCalledWith('上海')
  })

  it('按 Enter 键保存城市', async () => {
    render(<WeatherPanel />)
    await waitFor(() => expect(screen.getByTestId('weather-city')).toBeInTheDocument())

    await act(async () => {
      fireEvent.click(screen.getByTestId('weather-city'))
    })

    const input = screen.getByPlaceholderText('输入城市名') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { value: '广州' } })
      fireEvent.keyDown(input, { key: 'Enter' })
    })

    await waitFor(() => {
      expect(settingsSetMock).toHaveBeenCalledWith('weather.city', '广州', 'weather')
    })
  })

  it('按 Escape 键取消编辑', async () => {
    render(<WeatherPanel />)
    await waitFor(() => expect(screen.getByTestId('weather-city')).toBeInTheDocument())

    await act(async () => {
      fireEvent.click(screen.getByTestId('weather-city'))
    })

    const input = screen.getByPlaceholderText('输入城市名')
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Escape' })
    })

    // 应退出编辑模式，恢复城市显示
    expect(screen.getByTestId('weather-city')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('输入城市名')).not.toBeInTheDocument()
  })
})
