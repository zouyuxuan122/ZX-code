import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Github, Tv, Code2, Palette, User } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { ipc } from '@/services/ipc'
import { APP_NAME, AUTHOR_INFO } from '@shared/constants/app'

import appIcon from '@/assets/app-icon.png'

export default function AboutPage() {
  const navigate = useNavigate()
  const [version, setVersion] = useState('0.1.0')

  useEffect(() => {
    ipc.system.getVersion().then(setVersion)
  }, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 items-center gap-3 border-b border-border-default px-4 shadow-sm">
        <Button variant="ghost" size="icon" onClick={() => navigate('/chat')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-base font-semibold text-text-primary">关于</h1>
      </div>

      <div className="flex-1 overflow-auto p-8">
        <div className="mx-auto max-w-2xl">
          <div className="mb-8 text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="mx-auto mb-4 h-20 w-20 animate-float overflow-hidden rounded-xl"
            >
              <img
                src={appIcon}
                alt="ZX-Code"
                className="h-full w-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                  const fallback = e.currentTarget.nextElementSibling as HTMLElement | null
                  if (fallback) fallback.style.display = 'block'
                }}
              />
              <Code2 className="hidden h-10 w-10 text-white" />
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="text-2xl font-bold text-text-primary"
            >
              {APP_NAME}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="mt-1 text-sm text-text-secondary"
            >
              Windows 桌面端编程 Agent 智能体应用
            </motion.p>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="mt-2 text-xs text-text-tertiary"
            >
              版本 {version}
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="surface-3d rounded-lg p-6"
          >
            <h3 className="mb-4 text-sm font-semibold text-text-primary">开发者信息</h3>

            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-md p-2">
                <User className="h-5 w-5 text-text-secondary" />
                <div>
                  <div className="text-xs text-text-tertiary">开发</div>
                  <div className="text-sm text-text-primary">{AUTHOR_INFO.developer}</div>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-md p-2">
                <Palette className="h-5 w-5 text-text-secondary" />
                <div>
                  <div className="text-xs text-text-tertiary">UI 设计</div>
                  <div className="text-sm text-text-primary">{AUTHOR_INFO.uiDesigner}</div>
                </div>
              </div>

              <a
                href={AUTHOR_INFO.github}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-md p-2 transition-smooth-fast hover:bg-white/5"
              >
                <Github className="h-5 w-5 text-text-secondary" />
                <div>
                  <div className="text-xs text-text-tertiary">GitHub</div>
                  <div className="text-sm text-text-primary">{AUTHOR_INFO.github}</div>
                </div>
              </a>

              <a
                href={AUTHOR_INFO.bilibiliUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-md p-2 transition-smooth-fast hover:bg-white/5"
              >
                <Tv className="h-5 w-5 text-text-secondary" />
                <div>
                  <div className="text-xs text-text-tertiary">哔哩哔哩</div>
                  <div className="text-sm text-text-primary">{AUTHOR_INFO.bilibili}（{AUTHOR_INFO.bilibiliUrl}）</div>
                </div>
              </a>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.36, ease: [0.16, 1, 0.3, 1] }}
            className="surface-3d mt-4 rounded-lg p-6"
          >
            <h3 className="mb-3 text-sm font-semibold text-text-primary">技术栈</h3>
            <div className="flex flex-wrap gap-2">
              {['Electron', 'React', 'TypeScript', 'Tailwind CSS', 'Zustand', 'SQLite'].map((tech) => (
                <span
                  key={tech}
                  className="rounded-md border border-border-default bg-white/5 px-2 py-1 text-xs text-text-secondary transition-smooth-fast hover:border-border-strong hover:text-text-primary"
                >
                  {tech}
                </span>
              ))}
            </div>
          </motion.div>

          <div className="mt-6 text-center text-xs text-text-tertiary">
            <p>GPL-3.0 License</p>
          </div>
        </div>
      </div>
    </div>
  )
}
