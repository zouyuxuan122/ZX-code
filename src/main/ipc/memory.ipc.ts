import { ipcMain } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { MemoryRecallService } from '../services/memory-recall.service'
import { getDb } from '../database'
import type {
  CreateMemoryNodeDto,
  UpdateMemoryNodeDto,
  RecallQuery,
  ObsidianExportOptions,
  ObsidianExportResult,
  MemoryNode,
} from '@shared/types/memory'

/**
 * 记忆相关 IPC handler
 *
 * 注册通道：
 * - memory:list / memory:search / memory:get / memory:create / memory:update / memory:delete
 * - memory:stats
 * - memory:exportObsidian
 *
 * @param service 可选注入，用于测试；默认从全局 DB 构造
 */
export function registerMemoryIpc(service?: MemoryRecallService): void {
  const svc = service ?? new MemoryRecallService(getDb())

  ipcMain.handle('memory:list', (_event, partition?: string) => {
    return svc.listNodes(partition as MemoryNode['partition'] | undefined)
  })

  ipcMain.handle('memory:search', (_event, query: RecallQuery) => {
    return svc.queryNodes(query)
  })

  ipcMain.handle('memory:get', (_event, id: string) => {
    return svc.getNode(id)
  })

  ipcMain.handle('memory:create', (_event, dto: CreateMemoryNodeDto) => {
    return svc.createNode(dto)
  })

  ipcMain.handle('memory:update', (_event, id: string, dto: UpdateMemoryNodeDto) => {
    return svc.updateNode(id, dto)
  })

  ipcMain.handle('memory:delete', (_event, id: string) => {
    svc.deleteNode(id)
  })

  ipcMain.handle('memory:stats', () => {
    return svc.getStats()
  })

  ipcMain.handle(
    'memory:exportObsidian',
    (_event, options: ObsidianExportOptions): ObsidianExportResult => {
      return exportToObsidian(svc, options)
    },
  )
}

/**
 * 导出记忆节点为 Obsidian vault（Markdown + YAML frontmatter）
 */
function exportToObsidian(
  service: MemoryRecallService,
  options: ObsidianExportOptions,
): ObsidianExportResult {
  try {
    const nodes = service.listNodes()
    const filtered =
      options.includeSubconscious === false
        ? nodes.filter((n) => n.partition !== 'subconscious')
        : nodes

    fs.mkdirSync(options.outputPath, { recursive: true })

    for (const node of filtered) {
      // 按分区建子目录
      const partitionDir = path.join(options.outputPath, node.partition)
      fs.mkdirSync(partitionDir, { recursive: true })

      // 文件名：清理 title 中的非法字符
      const safeName = node.title.replace(/[<>:"/\\|?*]/g, '_').slice(0, 100)
      const filePath = path.join(partitionDir, `${safeName}.md`)

      // YAML frontmatter + content
      const frontmatter = [
        '---',
        `id: ${node.id}`,
        node.parent_id ? `parent: ${node.parent_id}` : null,
        `partition: ${node.partition}`,
        `created: ${new Date(node.created_at).toISOString()}`,
        `updated: ${new Date(node.updated_at).toISOString()}`,
        `tags: [${node.tags.join(', ')}]`,
        '---',
        '',
      ]
        .filter((line) => line !== null)
        .join('\n')

      const content = frontmatter + `# ${node.title}\n\n${node.content}\n`
      fs.writeFileSync(filePath, content, 'utf-8')
    }

    return { ok: true, exportedCount: filtered.length, outputPath: options.outputPath }
  } catch (err) {
    return {
      ok: false,
      exportedCount: 0,
      outputPath: options.outputPath,
      error: String(err),
    }
  }
}
