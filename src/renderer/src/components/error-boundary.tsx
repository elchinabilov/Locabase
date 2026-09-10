/**
 * The last line of defence in the renderer.
 *
 * A throw during render unmounts the whole tree. In a packaged build there are
 * no devtools to explain the white window, so the error is caught, shown, and
 * pushed to the log panel the user already has — and only the failing subtree is
 * lost, not the sidebar they need in order to navigate away from it.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button, ErrorNote } from './ui'
import { useT } from '../i18n'

interface Props {
  children: ReactNode
  /** Shown above the message — which screen failed. */
  label?: string
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // `console.error` is the only channel available here: the boundary must keep
    // working even when the failure is in the IPC layer itself.
    console.error('render error', error, info.componentStack)
  }

  private readonly reset = (): void => this.setState({ error: null })

  override render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return <Fallback error={error} label={this.props.label} onReset={this.reset} />
  }
}

function Fallback({
  error,
  label,
  onReset
}: {
  error: Error
  label?: string
  onReset: () => void
}): ReactNode {
  const t = useT()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8" role="alert">
      <p className="text-card text-text">{label ?? t('errorBoundary.title')}</p>
      <ErrorNote>{error.message}</ErrorNote>
      {error.stack && (
        <pre className="max-h-48 max-w-2xl overflow-auto rounded-md border border-line bg-sunken p-3 font-mono text-micro leading-relaxed text-muted">
          {error.stack}
        </pre>
      )}
      <div className="flex gap-2">
        <Button variant="primary" onClick={onReset}>
          {t('errorBoundary.retry')}
        </Button>
        <Button onClick={() => window.location.reload()}>{t('errorBoundary.reload')}</Button>
      </div>
    </div>
  )
}
