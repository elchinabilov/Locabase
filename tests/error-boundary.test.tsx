import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ErrorBoundary } from '../src/renderer/src/components/error-boundary.js'
import { I18nProvider } from '../src/renderer/src/i18n/index.js'

function Boom({ fail }: { fail: boolean }): ReactNode {
  if (fail) throw new Error('render exploded')
  return <p>working</p>
}

beforeEach(() => {
  // React logs the caught error itself; the noise is not the thing under test.
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => vi.restoreAllMocks())

describe('ErrorBoundary', () => {
  it('renders its children when nothing throws', () => {
    render(
      <I18nProvider>
        <ErrorBoundary>
          <Boom fail={false} />
        </ErrorBoundary>
      </I18nProvider>
    )
    expect(screen.getByText('working')).toBeInTheDocument()
  })

  it('catches a render error and shows the message', () => {
    render(
      <I18nProvider>
        <ErrorBoundary>
          <Boom fail={true} />
        </ErrorBoundary>
      </I18nProvider>
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('render exploded')).toBeInTheDocument()
  })

  it('uses the given label for the failing screen', () => {
    render(
      <I18nProvider>
        <ErrorBoundary label="Tables failed">
          <Boom fail={true} />
        </ErrorBoundary>
      </I18nProvider>
    )
    expect(screen.getByText('Tables failed')).toBeInTheDocument()
  })

  /** Without this the only way out of a transient failure is restarting the app. */
  it('retries back into the children', () => {
    let fail = true
    function Flaky(): ReactNode {
      if (fail) throw new Error('once')
      return <p>recovered</p>
    }
    render(
      <I18nProvider>
        <ErrorBoundary>
          <Flaky />
        </ErrorBoundary>
      </I18nProvider>
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByText('recovered')).toBeInTheDocument()
  })

  it('reports the error for the log', () => {
    render(
      <I18nProvider>
        <ErrorBoundary>
          <Boom fail={true} />
        </ErrorBoundary>
      </I18nProvider>
    )
    expect(console.error).toHaveBeenCalled()
  })
})
