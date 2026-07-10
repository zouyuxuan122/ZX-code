import { useEffect, useMemo, useState } from 'react'
import { usePetStore } from '@/stores/petStore'
import { ModelRenderer } from './ModelRenderer'
import { PetSubtitles } from './PetSubtitles'

function getThemeGradient(): string {
  if (typeof document === 'undefined') {
    return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
  }
  const style = getComputedStyle(document.documentElement)
  const primary = style.getPropertyValue('--bg-primary').trim() || '#0a0a0a'
  const secondary = style.getPropertyValue('--bg-secondary').trim() || '#1c1c1c'
  // 多层叠加：顶部柔和光晕 + 主对角渐变（保留 primary/secondary 用于主题感知与测试兼容）+ 底部 vignette
  // 形成"浮起"的三维分层感，避免单一方向的直线构图
  return [
    'radial-gradient(ellipse 90% 55% at 50% 0%, rgba(255, 255, 255, 0.05) 0%, transparent 70%)',
    `linear-gradient(135deg, ${primary} 0%, ${secondary} 50%, ${primary} 100%)`,
    'radial-gradient(ellipse 100% 70% at 50% 100%, rgba(0, 0, 0, 0.25) 0%, transparent 65%)',
  ].join(', ')
}

function useThemeBackground() {
  const [themeBg, setThemeBg] = useState(() => getThemeGradient())

  useEffect(() => {
    setThemeBg(getThemeGradient())

    const observer = new MutationObserver(() => {
      setThemeBg(getThemeGradient())
    })

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-style'],
    })

    return () => observer.disconnect()
  }, [])

  return themeBg
}

/**
 * 宠物显示区域：自定义背景 + 宠物角色 + 字幕
 */
export function PetDisplay() {
  const backgroundType = usePetStore((s) => s.backgroundType)
  const backgroundValue = usePetStore((s) => s.backgroundValue)
  const bubbleText = usePetStore((s) => s.bubbleText)
  const bubbleVisible = usePetStore((s) => s.bubbleVisible)
  const subtitleEnabled = usePetStore((s) => s.character.subtitleEnabled)
  const subtitleStyle = usePetStore((s) => s.character.subtitleStyle)

  const themeBg = useThemeBackground()

  const containerStyle = useMemo(() => {
    switch (backgroundType) {
      case 'solid':
      case 'gradient':
        return { background: backgroundValue }
      case 'image':
        return {
          backgroundImage: `url("${backgroundValue}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }
      case 'theme':
      default:
        return { background: themeBg }
    }
  }, [backgroundType, backgroundValue, themeBg])

  return (
    <div
      data-testid="pet-display-container"
      className="relative flex flex-1 items-center justify-center overflow-hidden"
      style={containerStyle}
    >
      {/* 宠物角色 / 模型渲染 */}
      <ModelRenderer />

      {/* 字幕 */}
      {subtitleEnabled && (
        <PetSubtitles
          text={bubbleText ?? ''}
          visible={bubbleVisible}
          style={subtitleStyle}
        />
      )}
    </div>
  )
}
