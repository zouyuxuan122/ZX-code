import { motion, AnimatePresence, type MotionProps } from 'framer-motion'
import { usePetStore, type PetMood } from '@/stores/petStore'

// ─── 动画变体 ─────────────────────────────────────────

type AnimValue = NonNullable<MotionProps['animate']>
const animationVariants: Record<string, { body: AnimValue; tail: AnimValue }> = {
  idle: {
    body: { y: [0, -4, 0], transition: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } },
    tail: { rotate: [-8, 8, -8], transition: { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } },
  },
  wave: {
    body: {
      y: [0, -8, 0, -8, 0],
      rotate: [-5, 5, -5, 5, 0],
      transition: { duration: 1.5, repeat: 0, ease: 'easeOut' },
    },
    tail: { rotate: [-30, 30, -30, 30, 0], transition: { duration: 1.5, repeat: 0, ease: 'easeOut' } },
  },
  jump: {
    body: {
      y: [0, -40, 0],
      transition: { duration: 0.8, repeat: 0, ease: 'easeOut' },
    },
    tail: { rotate: [-20, 20, 0], transition: { duration: 0.8, repeat: 0, ease: 'easeOut' } },
  },
  sleep: {
    body: { y: [0, -2, 0], transition: { duration: 3.5, repeat: Infinity, ease: 'easeInOut' } },
    tail: { rotate: [-2, 2, -2], transition: { duration: 4, repeat: Infinity, ease: 'easeInOut' } },
  },
  angry: {
    body: {
      x: [-6, 6, -5, 7, -4, 4, 0],
      y: [0, -3, 2, -2, 3, 0],
      transition: { duration: 0.28, repeat: Infinity, ease: 'linear' },
    },
    tail: { rotate: [-40, 40, -40], transition: { duration: 0.45, repeat: Infinity, ease: 'easeInOut' } },
  },
}

// ─── 表情映射 ─────────────────────────────────────────

type Expression = 'neutral' | 'happy' | 'angry' | 'surprised' | 'sleepy'

function resolveExpression(mood: PetMood, pendingExpression: string): Expression {
  const validExpressions: Expression[] = ['neutral', 'happy', 'angry', 'surprised', 'sleepy']
  if (validExpressions.includes(pendingExpression as Expression)) {
    return pendingExpression as Expression
  }

  switch (mood) {
    case 'happy':
      return 'happy'
    case 'annoyed':
      return 'angry'
    case 'sleeping':
      return 'sleepy'
    case 'working':
    case 'talking':
    case 'idle':
    default:
      return 'neutral'
  }
}

function resolveAnimation(mood: PetMood, pendingAnimation: string): string {
  const validAnimations = Object.keys(animationVariants)
  if (validAnimations.includes(pendingAnimation)) {
    return pendingAnimation
  }

  switch (mood) {
    case 'sleeping':
      return 'sleep'
    case 'annoyed':
      return 'angry'
    case 'happy':
    case 'working':
    case 'talking':
    case 'idle':
    default:
      return 'idle'
  }
}

// ─── 爱心粒子 ─────────────────────────────────────────

function HeartParticles() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 6 }).map((_, i) => (
        <motion.span
          key={i}
          className="absolute text-pink-400 select-none"
          style={{ fontSize: 12 + Math.random() * 8, left: `${20 + Math.random() * 60}%` }}
          initial={{ y: 0, opacity: 1 }}
          animate={{
            y: -(60 + Math.random() * 60),
            x: (Math.random() - 0.5) * 40,
            opacity: 0,
          }}
          transition={{
            duration: 1.5 + Math.random(),
            repeat: Infinity,
            delay: i * 0.25,
            ease: 'easeOut',
          }}
        >
          ♥
        </motion.span>
      ))}
    </div>
  )
}

// ─── 蒸汽粒子（烦躁状态）─────────────────────────────

function SteamParticles() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 8 }).map((_, i) => (
        <motion.span
          key={i}
          className="absolute select-none"
          style={{
            fontSize: 12 + Math.random() * 10,
            left: `${20 + Math.random() * 60}%`,
            top: '15%',
            color: i % 2 === 0 ? '#fca5a5' : '#f87171',
          }}
          initial={{ y: 0, opacity: 0.9, scale: 0.8 }}
          animate={{
            y: -(40 + Math.random() * 30),
            opacity: 0,
            scale: 1.4,
            x: (Math.random() - 0.5) * 20,
          }}
          transition={{
            duration: 0.8 + Math.random() * 0.4,
            repeat: Infinity,
            delay: i * 0.12,
            ease: 'easeOut',
          }}
        >
          💢
        </motion.span>
      ))}
    </div>
  )
}

// ─── Zzz 气泡（睡眠状态）─────────────────────────────

function ZzzBubble() {
  return (
    <div className="pointer-events-none absolute right-4 top-4">
      {['Z', 'z', 'z'].map((letter, i) => (
        <motion.span
          key={i}
          className="absolute font-bold text-blue-300 select-none"
          style={{ fontSize: 16 - i * 2, right: i * 10, top: -i * 16 }}
          initial={{ opacity: 0.4 }}
          animate={{ opacity: [0.4, 1, 0.4], y: [0, -6, 0] }}
          transition={{
            duration: 2,
            repeat: Infinity,
            delay: i * 0.5,
            ease: 'easeInOut',
          }}
        >
          {letter}
        </motion.span>
      ))}
    </div>
  )
}

// ─── 主体组件 ─────────────────────────────────────────

export function PetCharacter() {
  const mood = usePetStore((s) => s.mood)
  const character = usePetStore((s) => s.character)
  const pendingAnimation = usePetStore((s) => s.pendingAnimation)
  const pendingExpression = usePetStore((s) => s.pendingExpression)

  const animation = resolveAnimation(mood, pendingAnimation)
  const expression = resolveExpression(mood, pendingExpression)
  const anim = animationVariants[animation]

  const isSleeping = mood === 'sleeping' || animation === 'sleep'
  const isHappy = mood === 'happy'
  const isAnnoyed = mood === 'annoyed' || expression === 'angry'
  const isWorking = mood === 'working'
  const isTalking = mood === 'talking'

  // 眨眼动画：sleepy/sleeping 时永远闭眼
  const eyeOpen = expression !== 'sleepy' && !isSleeping

  // 嘴巴形状由 expression 决定
  const renderMouth = () => {
    if (isTalking) {
      return (
        <ellipse cx="70" cy="70" rx="6" ry="4" fill="#1f2937">
          <animate attributeName="ry" values="4;2;4" dur="0.4s" repeatCount="indefinite" />
        </ellipse>
      )
    }

    switch (expression) {
      case 'happy':
        return <path d="M60 67 Q70 78 80 67" fill="none" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" />
      case 'angry':
        return <path d="M62 70 Q70 64 78 70" fill="none" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" />
      case 'surprised':
        return <ellipse cx="70" cy="70" rx="5" ry="6" fill="#1f2937" />
      case 'sleepy':
        return <path d="M62 68 Q70 72 78 68" fill="none" stroke="#1f2937" strokeWidth="1.5" strokeLinecap="round" />
      case 'neutral':
      default:
        return <path d="M63 68 Q70 74 77 68" fill="none" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" />
    }
  }

  // 眉毛：angry 时倒八字，surprised 时高挑
  const renderEyebrows = () => {
    if (expression === 'angry' || isAnnoyed) {
      return (
        <>
          <line x1="48" y1="42" x2="64" y2="50" stroke="#92400e" strokeWidth="3" strokeLinecap="round" />
          <line x1="92" y1="42" x2="76" y2="50" stroke="#92400e" strokeWidth="3" strokeLinecap="round" />
        </>
      )
    }
    if (expression === 'surprised') {
      return (
        <>
          <line x1="52" y1="40" x2="62" y2="40" stroke="#92400e" strokeWidth="3" strokeLinecap="round" />
          <line x1="78" y1="40" x2="88" y2="40" stroke="#92400e" strokeWidth="3" strokeLinecap="round" />
        </>
      )
    }
    return null
  }

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {/* 爱心粒子（happy） */}
      <AnimatePresence>{isHappy && <HeartParticles />}</AnimatePresence>
      {/* 蒸汽粒子（annoyed / angry） */}
      <AnimatePresence>{isAnnoyed && <SteamParticles />}</AnimatePresence>
      {/* Zzz（sleeping） */}
      <AnimatePresence>{isSleeping && <ZzzBubble />}</AnimatePresence>

      {/* 宠物主体 SVG + motion */}
      <motion.div
        className="relative"
        animate={anim.body}
        style={{ width: 140, height: 140 }}
      >
        <svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg" className="h-full w-full">
          {/* 尾巴 */}
          <motion.g style={{ originX: '90px', originY: '110px' }} animate={anim.tail}>
            <path
              d="M90 108 Q120 85 108 60"
              fill="none"
              stroke="#fbbf24"
              strokeWidth="6"
              strokeLinecap="round"
            />
          </motion.g>

          {/* 身体 */}
          <ellipse cx="70" cy="100" rx="36" ry="26" fill="#fcd34d" />
          {/* 肚子 */}
          <ellipse cx="70" cy="104" rx="22" ry="16" fill="#fef3c7" />

          {/* 头 */}
          <circle cx="70" cy="58" r="30" fill="#fbbf24" />
          {/* 内脸 */}
          <circle cx="70" cy="62" r="20" fill="#fde68a" />

          {/* 耳朵 */}
          <polygon points="40,44 30,10 56,38" fill="#f59e0b" />
          <polygon points="46,40 40,20 54,40" fill="#fcd34d" />
          <polygon points="100,44 110,10 84,38" fill="#f59e0b" />
          <polygon points="94,40 100,20 86,40" fill="#fcd34d" />

          {/* 眼睛 */}
          {eyeOpen ? (
            <>
              <ellipse cx="58" cy="56" rx="5" ry="5.5" fill="#1f2937" />
              <ellipse cx="82" cy="56" rx="5" ry="5.5" fill="#1f2937" />
              <circle cx="56" cy="54" r="1.5" fill="white" />
              <circle cx="80" cy="54" r="1.5" fill="white" />
            </>
          ) : (
            <>
              <path
                d="M52 56 Q58 60 64 56"
                fill="none"
                stroke="#1f2937"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <path
                d="M76 56 Q82 60 88 56"
                fill="none"
                stroke="#1f2937"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </>
          )}

          {/* 眉毛 */}
          {renderEyebrows()}

          {/* 鼻子 */}
          <ellipse cx="70" cy="64" rx="3" ry="2" fill="#f472b6" />

          {/* 嘴巴 */}
          {renderMouth()}

          {/* 腮红 */}
          <circle cx="48" cy="66" r="6" fill="#fca5a5" opacity="0.4" />
          <circle cx="92" cy="66" r="6" fill="#fca5a5" opacity="0.4" />

          {/* 胡须 */}
          <line x1="38" y1="60" x2="52" y2="62" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="38" y1="66" x2="52" y2="66" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="102" y1="60" x2="88" y2="62" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="102" y1="66" x2="88" y2="66" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />

          {/* 爪子 */}
          <ellipse cx="56" cy="122" rx="10" ry="7" fill="#fbbf24" />
          <ellipse cx="84" cy="122" rx="10" ry="7" fill="#fbbf24" />
          <ellipse cx="56" cy="122" rx="7" ry="5" fill="#fde68a" />
          <ellipse cx="84" cy="122" rx="7" ry="5" fill="#fde68a" />

          {/* 工作眼镜（working） */}
          {isWorking && (
            <>
              <rect x="49" y="49" width="18" height="14" rx="3" fill="none" stroke="#6366f1" strokeWidth="2" />
              <rect x="73" y="49" width="18" height="14" rx="3" fill="none" stroke="#6366f1" strokeWidth="2" />
              <line x1="67" y1="56" x2="73" y2="56" stroke="#6366f1" strokeWidth="2" />
              <line x1="49" y1="56" x2="40" y2="54" stroke="#6366f1" strokeWidth="2" />
              <line x1="91" y1="56" x2="100" y2="54" stroke="#6366f1" strokeWidth="2" />
            </>
          )}
        </svg>

        {/* 名字标签 */}
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2">
          <span className="rounded-full bg-black/20 px-3 py-0.5 text-[10px] font-medium text-white/80 backdrop-blur-sm">
            {character.avatar} {character.name}
          </span>
        </div>
      </motion.div>
    </div>
  )
}
