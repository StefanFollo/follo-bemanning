import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Byggtidspunkt vises som versjonsnummer i appen — gjør det enkelt å se
// om to enheter kjører samme versjon (norsk tid).
const byggTid = new Date().toLocaleString('nb-NO', {
  timeZone: 'Europe/Oslo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  define: {
    __FBS_VERSJON__: JSON.stringify(byggTid),
  },
})
