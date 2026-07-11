import { memo } from 'react'
import { Volume2, Square, Loader2 } from 'lucide-react'
import { useTtsStore } from '@/stores/ttsStore'
import { cn } from '@/utils/cn'

interface TtsButtonProps {
  /** 要朗读的消息 ID */
  messageId: string
  /** 要朗读的文本 */
  text: string
  /** 外部禁用（如流式中） */
  disabled?: boolean
  /** 尺寸 */
  size?: 'sm' | 'md'
  /** 朗读选项（透传给 ttsStore.speak） */
  options?: {
    voice?: string
    rate?: number
    volume?: number
    format?: 'mp3' | 'wav'
    cloneVoiceId?: string
  }
  className?: string
}

/**
 * TTS 语音按钮 — 可复用组件
 *
 * 状态：
 * - 空闲：显示 Volume2 图标，aria-label="朗读"
 * - 合成中：显示 Loader2 旋转，aria-label="合成中"
 * - 播放中：显示 Square 停止图标，aria-label="停止朗读"，点击停止
 *
 * 被 MessageItem（主页面）和 ChatPanel（九宫格）共用。
 */
export const TtsButton = memo(function TtsButton({
  messageId,
  text,
  disabled = false,
  size = 'sm',
  options,
  className,
}: TtsButtonProps) {
  const speak = useTtsStore((s) => s.speak)
  const stop = useTtsStore((s) => s.stop)
  const playingMessageId = useTtsStore((s) => s.playingMessageId)
  const loadingMessageId = useTtsStore((s) => s.loadingMessageId)

  const isThisLoading = loadingMessageId === messageId
  const isThisPlaying = playingMessageId === messageId && !isThisLoading
  const isEmpty = !text.trim()
  const isDisabled = disabled || isEmpty

  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'

  const handleClick = () => {
    if (isDisabled) return
    if (isThisPlaying) {
      stop()
    } else if (!isThisLoading) {
      void speak(messageId, text, options)
    }
  }

  const ariaLabel = isThisLoading ? '合成中' : isThisPlaying ? '停止朗读' : '朗读'

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isDisabled}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={cn(
        'flex items-center gap-1 rounded-md border border-border-default bg-bg-tertiary px-2 py-1 text-[10px] transition-smooth-fast',
        isThisPlaying
          ? 'text-accent-blue hover:border-accent-blue/50 hover:bg-accent-blue/10'
          : 'text-text-secondary hover:border-accent-blue/50 hover:bg-accent-blue/10 hover:text-accent-blue',
        isDisabled && 'cursor-not-allowed opacity-40',
        className,
      )}
    >
      {isThisLoading ? (
        <Loader2 className={cn(iconSize, 'animate-spin')} />
      ) : isThisPlaying ? (
        <Square className={cn(iconSize, 'fill-current')} />
      ) : (
        <Volume2 className={iconSize} />
      )}
      {size === 'md' && <span>{ariaLabel}</span>}
    </button>
  )
})
