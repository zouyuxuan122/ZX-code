import {
  motion,
  AnimatePresence,
  type HTMLMotionProps,
  type Variants,
} from 'framer-motion'
import { type ReactNode, type ComponentPropsWithoutRef } from 'react'

/* 统一缓动 */
const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const
const EASE_SPRING = [0.34, 1.56, 0.64, 1] as const

/** Apple HIG 风格：柔和的 ease-out（macOS 系统动画常用） */
const APPLE_EASE = [0.25, 0.46, 0.45, 0.94] as const

/** Apple HIG 风格：更轻快的 ease-out（轻量交互如 hover/tap） */
const APPLE_EASE_QUICK = [0.2, 0.8, 0.2, 1] as const

/** Claude 风格：有机 ease-out（温暖、自然、不急促） */
const CLAUDE_EASE = [0.22, 0.61, 0.36, 1] as const

/** Claude 风格：更轻快的 ease-out（用于微交互） */
const CLAUDE_EASE_QUICK = [0.16, 0.85, 0.4, 1] as const

/** 页面切换：淡入 + 上移。用 flex-1 + min-h-0 撑满 main 区域，避免高度塌缩 */
export function PageTransition({ children, ...props }: HTMLMotionProps<'div'>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
      className="flex min-h-0 flex-1 flex-col"
      {...props}
    >
      {children}
    </motion.div>
  )
}

/** Stagger 容器：子项错落淡入 */
export function StaggerContainer({
  children,
  className,
  ...props
}: HTMLMotionProps<'div'>) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: 0.05,
            delayChildren: 0.02,
          },
        },
      }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
}

/** Stagger 子项：淡入 + 上移 */
export function StaggerItem({
  children,
  className,
  ...props
}: HTMLMotionProps<'div'>) {
  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 8 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.3, ease: EASE_OUT_EXPO },
    },
  }
  return (
    <motion.div variants={itemVariants} className={className} {...props}>
      {children}
    </motion.div>
  )
}

/** 通用动画 div：可自定义初始/进入/退出 */
export function AnimatedDiv({
  children,
  className,
  ...props
}: HTMLMotionProps<'div'>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
}

/** 折叠/展开动画容器（宽度过渡） */
export function CollapseTransition({
  children,
  collapsed,
  collapsedWidth = 48,
  expandedWidth = 240,
  className,
  ...props
}: {
  children: ReactNode
  collapsed: boolean
  collapsedWidth?: number
  expandedWidth?: number
} & Omit<HTMLMotionProps<'div'>, 'animate' | 'initial'>) {
  return (
    <motion.div
      initial={false}
      animate={{ width: collapsed ? collapsedWidth : expandedWidth }}
      transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
      className={className}
      style={{ overflow: 'hidden' }}
      {...props}
    >
      {children}
    </motion.div>
  )
}

/** 下拉/弹出层动画（用于 Select、菜单等） */
export function PopIn({
  children,
  className,
  ...props
}: HTMLMotionProps<'div'>) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: -4 }}
      transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
}

/** 按钮交互包装：hover 微缩放 + tap 缩放 */
export const MotionButton = motion.button

/** 按钮变体预设：默认 hover scale 1.02, tap scale 0.98 */
export function InteractiveButton({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<'button'>) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15, ease: EASE_OUT_EXPO }}
      className={className}
      {...(props as ComponentPropsWithoutRef<typeof motion.button>)}
    >
      {children}
    </motion.button>
  )
}

/** 缩放 + 弹性进入（用于徽章、强调元素） */
export function SpringIn({
  children,
  className,
  ...props
}: HTMLMotionProps<'div'>) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: EASE_SPRING }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
}

export { AnimatePresence, motion, EASE_OUT_EXPO, EASE_SPRING, APPLE_EASE, APPLE_EASE_QUICK, CLAUDE_EASE, CLAUDE_EASE_QUICK }
export default {
  PageTransition,
  StaggerContainer,
  StaggerItem,
  AnimatedDiv,
  CollapseTransition,
  PopIn,
  InteractiveButton,
  SpringIn,
  MotionButton,
}
