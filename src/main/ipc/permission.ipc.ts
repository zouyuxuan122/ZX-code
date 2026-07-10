import { ipcMain } from 'electron'
import * as permissionService from '../services/permission.service'
import { logger } from '../services/logger.service'
import type { PermissionRule } from '../services/permission.service'

/**
 * 权限规则相关 IPC handler
 */
export function registerPermissionIpc(): void {
  // 获取所有权限规则
  ipcMain.handle('permission:getRules', () => {
    return permissionService.getPermissionRules()
  })

  // 设置权限规则
  ipcMain.handle('permission:setRules', (_event, rules: PermissionRule[]) => {
    permissionService.setPermissionRules(rules)
    return true
  })

  // 检查指定工具的权限动作
  ipcMain.handle('permission:check', (_event, toolName: string) => {
    const action = permissionService.checkPermission(toolName)
    logger.debug(`权限检查: ${toolName} -> ${action}`)
    return action
  })

  // 读取白名单外部目录列表
  ipcMain.handle('permission:getAllowedDirectories', () => {
    return permissionService.getAllowedDirectories()
  })

  // 写入白名单外部目录列表
  ipcMain.handle('permission:setAllowedDirectories', (_event, dirs: string[]) => {
    permissionService.setAllowedDirectories(dirs)
    return true
  })

  // 添加单个目录到白名单（自动去重）
  ipcMain.handle('permission:addAllowedDirectory', (_event, dir: string) => {
    permissionService.addAllowedDirectory(dir)
    return true
  })

  // 读取"允许读取工作区外文件"开关状态
  ipcMain.handle('permission:getAllowReadOutsideWorkspace', () => {
    return permissionService.getAllowReadOutsideWorkspace()
  })

  // 设置"允许读取工作区外文件"开关状态
  ipcMain.handle('permission:setAllowReadOutsideWorkspace', (_event, value: boolean) => {
    permissionService.setAllowReadOutsideWorkspace(value)
    return true
  })
}
