import { useEffect, useRef } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { usePetStore } from '@/stores/petStore'
import { PetDisplay } from './pet/PetDisplay'

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/**
 * 宠物窗口面板 — 九宫格正中间（索引 4）
 * 极简风：仅显示宠物，无对话栏
 */
export function PetPanel() {
  const currentTaskName = useChatStore((s) => s.currentTaskName)
  const setCurrentTaskName = usePetStore((s) => s.setCurrentTaskName)
  const setMood = usePetStore((s) => s.setMood)
  const showBubble = usePetStore((s) => s.showBubble)
  const resetSleepTimer = usePetStore((s) => s.resetSleepTimer)
  const startIdleBubbleLoop = usePetStore((s) => s.startIdleBubbleLoop)
  const stopIdleBubbleLoop = usePetStore((s) => s.stopIdleBubbleLoop)

  const prevTaskNameRef = useRef<string | null>(null)

  // 同步主对话任务名 → 宠物 Store，并驱动情绪变化
  useEffect(() => {
    setCurrentTaskName(currentTaskName)

    if (currentTaskName) {
      const mood = usePetStore.getState().mood
      if (mood !== 'working' && mood !== 'annoyed') {
        setMood('working')
      }
      // 仅在从「无任务」变为「有任务」时播放工作提示气泡
      if (prevTaskNameRef.current === null) {
        showBubble(randomPick(usePetStore.getState().character.workingMessages))
      }
    } else if (prevTaskNameRef.current !== null) {
      const mood = usePetStore.getState().mood
      if (mood === 'working' || mood === 'annoyed') {
        setMood('happy')
        showBubble(randomPick(['完成啦！喵！✨', '太棒了，搞定！🎉', '呼~ 终于完成了喵~']))
        const timer = setTimeout(() => {
          setMood('idle')
        }, 3000)
        return () => clearTimeout(timer)
      }
    }

    prevTaskNameRef.current = currentTaskName
  }, [currentTaskName, setCurrentTaskName, setMood, showBubble])

  // 初始化：启动空闲气泡循环 + 睡眠计时
  useEffect(() => {
    startIdleBubbleLoop()
    resetSleepTimer()
    return () => {
      stopIdleBubbleLoop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PetDisplay />
    </div>
  )
}
