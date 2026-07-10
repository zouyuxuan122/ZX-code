// 主题切换工具：实现从点击位置圆形扩散的高级过渡动画
// 支持三种视觉风格 (apple / claude / base) 和明暗模式切换

/** 计算从点击点到屏幕四角的最大距离，作为圆形扩散的最终半径 */
function getMaxRadius(x: number, y: number): number {
  const w = window.innerWidth
  const h = window.innerHeight
  const corners = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: 0, y: h },
    { x: w, y: h },
  ]
  return Math.max(...corners.map((c) => Math.hypot(c.x - x, c.y - y)))
}

/**
 * 切换明暗主题，带圆形扩散动画
 * @param nextTheme 目标主题 'dark' | 'light'
 * @param originX 点击位置 X（相对视口），默认窗口中心
 * @param originY 点击位置 Y（相对视口），默认窗口中心
 */
export function switchThemeWithTransition(
  nextTheme: 'dark' | 'light',
  originX?: number,
  originY?: number,
): Promise<void> {
  return new Promise((resolve) => {
    const x = originX ?? window.innerWidth / 2
    const y = originY ?? window.innerHeight / 2
    const radius = getMaxRadius(x, y)

    const targetBg = nextTheme === 'dark' ? '#000000' : '#ffffff'

    const overlay = document.createElement('div')
    overlay.id = 'theme-transition-overlay'
    overlay.style.left = `${x - radius}px`
    overlay.style.top = `${y - radius}px`
    overlay.style.width = `${radius * 2}px`
    overlay.style.height = `${radius * 2}px`
    overlay.style.background = targetBg
    overlay.style.transform = 'scale(0)'
    document.body.appendChild(overlay)

    void overlay.offsetWidth

    overlay.style.transform = 'scale(1)'

    const cleanup = () => {
      document.documentElement.setAttribute('data-theme', nextTheme)
      requestAnimationFrame(() => {
        overlay.style.transition = 'opacity 200ms ease'
        overlay.style.opacity = '0'
        setTimeout(() => {
          overlay.remove()
          resolve()
        }, 200)
      })
    }

    setTimeout(cleanup, 600)
  })
}

/** 视觉风格类型 */
export type VisualStyle = 'apple' | 'claude' | 'base'

/** 视觉风格中文名映射 */
export const STYLE_LABELS: Record<VisualStyle, string> = {
  apple: '苹果风格',
  claude: 'Claude 风格',
  base: '经典风格',
}

/** 视觉风格描述 */
export const STYLE_DESCRIPTIONS: Record<VisualStyle, string> = {
  apple: '简洁毛玻璃、圆润边角、Apple HIG 设计语言',
  claude: '暖陶土色调、优雅衬线字体、Claude 设计语言',
  base: '白灰金属质感、立体层次、高对比度',
}

/** 切换视觉风格，带淡入淡出过渡 */
export function switchStyleWithTransition(
  nextStyle: VisualStyle,
): Promise<void> {
  return new Promise((resolve) => {
    const html = document.documentElement

    // 添加淡出效果
    html.style.opacity = '0'
    html.style.transition = 'opacity 200ms ease'

    setTimeout(() => {
      html.setAttribute('data-style', nextStyle)

      // 淡入
      requestAnimationFrame(() => {
        html.style.opacity = '1'
        setTimeout(() => {
          html.style.transition = ''
          resolve()
        }, 250)
      })
    }, 200)
  })
}

/** 初始化主题：从 settings 读取并应用 */
export function applyTheme(theme: 'dark' | 'light') {
  document.documentElement.setAttribute('data-theme', theme)
}

/** 应用视觉风格 */
export function applyStyle(style: VisualStyle) {
  document.documentElement.setAttribute('data-style', style)
}

/** 获取当前主题 */
export function getCurrentTheme(): 'dark' | 'light' {
  return (document.documentElement.getAttribute('data-theme') as 'dark' | 'light') || 'dark'
}

/** 获取当前视觉风格 */
export function getCurrentStyle(): VisualStyle {
  return (document.documentElement.getAttribute('data-style') as VisualStyle) || 'base'
}
