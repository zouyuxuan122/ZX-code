import { memo } from 'react'

export const TypingIndicator = memo(function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="inline-block w-2 h-2 rounded-full bg-text-tertiary animate-typing-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
      <span className="text-xs text-text-tertiary">思考中...</span>
    </div>
  )
})
