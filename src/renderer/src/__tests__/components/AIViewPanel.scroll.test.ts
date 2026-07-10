import { describe, it, expect } from 'vitest'
import { computeScrollSignature } from '../../components/grid/panels/AIViewPanel'
import type { WorkEntry } from '../../components/grid/panels/AIViewPanel'

function makeEntry(overrides: Partial<WorkEntry> = {}): WorkEntry {
  return {
    id: 'entry-1',
    type: 'tool',
    title: '测试条目',
    timestamp: 1000,
    ...overrides,
  }
}

describe('AIViewPanel — computeScrollSignature', () => {
  it('条目状态变化时签名应变化（running → completed）', () => {
    const running = [makeEntry({ id: 'tc-1', status: 'running', detail: '/a.ts' })]
    const completed = [makeEntry({ id: 'tc-1', status: 'completed', detail: '/a.ts' })]

    const sigA = computeScrollSignature(running)
    const sigB = computeScrollSignature(completed)

    expect(sigA).not.toBe(sigB)
  })

  it('条目 detail 变化时签名应变化（参数增量追加）', () => {
    const before = [makeEntry({ id: 'tc-1', status: 'running', detail: '$ npm run' })]
    const after = [makeEntry({ id: 'tc-1', status: 'running', detail: '$ npm run build' })]

    expect(computeScrollSignature(before)).not.toBe(computeScrollSignature(after))
  })

  it('条目数量不变但内容变化时签名应变化（列表满 30 条场景）', () => {
    // 模拟 MAX_ENTRIES=30 满列表：最后一个条目状态变化
    const entries: WorkEntry[] = Array.from({ length: 30 }, (_, i) =>
      makeEntry({ id: `e-${i}`, status: 'running', detail: `file-${i}.ts`, timestamp: i }),
    )
    const sigA = computeScrollSignature(entries)

    // 最后一个条目完成
    const updated = [...entries.slice(0, 29), { ...entries[29], status: 'completed' as const }]
    const sigB = computeScrollSignature(updated)

    expect(sigA).not.toBe(sigB)
  })

  it('相同条目签名应相同（幂等）', () => {
    const entries = [
      makeEntry({ id: 'a', status: 'running', detail: 'x' }),
      makeEntry({ id: 'b', status: 'completed', detail: 'y' }),
    ]
    expect(computeScrollSignature(entries)).toBe(computeScrollSignature([...entries]))
  })

  it('空列表签名应定义', () => {
    expect(computeScrollSignature([]).length).toBeGreaterThanOrEqual(0)
  })
})
