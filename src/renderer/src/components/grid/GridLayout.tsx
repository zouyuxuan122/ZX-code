import { useState, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { useGridStore } from '@/stores/gridStore'
import { GridSlot } from './GridSlot'

/** 可拖动分隔条：调整相邻两列或两行的比例 */
interface ResizeHandleProps {
  orientation: 'vertical' | 'horizontal'
  // 分隔条位置（百分比，0-100）
  positionPct: number
  onDrag: (deltaRatio: number) => void
}

function ResizeHandle({ orientation, positionPct, onDrag }: ResizeHandleProps) {
  const startRef = useRef<{ pos: number; total: number } | null>(null)

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const target = e.currentTarget as HTMLElement
      target.setPointerCapture(e.pointerId)
      const parent = target.parentElement
      const isVertical = orientation === 'vertical'
      const total = isVertical
        ? parent?.clientWidth || 1
        : parent?.clientHeight || 1
      // 垂直分隔条沿 X 轴拖动，水平分隔条沿 Y 轴拖动
      startRef.current = { pos: isVertical ? e.clientX : e.clientY, total }
    },
    [orientation],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!startRef.current) return
      const isVertical = orientation === 'vertical'
      const cur = isVertical ? e.clientX : e.clientY
      const deltaPx = cur - startRef.current.pos
      // 像素增量转为比例增量（相对容器尺寸，三列/行基准为 3）
      const deltaRatio = (deltaPx / startRef.current.total) * 3
      if (Math.abs(deltaRatio) > 0.0005) {
        onDrag(deltaRatio)
        // 重置起点，使 onDrag 每次只传递增量
        startRef.current.pos = cur
      }
    },
    [orientation, onDrag],
  )

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    startRef.current = null
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      // 忽略
    }
  }, [])

  const isVertical = orientation === 'vertical'
  const handleStyle: React.CSSProperties = isVertical
    ? {
        left: `${positionPct}%`,
        top: 0,
        width: '8px',
        height: '100%',
        transform: 'translateX(-50%)',
        cursor: 'col-resize',
      }
    : {
        top: `${positionPct}%`,
        left: 0,
        height: '8px',
        width: '100%',
        transform: 'translateY(-50%)',
        cursor: 'row-resize',
      }
  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      data-testid={`resize-handle-${orientation}`}
      className="absolute z-30 flex items-center justify-center bg-black/0 transition-colors hover:bg-black/10"
      style={{ ...handleStyle, touchAction: 'none', pointerEvents: 'auto' }}
    >
      <div
        className="rounded-full bg-black/20"
        style={
          isVertical
            ? { width: '2px', height: '24px' }
            : { height: '2px', width: '24px' }
        }
      />
    </div>
  )
}

/** 九宫格主容器：咖啡色背景 + 粗黑框线分割，无标题栏/工具栏 */
export function GridLayout() {
  const layout = useGridStore((s) => s.layout)
  const swapSlots = useGridStore((s) => s.swapSlots)
  const resizeColumn = useGridStore((s) => s.resizeColumn)
  const resizeRow = useGridStore((s) => s.resizeRow)

  // 拖拽状态
  const [dragSourceIndex, setDragSourceIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const handleDragStart = useCallback((index: number) => {
    setDragSourceIndex(index)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }, [])

  const handleDragEnter = useCallback((index: number) => {
    setDragOverIndex(index)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault()
      if (dragSourceIndex !== null && dragSourceIndex !== toIndex) {
        swapSlots(dragSourceIndex, toIndex)
      }
      setDragSourceIndex(null)
      setDragOverIndex(null)
    },
    [dragSourceIndex, swapSlots],
  )

  const handleDragEnd = useCallback(() => {
    setDragSourceIndex(null)
    setDragOverIndex(null)
  }, [])

  const colSizes = layout.colSizes ?? [1, 1, 1]
  const rowSizes = layout.rowSizes ?? [1, 1, 1]
  const colTotal = colSizes.reduce((a, b) => a + b, 0) || 3
  const rowTotal = rowSizes.reduce((a, b) => a + b, 0) || 3
  // 列分隔条位置：第 0/1 列之间、第 1/2 列之间
  const colSepPct = [colSizes[0] / colTotal, (colSizes[0] + colSizes[1]) / colTotal]
  const rowSepPct = [rowSizes[0] / rowTotal, (rowSizes[0] + rowSizes[1]) / rowTotal]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="h-full w-full"
      style={{ backgroundColor: '#000000' }}
    >
      {/* 九宫格主体：gap 即粗黑框线 */}
      <div
        className="relative grid h-full w-full"
        style={{
          gridTemplateColumns: `${colSizes[0]}fr ${colSizes[1]}fr ${colSizes[2]}fr`,
          gridTemplateRows: `${rowSizes[0]}fr ${rowSizes[1]}fr ${rowSizes[2]}fr`,
          gap: '3px',
          backgroundColor: '#000000',
        }}
      >
        {/* 渲染时硬限制最多 9 格，防止 store 数据异常导致多渲染格子 */}
        {layout.slots.slice(0, 9).map((slotType, index) => (
          <motion.div
            key={slotType ?? `empty-${index}`}
            data-slot-index={index}
            layout="position"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: 0.35,
              delay: index * 0.03,
              layout: { type: 'spring', stiffness: 400, damping: 25 },
            }}
            className="h-full w-full min-w-0 min-h-0 overflow-hidden bg-bg-primary"
          >
            <GridSlot
              slotType={slotType}
              index={index}
              isDragSource={dragSourceIndex === index}
              isDragOver={dragOverIndex === index && dragSourceIndex !== index}
              hasDragSource={dragSourceIndex !== null}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            />
          </motion.div>
        ))}

        {/* 垂直分隔条（调整列宽） */}
        {colSepPct.map((pct, i) => (
          <ResizeHandle
            key={`col-${i}`}
            orientation="vertical"
            positionPct={pct * 100}
            onDrag={(delta) => resizeColumn(i, delta)}
          />
        ))}
        {/* 水平分隔条（调整行高） */}
        {rowSepPct.map((pct, i) => (
          <ResizeHandle
            key={`row-${i}`}
            orientation="horizontal"
            positionPct={pct * 100}
            onDrag={(delta) => resizeRow(i, delta)}
          />
        ))}
      </div>
    </motion.div>
  )
}
