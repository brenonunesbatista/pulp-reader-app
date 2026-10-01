import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// fonts are bundled (no network font loading on the device)
import '@fontsource/big-shoulders-display/800'
import '@fontsource/big-shoulders-display/900'
import '@fontsource-variable/source-serif-4/opsz'
import '@fontsource-variable/source-serif-4/opsz-italic'
import './spike/spike.css'
import './app.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
