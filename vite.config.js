import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Byggtidspunkt vises som versjonsnummer i appen — gjør det enkelt å se
// om to enheter kjører samme versjon (norsk tid, entydig format: 29.07 kl 08:31).
const osloNu = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Oslo' }))
const pad = n => String(n).padStart(2, '0')
const byggTid = `${pad(osloNu.getDate())}.${pad(osloNu.getMonth() + 1)} kl ${pad(osloNu.getHours())}:${pad(osloNu.getMinutes())}`

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  define: {
    __FBS_VERSJON__: JSON.stringify(byggTid),
  },
})
