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

// Oppdrag 11F: PL-forhåndsvisning — ?ksForhandsvisning=<ansattId> viser
// ansattflaten slik den ansatte ser den (krever admin/kontor-sesjon i
// samme nettleser; serveren håndhever, kun lesing).
const forhandsvisning = new URLSearchParams(window.location.search).get('ksForhandsvisning');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {ksMatch ? <KsAnsattflate token={ksMatch[1]} />
      : forhandsvisning ? <KsAnsattflate token="" somAnsatt={forhandsvisning} />
      : <App />}
  </StrictMode>,
)
