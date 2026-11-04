import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { FOOD_CLUB_ENABLED } from './lib/foodClubConfig'
import { initPwaInstallCapture, registerServiceWorkerEarly } from './lib/pwaInstall'

// FOOD CLUB V1 (PWA spec I-3/I-4): beforeinstallprompt arriva presto e una volta sola.
if (FOOD_CLUB_ENABLED) {
  initPwaInstallCapture()
  registerServiceWorkerEarly()
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
