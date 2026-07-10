import { ipcMain, dialog, BrowserWindow } from 'electron'
import * as projectRepo from '../database/repositories/project.repo'
import { config } from '../services/config.service'
import { logger } from '../services/logger.service'
import type { CreateProjectDto, UpdateProjectDto } from '@shared/types/project'

export function registerProjectIpc(): void {
  ipcMain.handle('project:list', () => {
    return projectRepo.findAll()
  })

  ipcMain.handle('project:get', (_event, id: string) => {
    return projectRepo.findById(id)
  })

  ipcMain.handle('project:create', (_event, data: CreateProjectDto) => {
    logger.info(`创建项目: ${data.name}`)
    return projectRepo.create(data)
  })

  ipcMain.handle('project:update', (_event, id: string, data: UpdateProjectDto) => {
    logger.info(`更新项目: ${id}`)
    return projectRepo.update(id, data)
  })

  ipcMain.handle('project:delete', (_event, id: string) => {
    logger.info(`删除项目: ${id}`)
    projectRepo.remove(id)
  })

  ipcMain.handle('project:setActive', (_event, id: string) => {
    logger.info(`激活项目: ${id}`)
    projectRepo.setActive(id)
    config.setActiveProjectId(id)
  })

  ipcMain.handle('project:getActive', () => {
    return projectRepo.findActive()
  })

  ipcMain.handle('dialog:selectDirectory', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const result = dialog.showOpenDialogSync(window!, {
      properties: ['openDirectory'],
    })
    return result && result.length > 0 ? result[0] : null
  })
}
