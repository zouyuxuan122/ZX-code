import { create } from 'zustand'
import type { TtsSynthesizeResponse } from '@shared/types/ipc'
import { toAppAssetUrl } from '@/utils/appAsset'
import { ipc } from '@/services/ipc'

/**
 * TTS（文本转语音）Store
 *
 * 管理语音播放状态：
 * - 正在播放的消息 ID
 * - 合成错误
 * - Audio 元素引用
 *
 * 被 MessageItem（主页面）和 ChatPanel（九宫格）共用。
 *
 * 播放方案：主进程将音频写入临时文件，返回 filePath，
 * 渲染进程用 app-asset:// 协议加载播放。
 * app-asset 已注册为 privileged（bypassCSP + supportFetchAPI），
 * 可绕过 sandbox 对 file:// 的安全限制。
 */

interface TtsState {
  /** 正在播放的消息 ID */
  playingMessageId: string | null
  /** 是否正在播放 */
  isPlaying: boolean
  /** 合成/播放错误信息 */
  error: string | null
  /** 当前 Audio 元素 */
  audioElement: HTMLAudioElement | null
  /** 当前正在合成的消息 ID（loading 状态） */
  loadingMessageId: string | null
  /** 当前音频临时文件路径（播放完毕后需调用 cleanupAudio 清理） */
  audioFilePath: string | null
}

interface TtsActions {
  /** 朗读指定消息的文本 */
  speak: (messageId: string, text: string, options?: {
    voice?: string
    rate?: number
    volume?: number
    format?: 'mp3' | 'wav'
    cloneVoiceId?: string
  }) => Promise<void>
  /** 停止播放 */
  stop: () => void
  /** 重置状态（切换对话时调用） */
  reset: () => void
}

/** 清理旧 Audio 元素和临时文件 */
function cleanupAudio(audioElement: HTMLAudioElement | null, audioFilePath: string | null): void {
  if (audioElement) {
    audioElement.pause()
    audioElement.src = ''
  }
  if (audioFilePath) {
    // 异步清理临时文件，不阻塞 UI
    ipc.tts.cleanupAudio(audioFilePath).catch(() => { /* 忽略清理错误 */ })
  }
}

export const useTtsStore = create<TtsState & TtsActions>((set, get) => ({
  playingMessageId: null,
  isPlaying: false,
  error: null,
  audioElement: null,
  loadingMessageId: null,
  audioFilePath: null,

  speak: async (messageId, text, options) => {
    // 空文本不处理
    if (!text.trim()) return

    // 停止当前播放并清理旧资源
    const { audioElement: oldAudio, audioFilePath: oldPath } = get()
    cleanupAudio(oldAudio, oldPath)

    set({ loadingMessageId: messageId, error: null, audioFilePath: null, audioElement: null })

    try {
      const response: TtsSynthesizeResponse = await ipc.tts.synthesize(text, options)

      if (!response.ok || !response.filePath) {
        set({
          loadingMessageId: null,
          playingMessageId: null,
          isPlaying: false,
          error: response.error || 'TTS 合成失败',
        })
        return
      }

      // 使用 app-asset:// 协议加载临时音频文件
      // app-asset 已注册为 privileged（bypassCSP + supportFetchAPI），
      // 可绕过 sandbox 对 file:// 的安全限制
      const audioUrl = toAppAssetUrl(response.filePath)
      const audio = new Audio(audioUrl)

      audio.onended = () => {
        cleanupAudio(audio, response.filePath!)
        set({
          playingMessageId: null,
          isPlaying: false,
          audioElement: null,
          loadingMessageId: null,
          audioFilePath: null,
        })
      }

      audio.onerror = () => {
        cleanupAudio(audio, response.filePath!)
        set({
          playingMessageId: null,
          isPlaying: false,
          audioElement: null,
          loadingMessageId: null,
          audioFilePath: null,
          error: '音频播放失败',
        })
      }

      set({
        audioElement: audio,
        playingMessageId: messageId,
        isPlaying: true,
        loadingMessageId: null,
        audioFilePath: response.filePath,
      })

      await audio.play()
    } catch (err) {
      set({
        loadingMessageId: null,
        playingMessageId: null,
        isPlaying: false,
        error: (err as Error).message || 'TTS 合成异常',
      })
    }
  },

  stop: () => {
    const { audioElement, audioFilePath } = get()
    cleanupAudio(audioElement, audioFilePath)
    set({
      playingMessageId: null,
      isPlaying: false,
      audioElement: null,
      loadingMessageId: null,
      audioFilePath: null,
    })
  },

  reset: () => {
    const { audioElement, audioFilePath } = get()
    cleanupAudio(audioElement, audioFilePath)
    set({
      playingMessageId: null,
      isPlaying: false,
      error: null,
      audioElement: null,
      loadingMessageId: null,
      audioFilePath: null,
    })
  },
}))
