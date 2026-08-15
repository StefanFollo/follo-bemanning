// ═══ Framdriftsplan-utkast (SPEC-trinn4b) — ren, testbar logikk ═══
//
// Utkast auto-aktiveres ALDRI. Aktivering er et eksplisitt valg, og en
// eksisterende plan arkiveres alltid i framdriftsplanHistorikk (aldri slettet).
// Forkast rører KUN utkast-feltet.

// Faser (startUke/varighetDager) → fdTasks-formatet som Framdrift-sidens
// gantt allerede rendrer ({start: dag-offset, dur: dager}, 5-dagers uker).
export function byggFdTasksFraFaser(plan) {
  const oppstartUke = plan.oppstartUke || (plan.faser?.[0]?.startUke ?? 1);
  return (plan.faser || []).map((f, i) => ({
    id: f.id || `fd-${i + 1}`,
    name: f.navn || `Fase ${i + 1}`,
    start: Math.max(0, ((f.startUke || oppstartUke) - oppstartUke) * 5),
    dur: Math.max(1, f.varighetDager || 5),
    pct: 0,
    fag: Array.isArray(f.fag) ? (f.fag[0] || 'annet') : (f.fag || 'annet'),
  }));
}

// Aktiverer et utkast: gammel plan → historikk, utkast → gjeldende plan,
// fdTasks avledes så planen vises i Framdrift-fanen og telles i «N med AI-plan».
export function beregnAktivering(prosjekt, utkast, { av, dato }) {
  const nyProsjekt = { ...prosjekt };

  // Eksisterende plan arkiveres ALLTID (aldri slettes)
  const historikk = [...(prosjekt.framdriftsplanHistorikk || [])];
  if (prosjekt.framdriftsplan) {
    historikk.push({ ...prosjekt.framdriftsplan, arkivertDato: dato, arkivertAv: av });
  } else if (Array.isArray(prosjekt.fdTasks) && prosjekt.fdTasks.length > 0) {
    historikk.push({
      fraFdTasks: true,
      fdTasks: prosjekt.fdTasks,
      fdStartWeek: prosjekt.fdStartWeek,
      fdStartYear: prosjekt.fdStartYear,
      fdTotalWeeks: prosjekt.fdTotalWeeks,
      arkivertDato: dato,
      arkivertAv: av,
    });
  }
  if (historikk.length > 0) nyProsjekt.framdriftsplanHistorikk = historikk;

  nyProsjekt.framdriftsplan = { ...utkast, status: 'aktiv', aktivertDato: dato, aktivertAv: av };
  nyProsjekt.framdriftsplanUtkast = null;

  // Avledede fdTasks så eksisterende Framdrift-side/gantt viser planen
  nyProsjekt.fdTasks = byggFdTasksFraFaser(utkast);
  nyProsjekt.fdStartWeek = utkast.oppstartUke || nyProsjekt.fdStartWeek;
  nyProsjekt.fdStartYear = utkast.oppstartAar || nyProsjekt.fdStartYear;
  nyProsjekt.fdTotalWeeks = utkast.totalVarighetUker || nyProsjekt.fdTotalWeeks;
  nyProsjekt.fdGenAv = 'AI';
  nyProsjekt.fdGenDato = dato;

  // Telleren «N med AI-plan» krever kildeTilbudData — bygg et minimum fra
  // payloaden hvis prosjektet mangler den (manuelt koblet prosjekt).
  if (!nyProsjekt.kildeTilbudData && prosjekt.tilbudPayload) {
    nyProsjekt.kildeTilbudData = {
      poster: prosjekt.tilbudPayload.poster || prosjekt.poster || [],
      timer: {},
      oppstart: prosjekt.oppstartTekst || '',
      varighet: prosjekt.varighetTekst || '',
      kundenavn: prosjekt.kunde?.navn || '',
    };
  }

  return { nyProsjekt };
}

// Forkaster utkastet — INGENTING annet endres (test-krav 7).
export function beregnForkast(prosjekt) {
  return { nyProsjekt: { ...prosjekt, framdriftsplanUtkast: null } };
}

// Liten oppsummering til «Generer utkast»-knappen: «6 poster · 238 timer · 3 fag»
export function kalkyleSammendrag(prosjekt) {
  const tp = prosjekt.tilbudPayload || {};
  const poster = (Array.isArray(tp.poster) && tp.poster.length ? tp.poster : prosjekt.poster) || [];
  let timer = 0;
  const fagSet = new Set();
  if (tp.fagBreakdown && typeof tp.fagBreakdown === 'object') {
    for (const [fag, info] of Object.entries(tp.fagBreakdown)) {
      fagSet.add(fag.toLowerCase());
      const t = typeof info === 'object' ? (info.timer ?? info.antallTimer) : info;
      timer += parseFloat(t) || 0;
    }
  }
  if (timer === 0) {
    for (const post of poster) {
      if (Array.isArray(post.kalkyle?.timer)) {
        for (const rad of post.kalkyle.timer) {
          fagSet.add((rad.fag || 'annet').toLowerCase());
          timer += parseFloat(rad.antall) || 0;
        }
      }
    }
  }
  if (timer === 0 && tp.totalTimer) timer = parseFloat(tp.totalTimer) || 0;
  return {
    poster: poster.length,
    timer: Math.round(timer),
    fag: fagSet.size,
    tekst: [
      `${poster.length} poster`,
      timer > 0 ? `${Math.round(timer)} timer` : null,
      fagSet.size > 0 ? `${fagSet.size} fag` : null,
    ].filter(Boolean).join(' · '),
  };
}

export function harKalkyle(prosjekt) {
  const s = kalkyleSammendrag(prosjekt);
  return s.poster > 0 || s.timer > 0;
}
