// Web-push mot tilbuds-appens abonnementer (SPEC §3, push-kobling).
// Abonnementene EIES av tilbuds-appen — vi LESER dem via inter-app-API-et og
// sender med samme VAPID-nøkkelpar (VAPID_* i env, delt mellom prosjektene).
// Uten VAPID_PRIVATE_KEY: no-op som rapporterer skipped → e-post tar over.
import webpush from 'web-push';

export function vapidKlar() {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export async function hentInterappAbonnementer() {
  const base = (process.env.TILBUDSAPP_URL || 'https://follo-befaring.vercel.app').replace(/\/$/, '');
  const token = process.env.INTER_APP_TOKEN;
  if (!token) return { feil: 'INTER_APP_TOKEN mangler', abonnementer: [], innstillinger: {} };
  try {
    const r = await fetch(base + '/api/push?action=interapp-abonnementer', {
      headers: { Authorization: 'Bearer ' + token },
    });
    if (!r.ok) return { feil: `tilbuds-appen svarte ${r.status}`, abonnementer: [], innstillinger: {} };
    const d = await r.json();
    return { abonnementer: d.abonnementer || [], innstillinger: d.innstillinger || {} };
  } catch (e) {
    return { feil: e.message, abonnementer: [], innstillinger: {} };
  }
}

// Send til alle enheter for én person. Returnerer { sendt, av, feil[], skipped? }.
// Døde endepunkter (404/410) rapporteres men slettes IKKE — tilbuds-appen eier dem.
export async function sendPushBatch(abonnementer, payloadObj) {
  const alle = abonnementer || [];
  if (!alle.length) return { sendt: 0, av: 0, feil: [] };
  if (!vapidKlar()) return { skipped: true, grunn: 'VAPID-nøkler mangler', sendt: 0, av: alle.length, feil: [] };
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:post@follobyggservice.no',
    process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const payload = JSON.stringify(payloadObj);
  let sendt = 0;
  const feil = [];
  for (const ab of alle) {
    try {
      await webpush.sendNotification({ endpoint: ab.endpoint, keys: ab.keys }, payload, { TTL: 3600 });
      sendt++;
    } catch (e) {
      feil.push(`${e?.statusCode || '?'}: ${String(e?.message || 'ukjent').slice(0, 120)}`);
    }
  }
  return { sendt, av: alle.length, feil };
}
