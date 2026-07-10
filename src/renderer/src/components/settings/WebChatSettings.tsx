import { memo, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useChat2ApiStore } from '@/stores/chat2apiStore'
import { cn } from '@/utils/cn'

const PROVIDER_LABELS: Record<string, string> = {
  deepseek: 'DeepSeek',
  glm: '智谱 GLM',
  kimi: 'Kimi (月之暗面)',
  mimo: '小米 MiMo',
  minimax: 'MiniMax',
  perplexity: 'Perplexity',
  qwen: '通义千问 (国内)',
  'qwen-ai': 'Qwen (国际)',
  zai: 'Z.ai',
}

const PROVIDER_ORDER = ['deepseek', 'glm', 'kimi', 'qwen', 'qwen-ai', 'minimax', 'mimo', 'perplexity', 'zai']

function ProviderCard({ providerId, providerName }: { providerId: string; providerName: string }) {
  const accounts = useChat2ApiStore((s) => s.accounts)
  const startInAppLogin = useChat2ApiStore((s) => s.startInAppLogin)
  const deleteAccount = useChat2ApiStore((s) => s.deleteAccount)
  const loginInProgress = useChat2ApiStore((s) => s.loginInProgress)
  const loginProviderId = useChat2ApiStore((s) => s.loginProviderId)
  const [loginSuccess, setLoginSuccess] = useState(false)

  const providerAccounts = accounts.filter((a) => a.providerId === providerId)
  const isLoggingIn = loginInProgress && loginProviderId === providerId

  const handleLogin = async () => {
    const ok = await startInAppLogin(providerId, providerId)
    if (ok) {
      setLoginSuccess(true)
      setTimeout(() => setLoginSuccess(false), 3000)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="surface-3d rounded-lg border border-border-default p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-text-primary">{providerName}</h3>
          {providerAccounts.length > 0 && (
            <span className="rounded-full bg-accent-green/15 px-2 py-0.5 text-[10px] font-medium text-accent-green">
              {providerAccounts.length} 个账户
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleLogin}
          disabled={isLoggingIn}
          className={cn(
            'btn-metallic inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium',
            isLoggingIn && 'opacity-50 cursor-not-allowed',
          )}
        >
          {isLoggingIn ? (
            <>
              <span className="animate-pulse-soft">●</span>
              <span>登录中...</span>
            </>
          ) : (
            <span>应用内登录</span>
          )}
        </button>
      </div>

      {loginSuccess && (
        <div className="mb-2 rounded-md border border-accent-green/30 bg-accent-green/10 px-3 py-1.5 text-xs text-accent-green">
          登录成功
        </div>
      )}

      <AnimatePresence>
        {providerAccounts.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-1.5 border-t border-border-default pt-2">
              {providerAccounts.map((account) => (
                <div key={account.id} className="flex items-center justify-between rounded-md bg-hover-surface px-2.5 py-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        account.status === 'active' ? 'bg-accent-green' : 'bg-accent-red',
                      )}
                    />
                    <span className="text-xs text-text-secondary">{account.name}</span>
                    {account.todayUsed != null && (
                      <span className="text-[10px] text-text-tertiary tabular-nums">
                        今日 {account.todayUsed} 次
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteAccount(account.id)}
                    className="text-[10px] text-text-tertiary transition-smooth-fast hover:text-accent-red"
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function ProxyStatusBar() {
  const proxyStatus = useChat2ApiStore((s) => s.proxyStatus)
  const loadProxyStatus = useChat2ApiStore((s) => s.loadProxyStatus)
  const restartProxy = useChat2ApiStore((s) => s.restartProxy)

  useEffect(() => {
    loadProxyStatus()
  }, [loadProxyStatus])

  if (!proxyStatus) return null

  return (
    <div className="surface-3d mb-4 flex items-center justify-between rounded-lg border border-border-default px-4 py-3">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'h-2 w-2 rounded-full',
            proxyStatus.running ? 'bg-accent-green animate-pulse-soft' : 'bg-accent-red',
          )}
        />
        <div>
          <div className="text-xs font-semibold text-text-primary">
            代理服务器 {proxyStatus.running ? '运行中' : '已停止'}
          </div>
          <div className="text-[10px] text-text-tertiary tabular-nums">
            {proxyStatus.host}:{proxyStatus.port}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => restartProxy()}
        className="btn-metallic inline-flex h-7 items-center rounded-md px-2.5 text-[11px] font-medium"
      >
        重启
      </button>
    </div>
  )
}

export const WebChatSettings = memo(function WebChatSettings() {
  const loadProviders = useChat2ApiStore((s) => s.loadProviders)
  const loadAccounts = useChat2ApiStore((s) => s.loadAccounts)
  const fetchModels = useChat2ApiStore((s) => s.fetchModels)
  const error = useChat2ApiStore((s) => s.error)
  const [syncing, setSyncing] = useState(false)
  const [syncCount, setSyncCount] = useState<number | null>(null)

  useEffect(() => {
    loadProviders()
    loadAccounts()
  }, [loadProviders, loadAccounts])

  const handleSyncModels = async () => {
    setSyncing(true)
    const count = await fetchModels()
    setSyncCount(count)
    setSyncing(false)
  }

  return (
    <div className="space-y-4">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-text-primary">网页大模型</h2>
        <p className="mt-1 text-xs text-text-secondary">
          通过内置代理引擎接入 DeepSeek、GLM、Kimi、Qwen、MiniMax 等网页版大模型。登录账户后即可在对话中直接使用。
        </p>
      </div>

      <ProxyStatusBar />

      {error && (
        <div className="rounded-md border border-accent-red/30 bg-accent-red/10 px-3 py-2 text-xs text-accent-red">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">供应商账户</h3>
        <button
          type="button"
          onClick={handleSyncModels}
          disabled={syncing}
          className="btn-metallic inline-flex h-7 items-center rounded-md px-2.5 text-[11px] font-medium"
        >
          {syncing ? '同步中...' : '同步模型列表'}
        </button>
      </div>

      {syncCount !== null && syncCount > 0 && (
        <div className="rounded-md border border-accent-green/30 bg-accent-green/10 px-3 py-2 text-xs text-accent-green">
          已同步 {syncCount} 个网页模型，可在对话页模型选择器中使用
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {PROVIDER_ORDER.map((pid) => (
          <ProviderCard key={pid} providerId={pid} providerName={PROVIDER_LABELS[pid] || pid} />
        ))}
      </div>
    </div>
  )
})
