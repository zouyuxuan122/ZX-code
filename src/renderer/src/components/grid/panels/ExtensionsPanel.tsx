import { useState, useEffect } from 'react'
import { ipc } from '@/services/ipc'
import type { McpServerConfig, McpServerStatus } from '@shared/types/mcp'
import type { SclExtension } from '@shared/types/scl'
import { cn } from '@/utils/cn'

type Tab = 'skill' | 'mcp'

export function ExtensionsPanel() {
  const [tab, setTab] = useState<Tab>('skill')
  const [skills, setSkills] = useState<SclExtension[]>([])
  const [servers, setServers] = useState<McpServerConfig[]>([])
  const [statuses, setStatuses] = useState<McpServerStatus[]>([])

  useEffect(() => {
    void ipc.scl.list().then(setSkills)
  }, [])

  useEffect(() => {
    if (tab !== 'mcp') return
    void Promise.all([ipc.mcp.listServers(), ipc.mcp.listStatus()]).then(([s, st]) => {
      setServers(s)
      setStatuses(st)
    })
  }, [tab])

  return (
    <div className="flex h-full flex-col bg-bg-primary">
      <div className="flex h-7 flex-shrink-0 border-b border-border-default/30">
        {(['skill', 'mcp'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 text-[11px] font-medium transition-colors',
              tab === t ? 'text-text-primary border-b border-accent-blue' : 'text-text-tertiary hover:text-text-secondary',
            )}
          >
            {t === 'skill' ? `Skill (${skills.length})` : 'MCP'}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-1">
        {tab === 'skill' &&
          skills.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-bg-secondary/40">
              <span className="text-base">{s.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] text-text-primary">{s.name}</div>
                <div className="truncate text-[10px] text-text-tertiary">{s.description}</div>
              </div>
              <span className={cn('h-1.5 w-1.5 rounded-full', s.enabled ? 'bg-state-success' : 'bg-text-tertiary/40')} />
            </div>
          ))}
        {tab === 'mcp' &&
          servers.map((srv) => {
            const st = statuses.find((x) => x.id === srv.id)
            return (
              <div key={srv.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-bg-secondary/40">
                <span className={cn('h-1.5 w-1.5 rounded-full', st?.connected ? 'bg-state-success' : 'bg-text-tertiary/40')} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] text-text-primary">{srv.name}</div>
                  <div className="text-[10px] text-text-tertiary">
                    {srv.type === 'local' ? '本地' : '远程'} · {st?.toolCount ?? 0} 工具
                  </div>
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )
}
