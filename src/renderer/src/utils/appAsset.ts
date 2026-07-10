/**
 * 将本地路径转换为 Electron 渲染进程可加载的 app-asset:// URL。
 * app-asset 协议在 src/main/index.ts 中注册，可绕过沙箱对 file:// 的安全限制。
 *
 * 处理以下场景：
 * - http(s)/app-asset/data URL：原样返回
 * - Windows 绝对路径（C:/... 或 C:\...）：转换为 app-asset:///C:/...
 * - Unix 绝对路径（/...）：转换为 app-asset:///...
 * - 相对路径（如 models/live2d/fense/fense.model3.json）：
 *   生产环境（file:// 加载）解析为 app-asset:// URL；
 *   开发环境（http://localhost）解析为 http URL（由 Vite dev server 提供）。
 */
export function toAppAssetUrl(p: string): string {
  if (/^(https?:|app-asset:|data:)/i.test(p)) return p
  const normalized = p.replace(/\\/g, '/')
  // Windows 绝对路径 C:/...
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return 'app-asset:///' + encodeURI(normalized)
  }
  // Unix 绝对路径 /...
  if (normalized.startsWith('/')) {
    return 'app-asset://' + encodeURI(normalized)
  }
  // 相对路径：基于 window.location.href 解析为绝对 URL
  try {
    const resolved = new URL(normalized, window.location.href).toString()
    // 生产环境：file:///C:/path/... → app-asset:///C:/path/...
    if (resolved.startsWith('file:')) {
      return resolved.replace(/^file:/, 'app-asset:')
    }
    // 开发环境：http://localhost:5173/models/... 原样返回（Vite dev server 提供）
    return resolved
  } catch {
    return p
  }
}
