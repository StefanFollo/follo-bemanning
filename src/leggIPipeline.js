// src/leggIPipeline.js — «+ Legg i pipeline» (oppdrag 24/25), delt mellom
// Prosjekter → Pipeline og rullegardinen i Ukeoversikt. Oppretter et
// prosjekt i Ikke startet fra et vunnet tilbud uten prosjekt (Vunnet) eller
// et sendt tilbud / en befaring (Sannsynlig / Mulig). Samme navnformat som
// BefaringPlan.opprettProsjekt, slik at «Opprett prosjekt» kobler til dette
// prosjektet når tilbudet vinnes senere (og setter sikkerhet fast).

import { weekStart, pipelineLoggInnslag } from './pipeline.js';

export const LEGG_STATUSER = ['godkjent', 'tilbud_sendt', 'tilbud_arbeid', 'planlagt'];

export function leggKandidater(befaringer, prosjekter) {
  return (befaringer || []).filter(b => b && !b.arkivert && !b.prosjektId
    && LEGG_STATUSER.includes(b.status)
    && !(prosjekter || []).some(p => p && !p.arkivert && (p.befaringId === b.id || p.kildeBefaringId === b.id)));
}

export function sikkerhetFor(befaring) {
  return befaring.status === 'godkjent' ? 'fast' : befaring.status === 'tilbud_sendt' ? 'sannsynlig' : 'mulig';
}

// Returnerer { prosjekt, befaring } klare for ADD_PROSJEKT / UPDATE_BEFARING.
export function byggPipelineProsjekt(b, form, { prosjektId, farge, brukerNavn }) {
  const sikkerhet = sikkerhetFor(b);
  const prosjekt = {
    id: prosjektId,
    navn: b.kontaktNavn + (b.adresse ? ' – ' + b.adresse : ''),
    adresse: b.adresse || '',
    jobbType: b.jobbType || '',
    belop: b.estimertBelop || '',
    estimertSum: b.estimertSum || 0,
    prosjektlederId: b.prosjektlederId || '',
    startDato: '', sluttDato: '',
    status: 'aktiv',
    beskrivelse: [b.notat, b.kommentar].filter(Boolean).join('\n\n') || '',
    farge,
    befaringId: b.id, kildeBefaringId: b.id,
    poster: b.poster || [], fag: b.fag || [], pristype: b.pristype || '',
    tilbudLink: b.tilbudLink || '',
    ...(b.tilbudPayload ? { tilbudPayload: b.tilbudPayload } : {}),
    ...(b.gruppeId ? { gruppeId: String(b.gruppeId), ...(b.gruppeNavn ? { gruppeNavn: b.gruppeNavn } : {}) } : {}),
    kunde: { navn: b.kontaktNavn || '', adresse: b.adresse || '', telefon: b.telefon || '', epost: b.epost || '' },
    pipeline: {
      forventetStart: form.forventetStart ? weekStart(form.forventetStart) : null,
      forventetUker: Math.max(1, Number(form.forventetUker) || 2),
      forventetFolk: Math.max(1, Number(form.forventetFolk) || 2),
      sikkerhet,
    },
    pipelineLogg: [pipelineLoggInnslag(`Lagt i pipeline fra ${b.status === 'godkjent' ? 'vunnet tilbud' : 'tilbud/befaring'} (${sikkerhet})`, brukerNavn)],
  };
  // Vunnet tilbud arkiveres som i BefaringPlan; sendte tilbud/befaringer
  // lever videre i tilbudsflyten (kun koblet).
  const befaring = { ...b, prosjektId, ...(b.status === 'godkjent' ? { arkivert: true } : {}) };
  return { prosjekt, befaring };
}
