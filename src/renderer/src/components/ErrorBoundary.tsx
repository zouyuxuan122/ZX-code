import { Component, type ReactNode, type ErrorInfo } from 'react'
import { Button } from './ui/Button'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
          <h2 className="text-lg font-semibold text-text-primary">应用出现错误</h2>
          <p className="text-sm text-text-secondary">抱歉，发生了意外错误。</p>
          {this.state.error && (
            <pre className="max-w-lg overflow-auto rounded-md bg-bg-tertiary p-3 text-xs text-text-secondary">
              {this.state.error.message}
            </pre>
          )}
          <Button variant="primary" onClick={this.handleReload}>
            重新加载
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
