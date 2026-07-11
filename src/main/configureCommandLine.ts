/**
 * 应用命令行开关配置
 *
 * 必须在 app.whenReady() 之前调用。
 * 这些开关影响 Chromium 内核初始化，无法在 ready 后设置。
 */
import { app } from 'electron'

/**
 * 配置 Chromium 命令行开关。
 *
 * 必须在 app.whenReady() 之前调用，否则开关不生效。
 *
 * 当前开关：
 * - autoplay-policy=no-user-gesture-required
 *   允许在没有用户手势的情况下播放音频。
 *   TTS 语音合成是异步的（IPC → WebSocket → 写文件 → 播放），
 *   调用 audio.play() 时用户手势已失效，默认策略会静默阻止播放。
 */
export function configureCommandLine(): void {
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
}
