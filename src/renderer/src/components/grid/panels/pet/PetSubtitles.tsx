import { motion, AnimatePresence } from 'framer-motion'

export interface PetSubtitlesProps {
  text: string
  visible: boolean
  style: 'bubble' | 'line'
}

export function PetSubtitles({ text, visible, style }: PetSubtitlesProps) {
  const isBubble = style === 'bubble'

  return (
    <AnimatePresence>
      {visible && text && (
        <motion.div
          key={text}
          data-testid="pet-subtitles"
          className={[
            'pointer-events-none absolute left-1/2 top-4 z-10 max-w-[85%] -translate-x-1/2',
            'px-3.5 py-2 text-center text-xs font-medium tracking-wide shadow-lg backdrop-blur-md',
            'border border-white/10',
            isBubble
              ? 'rounded-2xl bg-white/90 text-gray-800 dark:bg-white/80 shadow-[0_8px_24px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.9)]'
              : 'rounded-lg bg-black/70 text-white shadow-[0_4px_16px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)]',
          ].join(' ')}
          initial={{ opacity: 0, y: 12, scale: 0.85 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.95 }}
          transition={{
            duration: 0.35,
            ease: [0.34, 1.56, 0.64, 1],
          }}
        >
          <span className="block line-clamp-2 leading-relaxed">{text}</span>
          {isBubble && (
            <div className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-white/10 bg-white/90 dark:bg-white/80" />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
