import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import KsAnsattflate from './ansattflate/KsAnsattflate.jsx'

// /ks/<token> er den lukkede ansattflaten (SPEC-ks-ansattflate.md) — egen
// inngang uten innlogging/AppProvider, ingen nav til resten av appen.
const ksMatch = window.location.pathname.match(/^\/ks\/([a-f0-9]{32,64})\/?$/);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {ksMatch ? <KsAnsattflate token={ksMatch[1]} /> : <App />}
  </StrictMode>,
)
