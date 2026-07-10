import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, FolderOpen, Trash2, Check, Pencil, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useProjectStore } from '@/stores/projectStore'
import { ipc } from '@/services/ipc'
import { toast } from '@/stores/toastStore'
import type { UpdateProjectDto } from '@shared/types/project'
import { cn } from '@/utils/cn'

export default function ProjectsPage() {
  const navigate = useNavigate()
  const projects = useProjectStore((s) => s.projects)
  const currentProject = useProjectStore((s) => s.currentProject)
  const createProject = useProjectStore((s) => s.createProject)
  const updateProject = useProjectStore((s) => s.updateProject)
  const deleteProject = useProjectStore((s) => s.deleteProject)
  const switchProject = useProjectStore((s) => s.switchProject)
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [description, setDescription] = useState('')
  // 编辑模式相关状态
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')

  const handleSelectPath = async () => {
    const dir = await ipc.system.selectDirectory()
    if (dir) setPath(dir)
  }

  const handleCreate = async () => {
    if (!name.trim() || !path.trim()) return
    await createProject({
      name: name.trim(),
      workspace_path: path.trim(),
      description: description.trim() || undefined,
    })
    setName('')
    setPath('')
    setDescription('')
    setShowCreate(false)
  }

  // 进入编辑模式
  const handleStartEdit = (project: { id: string; name: string; description: string | null }) => {
    setEditingId(project.id)
    setEditName(project.name)
    setEditDescription(project.description ?? '')
  }

  // 取消编辑
  const handleCancelEdit = () => {
    setEditingId(null)
    setEditName('')
    setEditDescription('')
  }

  // 保存编辑
  const handleSaveEdit = async (id: string) => {
    if (!editName.trim()) return
    const data: UpdateProjectDto = {
      name: editName.trim(),
      description: editDescription.trim() || undefined,
    }
    try {
      await updateProject(id, data)
      toast.success('更新成功', '项目信息已保存')
      handleCancelEdit()
    } catch (err) {
      toast.error('更新失败', (err as Error).message)
    }
  }

  // 在文件管理器中打开工作区
  const handleOpenWorkspace = async (workspacePath: string) => {
    if (!workspacePath) {
      toast.warning('无法打开', '该项目未设置工作区路径')
      return
    }
    try {
      const result = await ipc.file.showInFolder(workspacePath)
      if (!result.ok) {
        toast.error('打开失败', result.error || '路径不存在')
      }
    } catch (err) {
      toast.error('打开失败', (err as Error).message)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 items-center gap-3 border-b border-border-default px-4 shadow-sm">
        <Button variant="ghost" size="icon" onClick={() => navigate('/chat')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-base font-semibold text-text-primary">项目管理</h1>
        <div className="ml-auto">
          <Button variant="primary" size="sm" onClick={() => setShowCreate(!showCreate)}>
            <Plus className="h-4 w-4" />
            新建项目
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-3xl">
          <AnimatePresence>
            {showCreate && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="surface-3d rounded-md p-4">
                  <h3 className="mb-3 text-sm font-semibold text-text-primary">新建项目</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs text-text-secondary">项目名称</label>
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="输入项目名称"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-text-secondary">工作区路径</label>
                      <div className="flex gap-2">
                        <Input
                          value={path}
                          onChange={(e) => setPath(e.target.value)}
                          placeholder="选择或输入工作区路径"
                          className="flex-1"
                        />
                        <Button variant="outline" size="md" onClick={handleSelectPath}>
                          <FolderOpen className="h-4 w-4" />
                          浏览
                        </Button>
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-text-secondary">描述（可选）</label>
                      <Input
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="项目描述"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="md" onClick={() => setShowCreate(false)}>
                        取消
                      </Button>
                      <Button
                        variant="primary"
                        size="md"
                        onClick={handleCreate}
                        disabled={!name.trim() || !path.trim()}
                      >
                        创建
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-2">
            {projects.length === 0 ? (
              <div className="rounded-md border border-dashed border-border-default p-8 text-center transition-smooth hover:border-border-strong">
                <FolderOpen className="mx-auto mb-2 h-8 w-8 animate-float text-text-tertiary" />
                <p className="text-sm text-text-tertiary">暂无项目，点击"新建项目"创建</p>
              </div>
            ) : (
              projects.map((project) => (
                <motion.div
                  key={project.id}
                  whileHover={{ y: -2 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className={cn(
                    'surface-3d rounded-md p-3',
                    currentProject?.id === project.id && 'border-accent-blue/50',
                  )}
                >
                  <AnimatePresence initial={false} mode="wait">
                    {editingId === project.id ? (
                      // 编辑模式：表单
                      <motion.div
                        key="edit"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-3">
                          <div>
                            <label className="mb-1 block text-xs text-text-secondary">项目名称</label>
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              placeholder="输入项目名称"
                              autoFocus
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-text-secondary">描述（可选）</label>
                            <Input
                              value={editDescription}
                              onChange={(e) => setEditDescription(e.target.value)}
                              placeholder="项目描述"
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="md" onClick={handleCancelEdit}>
                              <X className="h-3.5 w-3.5" />
                              取消
                            </Button>
                            <Button
                              variant="primary"
                              size="md"
                              onClick={() => handleSaveEdit(project.id)}
                              disabled={!editName.trim()}
                            >
                              <Check className="h-3.5 w-3.5" />
                              保存
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    ) : (
                      // 展示模式
                      <motion.div
                        key="view"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                        className="flex items-center gap-3 overflow-hidden"
                      >
                        <FolderOpen className="h-5 w-5 flex-shrink-0 text-text-secondary" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-text-primary">{project.name}</span>
                            {currentProject?.id === project.id && (
                              <span className="flex items-center gap-0.5 text-xs text-accent-blue">
                                <Check className="h-3 w-3" />
                                当前
                              </span>
                            )}
                          </div>
                          <div className="truncate text-xs text-text-tertiary">
                            {project.workspace_path}
                          </div>
                          <div className="mt-0.5 text-xs text-text-tertiary/70">
                            创建于 {new Date(project.created_at).toLocaleDateString('zh-CN')}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {currentProject?.id !== project.id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => switchProject(project.id)}
                            >
                              切换
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void handleOpenWorkspace(project.workspace_path)}
                            className="text-text-tertiary hover:text-accent-blue"
                            title="在文件管理器中打开"
                          >
                            <FolderOpen className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleStartEdit(project)}
                            className="text-text-tertiary hover:text-accent-blue"
                            title="编辑项目"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm(`确定删除项目 "${project.name}"?`)) {
                                deleteProject(project.id)
                              }
                            }}
                            className="text-text-tertiary hover:text-accent-red"
                            title="删除项目"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
