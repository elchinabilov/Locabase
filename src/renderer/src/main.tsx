import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './app'
import { I18nProvider } from './i18n'
import { ThemeProvider } from './theme'
import { FontProvider } from './fonts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <FontProvider>
        <I18nProvider>
          <App />
        </I18nProvider>
      </FontProvider>
    </ThemeProvider>
  </StrictMode>
)
