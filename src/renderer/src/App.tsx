import { AppLayout } from '@/components/layout/AppLayout'
import { AppRoutes } from '@/router'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ToastContainer } from '@/components/ui/Toast'
import { PermissionDialog } from '@/components/chat/PermissionDialog'
import { FileSearchPanel } from '@/components/search/FileSearchPanel'

export default function App() {
  return (
    <ErrorBoundary>
      <AppLayout>
        <AppRoutes />
      </AppLayout>
      <ToastContainer />
      <PermissionDialog />
      <FileSearchPanel />
    </ErrorBoundary>
  )
}