import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import type { MemoryRecallService } from './memory-recall.service'

interface FileChange {
  path: string
  status: 'modified' | 'added' | 'deleted'
}

/**
 * 潜意识服务
 * 扫描工作区变更(git diff 优先,mtime 降级),生成摘要,写入记忆树 subconscious 分区
 */
export class SubconsciousService {
  private baseline = new Map<string, number>() // path → mtime
  private initialized = false

  constructor(private recallService: MemoryRecallService) {}

  /**
   * 扫描工作区变更
   * 优先用 git diff,降级为 mtime 对比
   */
  async scanWorkspaceChanges(workspacePath: string): Promise<FileChange[]> {
    if (!fs.existsSync(workspacePath)) return []

    // 尝试 git diff
    const gitChanges = this.tryGitDiff(workspacePath)
    if (gitChanges !== null) return gitChanges

    // 降级:mtime 对比
    return this.scanByMtime(workspacePath)
  }

  /**
   * 运行一次完整同步:扫描 → 摘要 → 写入记忆
   *
   * 首次运行仅建立基线,不处理变更(避免首次扫描将所有文件误报为"新增")
   */
  async runSync(workspacePath: string): Promise<void> {
    // 首次运行:建立基线后直接返回,不写入变更记忆
    if (!this.initialized) {
      this.buildBaseline(workspacePath)
      this.initialized = true
      return
    }

    const changes = await this.scanWorkspaceChanges(workspacePath)

    if (changes.length === 0) {
      return
    }

    // 生成摘要
    const summary = this.generateSummary(workspacePath, changes)

    // 写入记忆树 subconscious 分区
    this.recallService.createNode({
      partition: 'subconscious',
      title: `工作区变更 ${new Date().toLocaleString('zh-CN')}`,
      content: summary,
      tags: ['auto-sync', 'workspace'],
    })

    // 更新基线
    this.buildBaseline(workspacePath)
  }

  /** 尝试用 git diff 获取变更 */
  private tryGitDiff(workspacePath: string): FileChange[] | null {
    try {
      const output = execSync('git status --porcelain', {
        cwd: workspacePath,
        encoding: 'utf-8',
        timeout: 5000,
      })

      const changes: FileChange[] = []
      for (const line of output.split('\n').filter((l) => l.trim())) {
        const status = line[0]
        const filePath = line.slice(3).trim().replace(/"/g, '')

        let changeStatus: FileChange['status']
        if (status === 'M') changeStatus = 'modified'
        else if (status === 'A' || status === '?') changeStatus = 'added'
        else if (status === 'D') changeStatus = 'deleted'
        else continue

        changes.push({ path: filePath, status: changeStatus })
      }
      return changes
    } catch {
      return null // 不是 git 仓库或 git 不可用
    }
  }

  /** 用 mtime 对比扫描变更 */
  private scanByMtime(workspacePath: string): FileChange[] {
    const changes: FileChange[] = []
    const currentFiles = this.collectFiles(workspacePath)

    for (const [filePath, mtime] of currentFiles) {
      const baselineMtime = this.baseline.get(filePath)
      if (baselineMtime === undefined) {
        changes.push({ path: filePath, status: 'added' })
      } else if (mtime > baselineMtime) {
        changes.push({ path: filePath, status: 'modified' })
      }
    }

    // 检查删除的文件
    for (const [filePath] of this.baseline) {
      if (!currentFiles.has(filePath)) {
        changes.push({ path: filePath, status: 'deleted' })
      }
    }

    return changes
  }

  /** 收集目录下所有文件(path → mtime) */
  private collectFiles(dir: string, relativePath = ''): Map<string, number> {
    const files = new Map<string, number>()

    if (!fs.existsSync(dir)) return files

    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      // 跳过 node_modules, .git, dist
      if (['node_modules', '.git', 'dist', '.next', 'build'].includes(entry.name)) continue

      const fullPath = path.join(dir, entry.name)
      const relPath = relativePath ? path.join(relativePath, entry.name) : entry.name

      if (entry.isDirectory()) {
        const sub = this.collectFiles(fullPath, relPath)
        for (const [p, m] of sub) files.set(p, m)
      } else {
        try {
          const stat = fs.statSync(fullPath)
          files.set(relPath, stat.mtimeMs)
        } catch {
          // 忽略无法 stat 的文件
        }
      }
    }
    return files
  }

  /** 建立基线 */
  private buildBaseline(workspacePath: string): void {
    this.baseline = this.collectFiles(workspacePath)
  }

  /** 生成变更摘要 */
  private generateSummary(workspacePath: string, changes: FileChange[]): string {
    const added = changes.filter((c) => c.status === 'added')
    const modified = changes.filter((c) => c.status === 'modified')
    const deleted = changes.filter((c) => c.status === 'deleted')

    const lines: string[] = [
      `工作区 ${path.basename(workspacePath)} 检测到 ${changes.length} 个文件变更:`,
      '',
    ]

    if (added.length > 0) {
      lines.push(`新增文件 (${added.length}):`)
      added.slice(0, 10).forEach((c) => lines.push(`  + ${c.path}`))
      if (added.length > 10) lines.push(`  ... 等 ${added.length} 个`)
    }

    if (modified.length > 0) {
      lines.push(`修改文件 (${modified.length}):`)
      modified.slice(0, 10).forEach((c) => lines.push(`  ~ ${c.path}`))
      if (modified.length > 10) lines.push(`  ... 等 ${modified.length} 个`)
    }

    if (deleted.length > 0) {
      lines.push(`删除文件 (${deleted.length}):`)
      deleted.slice(0, 10).forEach((c) => lines.push(`  - ${c.path}`))
      if (deleted.length > 10) lines.push(`  ... 等 ${deleted.length} 个`)
    }

    return lines.join('\n')
  }
}
