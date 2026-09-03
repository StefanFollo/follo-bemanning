// Klient-varsling til /api/prosjekter/framdrift-eksport (kundeportal fase 3).
// Fire-and-forget med debounce per prosjekt: state auto-lagres til skyen
// ~1 s etter endring, og serveren leser fbs_state derfra — 6 s venting
// sikrer at det den sender er det som nettopp ble lagret. Feil ignoreres:
// neste trigger prøver igjen, og serveren dedupper på payload-hash.
const ventere = {};

export function varsleFramdriftEksport(prosjektId) {
  if (!prosjektId) return;
  clearTimeout(ventere[prosjektId]);
  ventere[prosjektId] = setTimeout(() => {
    delete ventere[prosjektId];
    fetch('/api/prosjekter/framdrift-eksport', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.getItem('fbs_token') || '') },
      body: JSON.stringify({ prosjektId }),
    }).catch(() => {});
  }, 6000);
}

// Felter som påvirker det kundesynlige framdriftsbildet
export function erFramdriftsEndring(extra) {
  return Object.keys(extra || {}).some(k => k.startsWith('fd') || k.startsWith('framdriftsplan') || k === 'framdriftDeltMedKunde');
}
