import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { PageTransition } from '@/components/ui/Motion'

const ChatPage = lazy(() => import('@/pages/ChatPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))
const MarketPage = lazy(() => import('@/pages/MarketPage'))
const ProjectsPage = lazy(() => import('@/pages/ProjectsPage'))
const AboutPage = lazy(() => import('@/pages/AboutPage'))

function PageLoader() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <div className="text-sm text-text-secondary">加载中...</div>
    </div>
  )
}

/**
 * 路由配置。
 * 不使用 AnimatePresence mode="wait"：该模式在 exit 动画期间不渲染新页面，
 * 配合 lazy loading 和 flex 布局时容易导致白屏（exit 卡住则永久白屏）。
 * 改为即时切换 + 仅入场动画（PageTransition 的 initial→animate），体验流畅且无白屏风险。
 */
function AnimatedRoutes() {
  const location = useLocation()

  return (
    <Routes location={location}>
      <Route path="/" element={<Navigate to="/chat" replace />} />
      <Route
        path="/chat"
        element={
          <Suspense fallback={<PageLoader />}>
            <PageTransition key="chat">
              <ChatPage />
            </PageTransition>
          </Suspense>
        }
      />
      <Route
        path="/settings"
        element={
          <Suspense fallback={<PageLoader />}>
            <PageTransition key="settings">
              <SettingsPage />
            </PageTransition>
          </Suspense>
        }
      />
      <Route
        path="/market"
        element={
          <Suspense fallback={<PageLoader />}>
            <PageTransition key="market">
              <MarketPage />
            </PageTransition>
          </Suspense>
        }
      />
      <Route
        path="/projects"
        element={
          <Suspense fallback={<PageLoader />}>
            <PageTransition key="projects">
              <ProjectsPage />
            </PageTransition>
          </Suspense>
        }
      />
      <Route
        path="/about"
        element={
          <Suspense fallback={<PageLoader />}>
            <PageTransition key="about">
              <AboutPage />
            </PageTransition>
          </Suspense>
        }
      />
    </Routes>
  )
}

export function AppRoutes() {
  return <AnimatedRoutes />
}
