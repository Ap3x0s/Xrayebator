import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './i18n'
import './styles/global.css'
import './styles/tailwind.css'

document.documentElement.classList.add('dark')
document.documentElement.setAttribute('data-theme', 'dark')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
