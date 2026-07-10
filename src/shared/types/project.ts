export interface Project {
  id: string
  name: string
  workspace_path: string
  description: string | null
  created_at: number
  updated_at: number
  last_active_at: number | null
  settings: string
  /** AI 头像（本地文件路径或 URL，空字符串表示用默认） */
  ai_avatar: string
  /** 用户头像（本地文件路径或 URL，空字符串表示用默认） */
  user_avatar: string
  /** 背景值：颜色 hex、图片本地路径或 URL */
  background: string
  /** 背景类型：none | color | image */
  background_type: 'none' | 'color' | 'image'
}

export interface CreateProjectDto {
  name: string
  workspace_path: string
  description?: string
}

export interface UpdateProjectDto {
  name?: string
  workspace_path?: string
  description?: string
  settings?: Record<string, unknown>
  ai_avatar?: string
  user_avatar?: string
  background?: string
  background_type?: 'none' | 'color' | 'image'
}
