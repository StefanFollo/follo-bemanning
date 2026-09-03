import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import KsAnsattflate from './ansattflate/KsAnsattflate.jsx'

// /ks/<token> er den lukkede ansattflaten (SPEC-ks-ansattflate.md) — egen
// inngang uten innlogging/AppProvider, ingen nav til resten av appen.
// Alt under /ks/ går til flaten — serveren avgjør om tokenet er gyldig.
// Feil format skal gi «utløpt»-melding, aldri innloggingssiden
// (postkasse-oppdrag 4: ikke-hex-tokens traff appen i stedet for flaten).
const ksMatch = window.location.pathname.match(/^\/ks\/([^/]+)\/?$/);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {ksMatch ? <KsAnsattflate token={ksMatch[1]} /> : <App />}
  </StrictMode>,
)
