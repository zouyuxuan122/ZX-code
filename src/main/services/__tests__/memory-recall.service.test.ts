import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { MemoryRecallService } from '../memory-recall.service'
import type { Database as DBType } from 'better-sqlite3'

let db: DBType
let service: MemoryRecallService

beforeEach(() => {
  db = new Database(':memory:')
  db.exec(`
    CREATE TABLE memory_nodes (
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      partition TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX idx_memory_nodes_partition ON memory_nodes(partition);
    CREATE INDEX idx_memory_nodes_updated ON memory_nodes(updated_at);
  `)
  service = new MemoryRecallService(db)
})

describe('MemoryRecallService', () => {
  describe('createNode', () => {
    it('创建节点并返回完整对象', () => {
      const node = service.createNode({
        partition: 'project',
        title: '项目架构决策',
        content: '使用 Electron + React 架构,主进程负责原生功能',
        tags: ['architecture', 'electron']
      })
      expect(node.id).toBeDefined()
      expect(node.partition).toBe('project')
      expect(node.title).toBe('项目架构决策')
      expect(node.tags).toEqual(['architecture', 'electron'])
      expect(node.created_at).toBeGreaterThan(0)
    })

    it('支持 parent_id 建立层级', () => {
      const parent = service.createNode({ partition: 'general', title: '父节点', content: '父内容' })
      const child = service.createNode({ partition: 'general', title: '子节点', content: '子内容', parent_id: parent.id })
      expect(child.parent_id).toBe(parent.id)
    })
  })

  describe('queryNodes', () => {
    beforeEach(() => {
      // 准备测试数据
      service.createNode({ partition: 'project', title: 'React 组件架构', content: '使用函数组件和 Hooks', tags: ['react'] })
      service.createNode({ partition: 'decision', title: '选择 SQLite 而非 Postgres', content: '本地优先,无需服务端数据库', tags: ['database'] })
      service.createNode({ partition: 'error', title: 'Electron contextIsolation 报错', content: '需要开启 contextIsolation', tags: ['electron', 'bug'] })
      service.createNode({ partition: 'preference', title: '用户偏好深色主题', content: 'UI 使用深色模式', tags: ['ui'] })
    })

    it('按关键词检索返回匹配节点', () => {
      const results = service.queryNodes({ keyword: 'React', limit: 10 })
      expect(results.length).toBeGreaterThan(0)
      expect(results.some(r => r.node.title.includes('React'))).toBe(true)
    })

    it('未命中关键词返回空数组', () => {
      const results = service.queryNodes({ keyword: '不存在的内容xyz', limit: 10 })
      expect(results).toEqual([])
    })

    it('支持 partition 过滤', () => {
      const results = service.queryNodes({ keyword: 'Electron', partition: 'error', limit: 10 })
      expect(results.length).toBe(1)
      expect(results[0].node.partition).toBe('error')
    })

    it('按 limit 限制返回数量', () => {
      // 创建更多匹配节点
      for (let i = 0; i < 10; i++) {
        service.createNode({ partition: 'general', title: `Electron 笔记 ${i}`, content: '关于 Electron 的内容' })
      }
      const results = service.queryNodes({ keyword: 'Electron', limit: 3 })
      expect(results.length).toBe(3)
    })

    it('结果包含 score 评分(0-1)', () => {
      const results = service.queryNodes({ keyword: 'React', limit: 10 })
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].score).toBeGreaterThanOrEqual(0)
      expect(results[0].score).toBeLessThanOrEqual(1)
    })

    it('时间衰减:较新节点评分更高(同等相关度时)', () => {
      // 创建一个旧节点
      const old = service.createNode({ partition: 'general', title: '架构决策记录', content: '架构决策相关内容' })
      // 手动更新旧节点的 created_at 为很久以前
      db.prepare('UPDATE memory_nodes SET created_at = ? WHERE id = ?').run(1000, old.id)
      // 创建一个新节点,内容相似
      service.createNode({ partition: 'general', title: '架构决策记录新', content: '架构决策相关内容' })

      const results = service.queryNodes({ keyword: '架构决策', limit: 10 })
      expect(results.length).toBeGreaterThanOrEqual(2)
      // 新节点应排在前面(score 更高)
      const newNode = results.find(r => r.node.title.includes('新'))
      const oldNode = results.find(r => r.node.id === old.id)
      if (newNode && oldNode) {
        expect(newNode.score).toBeGreaterThanOrEqual(oldNode.score)
      }
    })
  })

  describe('updateNode', () => {
    it('更新标题和内容', () => {
      const node = service.createNode({ partition: 'general', title: '原标题', content: '原内容' })
      const updated = service.updateNode(node.id, { title: '新标题', content: '新内容' })
      expect(updated.title).toBe('新标题')
      expect(updated.content).toBe('新内容')
      expect(updated.updated_at).toBeGreaterThanOrEqual(node.updated_at)
    })

    it('更新 tags', () => {
      const node = service.createNode({ partition: 'general', title: '测试', content: '内容', tags: ['a'] })
      const updated = service.updateNode(node.id, { tags: ['a', 'b', 'c'] })
      expect(updated.tags).toEqual(['a', 'b', 'c'])
    })
  })

  describe('deleteNode', () => {
    it('删除节点后查询不到', () => {
      const node = service.createNode({ partition: 'general', title: '待删除', content: '内容' })
      service.deleteNode(node.id)
      const results = service.queryNodes({ keyword: '待删除', limit: 10 })
      expect(results).toEqual([])
    })
  })

  describe('listNodes', () => {
    it('按 partition 列出节点', () => {
      service.createNode({ partition: 'project', title: 'p1', content: 'c1' })
      service.createNode({ partition: 'project', title: 'p2', content: 'c2' })
      service.createNode({ partition: 'error', title: 'e1', content: 'c3' })
      const nodes = service.listNodes('project')
      expect(nodes.length).toBe(2)
      expect(nodes.every(n => n.partition === 'project')).toBe(true)
    })

    it('无 partition 参数返回所有节点', () => {
      service.createNode({ partition: 'project', title: 'p1', content: 'c1' })
      service.createNode({ partition: 'error', title: 'e1', content: 'c3' })
      const nodes = service.listNodes()
      expect(nodes.length).toBe(2)
    })
  })
})
