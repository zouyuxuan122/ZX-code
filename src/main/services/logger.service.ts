import { app } from 'electron'
import path from 'path'
import fs from 'fs'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

let logLevel: LogLevel = 'info'
let logFile: fs.WriteStream | null = null

export function initLogger(level: LogLevel = 'info'): void {
  logLevel = level
  
  const logDir = path.join(app.getPath('userData'), 'logs')
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }
  
  const logPath = path.join(logDir, `zx-code-${new Date().toISOString().split('T')[0]}.log`)
  logFile = fs.createWriteStream(logPath, { flags: 'a' })
}

function formatMessage(level: LogLevel, msg: string, error?: Error): string {
  const timestamp = new Date().toISOString()
  const errorStr = error ? `\n  ${error.stack || error.message}` : ''
  return `[${timestamp}] [${level.toUpperCase()}] ${redactSensitive(msg)}${errorStr}`
}

/**
 * 脱敏日志中的敏感信息（API key、Bearer token、Cookie 等）
 * 防止凭证泄露到日志文件和开发者控制台
 */
function redactSensitive(msg: string): string {
  return msg
    // Bearer token: "Bearer sk-xxx" → "Bearer ***"
    .replace(/Bearer\s+[A-Za-z0-9\-_\.]+/g, 'Bearer ***')
    // URL 查询参数中的 key: "?key=AIza..." 或 "&key=xxx" → "key=***"
    .replace(/([?&])key=([^&\s\]]+)/g, '$1key=***')
    // x-api-key 头值: "x-api-key: sk-ant-xxx" → "x-api-key: ***"
    .replace(/x-api-key:\s*[^\s,}\]]+/gi, 'x-api-key: ***')
    // api_key 查询参数: "api_key=xxx" → "api_key=***"
    .replace(/api_key=([^&\s,}\]]+)/g, 'api_key=***')
    // Authorization 头值（非 Bearer）: "Authorization: Basic xxx" → "Authorization: ***"
    .replace(/Authorization:\s*(?!Bearer\s+\*\*\*)[^\s,}\]]+/gi, 'Authorization: ***')
}

function log(level: LogLevel, msg: string, error?: Error): void {
  if (LOG_LEVELS[level] < LOG_LEVELS[logLevel]) return
  
  const formatted = formatMessage(level, msg, error)
  
  const consoleMethod = level === 'debug' ? console.debug : level === 'warn' ? console.warn : level === 'error' ? console.error : console.info
  consoleMethod(formatted)
  
  if (logFile) {
    logFile.write(formatted + '\n')
  }
}

export const logger = {
  debug: (msg: string) => log('debug', msg),
  info: (msg: string) => log('info', msg),
  warn: (msg: string) => log('warn', msg),
  error: (msg: string, error?: Error) => log('error', msg, error),
  setLevel: (level: LogLevel) => { logLevel = level },
}
