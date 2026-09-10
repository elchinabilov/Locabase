import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './app'
import { I18nProvider } from './i18n'
import { ThemeProvider } from './theme'
import { FontProvider } from './fonts'
import { ErrorBoundary } from './components/error-boundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <FontProvider>
        <I18nProvider>
          {/* Inside the providers: the fallback itself needs `t()` and the palette. */}
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </I18nProvider>
      </FontProvider>
    </ThemeProvider>
  </StrictMode>
)
