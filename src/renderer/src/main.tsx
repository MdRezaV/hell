import '@fontsource/fira-sans/400.css'
import '@fontsource/fira-sans/500.css'
import '@fontsource/fira-sans/600.css'
import '@fontsource/fira-sans/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/600.css'
import '@fontsource/jetbrains-mono/700.css'
import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { LoadingProvider } from './LoadingContext'
import ProgressBar from './components/ProgressBar'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LoadingProvider>
      <ProgressBar />
      <App />
    </LoadingProvider>
  </StrictMode>
)
