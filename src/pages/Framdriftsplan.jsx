import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Sparkles, X, ClipboardList, Pencil, Package, MapPin, Hammer, Rocket, Clock,
  CircleX, CircleCheck, Check, ChartGantt, CalendarDays, Pin, Plus, RefreshCw,
  Tv, Eye, Printer, Settings, FilePen, Ruler, Palette, Rainbow, HardHat,
  CircleAlert, Flame, Loader, TriangleAlert,
} from 'lucide-react';
import { Ikon, IkonTekst } from '../komponenter/Ikon';
import { varsleFramdriftEksport, erFramdriftsEndring } from '../framdriftEksportKlient';
import { useApp } from '../context/AppContext';
import { kandidatScore } from '../mergeProsjekter';
import { uid, mergeWithCloud } from '../store';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nowWeekYear() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w = new Date(d.getFullYear(), 0, 4);
  const week = 1 + Math.round(((d - w) / 86400000 - 3 + ((w.getDay() + 6) % 7)) / 7);
  return { week, year: d.getFullYear() };
}

function isoToWeekYear(iso) {
  if (!iso) return nowWeekYear();
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w = new Date(d.getFullYear(), 0, 4);
  const week = 1 + Math.round(((d - w) / 86400000 - 3 + ((w.getDay() + 6) % 7)) / 7);
  return { week, year: d.getFullYear() };
}

function wkNum(bw, by, weekOffset) {
  let w = bw + weekOffset, y = by;
  while (w > 52) { w -= 52; y++; }
  while (w < 1)  { w += 52; y--; }
  return { w, y };
}

function projStartWY(proj) {
  if (proj.fdStartWeek && proj.fdStartYear)
    return { week: proj.fdStartWeek, year: proj.fdStartYear };
  return isoToWeekYear(proj.startDato || null);
}

// Mandag i en gitt ISO-uke/år
function mondayOfWeek(week, year) {
  const jan4 = new Date(year, 0, 4);
  const dow = (jan4.getDay() + 6) % 7;            // 0=Man
  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setDate(jan4.getDate() - dow);
  const d = new Date(mondayWeek1);
  d.setDate(mondayWeek1.getDate() + (week - 1) * 7);
  return d;
}
const DAG_BOKSTAV = ['M', 'T', 'O', 'T', 'F', 'L', 'S'];

function calcAutoProgress(tasks) {
  if (!tasks || tasks.length === 0) return 0;
  return Math.round(tasks.reduce((s, t) => s + (t.pct ?? 0), 0) / tasks.length);
}

const FAG = {
  tomrer:      { label: 'Tømrer',      color: '#185FA5' },
  flis:        { label: 'Flis / mur',  color: '#BA7517' },
  elektriker:  { label: 'Elektriker',  color: '#E24B4A' },
  rorlegger:   { label: 'Rørlegger',   color: '#0F6E56' },
  ventilasjon: { label: 'Ventilasjon', color: '#7F77DD' },
  maling:      { label: 'Maling',      color: '#D4537E' },
  ferdig:      { label: 'Ferdig',      color: '#3B6D11' },
  annet:       { label: 'Annet',       color: '#888780' },
};
const fc = k => FAG[k]?.color ?? '#888780';

const STATUS_OPTIONS = ['Ikke startet', 'Pågående', 'Forsinket', 'Ferdig'];
const STATUS_COLORS  = {
  'Ikke startet': '#5d6b80',
  'Pågående':     '#2563eb',
  'Forsinket':    '#dc2626',
  'Ferdig':       '#15803d',
};

const STANDARD_FASER = [
  { name: 'Grunnarbeider',         fag: 'tomrer',     dur: 14 },
  { name: 'Råbygg / tømrerarbeid', fag: 'tomrer',     dur: 21 },
  { name: 'Tak',                   fag: 'tomrer',     dur: 7  },
  { name: 'Vinduer og dører',      fag: 'tomrer',     dur: 7  },
  { name: 'Rørlegger',             fag: 'rorlegger',  dur: 14 },
  { name: 'Elektriker',            fag: 'elektriker', dur: 14 },
  { name: 'Ventilasjon',           fag: 'ventilasjon',dur: 7  },
  { name: 'Isolasjon og gips',     fag: 'tomrer',     dur: 14 },
  { name: 'Flislegging',           fag: 'flis',       dur: 7  },
  { name: 'Maling',                fag: 'maling',     dur: 7  },
  { name: 'Ferdigstilling',        fag: 'ferdig',     dur: 7  },
];

// ─── Print (nytt vindu med ren HTML) ─────────────────────────────────────────

const FAG_COLORS_PRINT = {
  tomrer: '#185FA5', flis: '#BA7517', elektriker: '#E24B4A',
  rorlegger: '#0F6E56', ventilasjon: '#7F77DD', maling: '#D4537E',
  ferdig: '#3B6D11', annet: '#888780',
};
const FAG_LABELS_PRINT = {
  tomrer: 'Tømrer', flis: 'Flis/mur', elektriker: 'Elektriker',
  rorlegger: 'Rørlegger', ventilasjon: 'Ventilasjon', maling: 'Maling',
  ferdig: 'Ferdig', annet: 'Annet',
};

function openPrintWindow(project, status, pct) {
  const tasks     = project.fdTasks || [];
  const bw        = project.fdStartWeek || 1;
  const by        = project.fdStartYear || new Date().getFullYear();
  const totalWks  = project.fdTotalWeeks || 12;
  const totalDays = Math.max(...(tasks.length ? tasks.map(t => t.start + t.dur) : [0]), totalWks * 7);

  function wkOf(offset) {
    let w = bw + offset, y = by;
    while (w > 52) { w -= 52; y++; }
    while (w < 1)  { w += 52; y--; }
    return { w, y };
  }

  // Uke-header celler
  const wkCells = Array.from({ length: totalWks }, (_, i) => {
    const { w } = wkOf(i);
    const pctW = (100 / totalWks).toFixed(4);
    return `<div style="width:${pctW}%;flex-shrink:0;border-right:1px solid #475569;display:flex;align-items:center;padding:0 4px;font-size:9px;box-sizing:border-box;overflow:hidden;">U${w}</div>`;
  }).join('');

  // Gantt-rader
  const taskRows = tasks.map((t, i) => {
    const done  = (t.pct ?? 0) >= 100;
    const col   = FAG_COLORS_PRINT[t.fag] || '#888780';
    const lPct  = (t.start / totalDays * 100).toFixed(4);
    const wPct  = (t.dur   / totalDays * 100).toFixed(4);
    const rowBg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
    const wkBg  = Array.from({ length: totalWks }, (_, wi) =>
      `<div style="position:absolute;top:0;bottom:0;left:${(wi * 7 / totalDays * 100).toFixed(4)}%;width:${(7 / totalDays * 100).toFixed(4)}%;background:${wi % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.025)'};"></div>`
    ).join('');
    return `
<div style="display:flex;height:26px;background:${rowBg};border-bottom:1px solid #f1f5f9;">
  <div style="width:190px;flex-shrink:0;display:flex;align-items:center;padding:0 8px;border-right:2px solid #e2e8f0;gap:6px;overflow:hidden;">
    <div style="width:8px;height:8px;border-radius:50%;background:${col};flex-shrink:0;opacity:${done ? 0.35 : 1};"></div>
    <span style="font-size:10px;color:${done ? '#5d6b80' : '#1e293b'};${done ? 'text-decoration:line-through;' : ''}white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t.name}</span>
  </div>
  <div style="flex:1;position:relative;overflow:hidden;">
    ${wkBg}
    <div style="position:absolute;top:3px;bottom:3px;left:${lPct}%;width:${wPct}%;background:${col};opacity:${done ? 0.3 : 0.82};border-radius:3px;display:flex;align-items:center;padding:0 5px;overflow:hidden;">
      <span style="font-size:8px;color:white;font-weight:700;white-space:nowrap;">${done ? '&#10003;' : ''} ${t.dur}d</span>
    </div>
  </div>
</div>`;
  }).join('');

  // Faseoversikt-tabell
  const tableRows = tasks.map((t, i) => {
    const done  = (t.pct ?? 0) >= 100;
    const col   = FAG_COLORS_PRINT[t.fag] || '#888780';
    const label = FAG_LABELS_PRINT[t.fag] || t.fag;
    const bg    = i % 2 === 0 ? '#fff' : '#f8fafc';
    return `<tr style="background:${bg};">
      <td style="padding:3px 6px;border-bottom:1px solid #e2e8f0;">${i + 1}</td>
      <td style="padding:3px 6px;border-bottom:1px solid #e2e8f0;${done ? 'text-decoration:line-through;color:#5d6b80;' : ''}">${t.name}</td>
      <td style="padding:3px 6px;border-bottom:1px solid #e2e8f0;color:${col};">${label}</td>
      <td style="padding:3px 6px;border-bottom:1px solid #e2e8f0;">Dag ${t.start}</td>
      <td style="padding:3px 6px;border-bottom:1px solid #e2e8f0;">${t.dur} d</td>
      <td style="padding:3px 6px;border-bottom:1px solid #e2e8f0;color:${done ? '#15803d' : '#5d6b80'};">${done ? '&#10003; Ferdig' : t.pct > 0 ? `${t.pct}%` : '–'}</td>
    </tr>`;
  }).join('');

  const milepaler = (project.fdMilepaler || []);
  const mileHtml  = milepaler.length > 0
    ? `<div style="margin-top:10px;font-size:10px;color:#7c3aed;"><strong>Milepæler:</strong> ${milepaler.map(m => `${m.navn} (dag ${m.dagFraStart})`).join(' · ')}</div>`
    : '';

  const printDato = new Date().toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const ferdig    = tasks.filter(t => (t.pct ?? 0) >= 100).length;

  const html = `<!DOCTYPE html>
<html lang="no">
<head>
<meta charset="utf-8">
<title>Framdriftsplan — ${project.navn}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; margin: 0; color: #1e293b; background: #fff; }
</style>
</head>
<body>

<div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:10px;border-bottom:2px solid #1e293b;margin-bottom:12px;">
  <div>
    <div style="font-size:20px;font-weight:800;color:#1e293b;line-height:1.2;">${project.navn}</div>
    ${project.adresse ? `<div style="font-size:11px;color:#5d6b80;margin-top:3px;">${project.adresse}</div>` : ''}
    <div style="font-size:10px;color:#5d6b80;margin-top:5px;">
      ${project.fdStartWeek ? `Startuke: U${project.fdStartWeek}/${project.fdStartYear || ''} · ` : ''}${totalWks} uker · ${ferdig}/${tasks.length} faser fullført
    </div>
  </div>
  <div style="text-align:right;font-size:10px;color:#5d6b80;line-height:1.8;">
    <div>Skrevet ut: <strong>${printDato}</strong></div>
    <div>Status: <strong>${status}</strong></div>
    <div>Fremdrift: <strong>${pct}%</strong></div>
  </div>
</div>

<div style="-webkit-print-color-adjust:exact;print-color-adjust:exact;">
  <div style="display:flex;height:22px;background:#1e293b;color:#5d6b80;font-weight:700;letter-spacing:0.04em;">
    <div style="width:190px;flex-shrink:0;border-right:1px solid #334155;display:flex;align-items:center;padding:0 8px;font-size:10px;color:#fff;">FASE</div>
    <div style="flex:1;display:flex;overflow:hidden;">${wkCells}</div>
  </div>
  ${taskRows}
</div>

${mileHtml}

<table style="width:100%;border-collapse:collapse;margin-top:14px;font-size:10px;page-break-inside:avoid;">
  <thead>
    <tr>
      ${['#','Fase','Fag','Start dag','Varighet','Status'].map(h =>
        `<th style="background:#1e293b;color:#fff;padding:4px 6px;text-align:left;font-size:10px;">${h}</th>`
      ).join('')}
    </tr>
  </thead>
  <tbody>${tableRows}</tbody>
</table>

<script>window.onload = function() { window.print(); };</script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=1200,height=800');
  w.document.open();
  w.document.write(html);
  w.document.close();
}

// ─── GenererModal ─────────────────────────────────────────────────────────────

function GenererModal({ project, onClose, onApply }) {
  const { state } = useApp();
  const harEgenData = !!(project.kildeTilbudData || project.poster?.length);
  const [tab, setTab] = useState(harEgenData ? 'tilbud' : 'fritekst');
  const [valgtId, setValgtId] = useState(project.id);
  const [beskrivelse, setBeskrivelse] = useState('');
  const [oppstart, setOppstart] = useState(project.oppstartTekst || '');
  const [varighet, setVarighet] = useState(String(project.varighetUker || 4));
  const [mannskap, setMannskap] = useState('2');
  const [laster, setLaster] = useState(false);
  const [feil, setFeil] = useState('');
  const [preview, setPreview] = useState(null);

  const alleMedData = (state.prosjekter || []).filter(p =>
    (p.kildeTilbudData && (p.kildeTilbudData.poster?.length || Object.keys(p.kildeTilbudData.timer || {}).length)) ||
    p.poster?.length > 0
  );
  const valgtProj = alleMedData.find(p => p.id === valgtId) || alleMedData[0];
  const harEksisterende = (project.fdTasks || []).length > 0;

  async function generer() {
    setLaster(true); setFeil(''); setPreview(null);
    try {
      const token = localStorage.getItem('fbs_token') || '';
      let body;
      if (tab === 'tilbud') {
        if (!valgtProj) throw new Error('Ingen prosjekter med tilbudsdata');
        const kd = valgtProj.kildeTilbudData;
        body = {
          modus: 'fra-tilbud',
          poster: kd?.poster || valgtProj.poster || [],
          timer: kd?.timer || {},
          oppstart: kd?.oppstart || valgtProj.oppstartTekst || '',
          varighet: kd?.varighet || valgtProj.varighetTekst || '',
          adresse: valgtProj.adresse || '',
          kundenavn: valgtProj.navn || '',
        };
      } else {
        if (!beskrivelse.trim()) throw new Error('Skriv inn en beskrivelse av jobben');
        body = {
          modus: 'fri-tekst',
          beskrivelse: beskrivelse.trim(),
          oppstart: oppstart.trim(),
          varighet: parseInt(varighet) || 4,
          mannskap: parseInt(mannskap) || 2,
        };
      }
      const r = await fetch('/api/framdrift-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Feil ${r.status}`);
      setPreview(data);
    } catch (e) { setFeil(e.message); }
    finally { setLaster(false); }
  }

  const tabBtn = (key, label) => (
    <button onClick={() => setTab(key)} style={{
      padding: '10px 18px', background: 'none', border: 'none',
      borderBottom: tab === key ? '2px solid #2563eb' : '2px solid transparent',
      color: tab === key ? '#2563eb' : '#5d6b80',
      fontWeight: tab === key ? 500 : 500, cursor: 'pointer', fontSize: 13, marginBottom: -1,
    }}>{label}</button>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560, maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3><IkonTekst ikon={Sparkles} size={16}>Generer framdriftsplan med AI</IkonTekst></h3>
          <button className="btn-icon" onClick={onClose}><Ikon ikon={X} size={16} /></button>
        </div>

        {!preview ? (
          <>
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 24px' }}>
              {tabBtn('tilbud', <IkonTekst ikon={ClipboardList} size={14} gap={5}>Fra tilbudsdata{alleMedData.length === 0 ? ' (ingen)' : ''}</IkonTekst>)}
              {tabBtn('fritekst', <IkonTekst ikon={Pencil} size={14} gap={5}>Fri beskrivelse</IkonTekst>)}
            </div>

            <div style={{ padding: '20px 24px 24px', display: 'grid', gap: 16 }}>
              {tab === 'tilbud' && (alleMedData.length === 0 ? (
                <div style={{ color: '#5d6b80', fontSize: 13, textAlign: 'center', padding: 20 }}>
                  Ingen prosjekter med tilbudsdata funnet.<br />Bruk «Fri beskrivelse»-fanen i stedet.
                </div>
              ) : (
                <>
                  <div>
                    <label>Velg prosjekt med tilbudsdata</label>
                    <select className="input" value={valgtId} onChange={e => setValgtId(e.target.value)}>
                      {alleMedData.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.navn}{p.id === project.id ? ' (dette prosjektet)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  {valgtProj && (
                    <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', fontSize: 13, display: 'grid', gap: 3 }}>
                      <div style={{ fontWeight: 500, color: '#15803d', marginBottom: 2 }}><IkonTekst ikon={Package} size={14} gap={5}>Tilbudsdata</IkonTekst></div>
                      {valgtProj.adresse && <div><Ikon ikon={MapPin} size={13} style={{ marginRight: 4 }} />{valgtProj.adresse}</div>}
                      {valgtProj.estimertSum > 0 && <div>{Math.round(valgtProj.estimertSum).toLocaleString('nb-NO')} kr</div>}
                      {valgtProj.fag?.length > 0 && <div><Ikon ikon={Hammer} size={13} style={{ marginRight: 4 }} />Fag: {valgtProj.fag.join(', ')}</div>}
                      {(() => { const ant = (valgtProj.kildeTilbudData?.poster || valgtProj.poster || []).length; return ant > 0 ? <div><Ikon ikon={ClipboardList} size={13} style={{ marginRight: 4 }} />{ant} tilbudsposter</div> : null; })()}
                      {(valgtProj.kildeTilbudData?.oppstart || valgtProj.oppstartTekst) &&
                        <div><Ikon ikon={Rocket} size={13} style={{ marginRight: 4 }} />{valgtProj.kildeTilbudData?.oppstart || valgtProj.oppstartTekst}</div>}
                      {(valgtProj.kildeTilbudData?.varighet || valgtProj.varighetTekst) &&
                        <div><Ikon ikon={Clock} size={13} style={{ marginRight: 4 }} />{valgtProj.kildeTilbudData?.varighet || valgtProj.varighetTekst}</div>}
                    </div>
                  )}
                </>
              ))}

              {tab === 'fritekst' && (
                <>
                  <div>
                    <label>Beskriv jobben kort *</label>
                    <textarea className="input" rows={4} value={beskrivelse}
                      onChange={e => setBeskrivelse(e.target.value)}
                      placeholder={'Eksempler:\n• Bad 6 m² og kjøkken-renovering 12 m²\n• Tilbygg 50 m² med skifertak og 3 vinduer\n• Rehab kjeller: pigging, drening, bad 8 m²'} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <div>
                      <label>Oppstart</label>
                      <input className="input" value={oppstart} onChange={e => setOppstart(e.target.value)} placeholder="uke 31" />
                    </div>
                    <div>
                      <label>Varighet (uker)</label>
                      <input type="number" min={1} max={52} className="input" value={varighet} onChange={e => setVarighet(e.target.value)} />
                    </div>
                    <div>
                      <label>Mannskap</label>
                      <input type="number" min={1} max={20} className="input" value={mannskap} onChange={e => setMannskap(e.target.value)} />
                    </div>
                  </div>
                </>
              )}

              {feil && (
                <div style={{ color: '#dc2626', fontSize: 13, padding: '8px 12px', background: '#fef2f2', borderRadius: 6 }}><Ikon ikon={CircleX} size={14} style={{ marginRight: 4 }} />{feil}</div>
              )}

              <div className="modal-actions">
                <button className="btn" onClick={onClose}>Avbryt</button>
                <button className="btn btn-primary" onClick={generer}
                  disabled={laster || (tab === 'tilbud' && !valgtProj) || (tab === 'fritekst' && !beskrivelse.trim())}>
                  {laster ? <><span className="fd2-spinner" /> Genererer…</> : <IkonTekst ikon={Sparkles} size={14} gap={5}>Generer →</IkonTekst>}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ padding: '20px 24px 24px', display: 'grid', gap: 16 }}>
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '12px 16px' }}>
              <div style={{ fontWeight: 500, color: '#15803d', marginBottom: 6 }}><IkonTekst ikon={CircleCheck} size={15} gap={5}>Plan generert!</IkonTekst></div>
              <div style={{ fontSize: 13, color: '#374151', display: 'grid', gap: 3 }}>
                <div><Ikon ikon={ChartGantt} size={13} style={{ marginRight: 4 }} /><strong>{preview.fdTasks?.length} faser</strong></div>
                <div><Ikon ikon={CalendarDays} size={13} style={{ marginRight: 4 }} />Startuke: <strong>U{preview.fdStartWeek}/{preview.fdStartYear}</strong></div>
                <div><Ikon ikon={Clock} size={13} style={{ marginRight: 4 }} />Varighet: <strong>{preview.fdTotalWeeks} uker</strong></div>
                {preview.milepaler?.length > 0 && <div><Ikon ikon={Pin} size={13} style={{ marginRight: 4 }} />{preview.milepaler.length} milepæler</div>}
              </div>
            </div>

            <div style={{ maxHeight: 240, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              {(preview.fdTasks || []).map((t, i) => (
                <div key={t.id || i} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px',
                  borderBottom: i < (preview.fdTasks?.length ?? 0) - 1 ? '1px solid #f1f5f9' : 'none', fontSize: 12,
                }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: fc(t.fag), flexShrink: 0 }} />
                  <span style={{ flex: 1, fontWeight: 500, color: '#1e293b' }}>{t.name}</span>
                  <span style={{ color: '#5d6b80', whiteSpace: 'nowrap' }}>{t.dur}d · dag {t.start}</span>
                  <span style={{ color: FAG[t.fag]?.color || '#888', fontSize: 10, minWidth: 60, textAlign: 'right' }}>{FAG[t.fag]?.label || t.fag}</span>
                </div>
              ))}
            </div>

            <div className="modal-actions" style={{ flexWrap: 'wrap', gap: 8 }}>
              <button className="btn" onClick={() => { setPreview(null); setFeil(''); }}>← Tilbake</button>
              <button className="btn" onClick={onClose}>Avbryt</button>
              {harEksisterende && (
                <button className="btn" style={{ borderColor: '#b45309', color: '#b45309' }}
                  onClick={() => onApply({ ...preview, replace: false })}>
                  <IkonTekst ikon={Plus} size={14} gap={4}>Legg til i eksisterende</IkonTekst>
                </button>
              )}
              <button className="btn btn-primary"
                onClick={() => {
                  if (harEksisterende && !window.confirm('Erstatte eksisterende framdriftsplan?')) return;
                  onApply({ ...preview, replace: true });
                }}>
                {harEksisterende ? <IkonTekst ikon={RefreshCw} size={14} gap={4}>Erstatt plan</IkonTekst> : <IkonTekst ikon={CircleCheck} size={14} gap={4}>Bruk denne planen</IkonTekst>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── AI regenerering ──────────────────────────────────────────────────────────

function useFramdriftAI(project, onUpdate) {
  const [laster, setLaster] = useState(false);
  const [feil, setFeil] = useState('');

  async function regenererMedAI() {
    setLaster(true); setFeil('');
    try {
      const token = localStorage.getItem('fbs_token') || '';
      const r = await fetch('/api/framdrift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ regenerer: true, prosjektId: project.id }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Feil ${r.status}`);
      onUpdate({
        fdTasks: data.fdTasks,
        fdStartWeek:  data.fdStartWeek  || project.fdStartWeek,
        fdStartYear:  data.fdStartYear  || project.fdStartYear,
        fdTotalWeeks: data.fdTotalWeeks || project.fdTotalWeeks,
        fdMilepaler:  data.milepaler,
        fdGenDato:    new Date().toISOString(),
        fdGenAv:      'AI',
      });
    } catch (e) { setFeil(e.message); }
    finally { setLaster(false); }
  }

  return { laster, feil, regenererMedAI };
}

// ─── GanttChart ───────────────────────────────────────────────────────────────

function GanttChart({ project, onUpdate, readOnly = false }) {
  const [tasks, setTasks]     = useState(project.fdTasks || []);
  const [zoom, setZoom]       = useState(1);
  const [newTask, setNewTask] = useState('');
  const [newFag, setNewFag]   = useState('tomrer');
  const [dropIdx, setDropIdx] = useState(null);
  const [timeMode, setTimeMode] = useState('uke');           // 'dag' | 'uke'
  const dayView = timeMode === 'dag';
  const [storskjerm, setStorskjerm] = useState(false);       // fullskjerm-visning for TV/projektor
  const [editingTaskId, setEditingTaskId] = useState(null);  // redigerer fase-navn inline
  const [colColors, setColColors] = useState(project.fdColColors || {});  // { colIdx: '#rrggbb' }
  const [pickerTaskId, setPickerTaskId] = useState(null);   // id for fargevalgsdialog
  const [pickerMode, setPickerMode]     = useState('bar');  // 'bar' | 'row'
  const drag       = useRef(null);
  const rowDragRef = useRef(null);
  const tasksRef   = useRef(tasks);

  // ── Lane/rad-beregning (aktiviteter på samme linje) ───────────────────────
  // lane = t.lane ?? index — tasks med samme lane-verdi deler visuell rad
  const { laneOf, rowCount, rowOfTask } = useMemo(() => {
    const laneOf      = tasks.map((t, i) => t.lane ?? i);
    const uniqueLanes = [];
    const seenL       = new Set();
    laneOf.forEach(l => { if (!seenL.has(l)) { uniqueLanes.push(l); seenL.add(l); } });
    const rowCount    = uniqueLanes.length;
    const rowOfTask   = laneOf.map(l => uniqueLanes.indexOf(l)); // visual row index per task
    return { laneOf, rowCount, rowOfTask };
  }, [tasks]);

  const COL_CYCLE = ['rgba(250,204,21,.28)', 'rgba(134,239,172,.28)', 'rgba(147,197,253,.28)', 'rgba(249,168,212,.28)'];
  const SWATCH_COLORS = ['#185FA5','#E24B4A','#0F6E56','#D4537E','#7F77DD','#BA7517','#15803d','#5d6b80','#ea580c','#0891b2'];

  useEffect(() => {
    setTasks(project.fdTasks || []);
    tasksRef.current = project.fdTasks || [];
  }, [project.id]);

  const { week: bw, year: by } = projStartWY(project);
  const startMonday = mondayOfWeek(bw, by);   // faktisk dato for dag 0
  const datoForDag = (d) => { const x = new Date(startMonday); x.setDate(startMonday.getDate() + d); return x; };
  const totalWeeks = project.fdTotalWeeks || 12;
  const totalDays  = Math.max(
    ...(tasks.length ? tasks.map(t => t.start + t.dur) : [0]),
    totalWeeks * 7
  );

  const ROW = storskjerm ? 52 : 38, PAD = storskjerm ? 320 : 280;
  const MILE_H = (project.fdMilepaler?.length > 0) ? (storskjerm ? 28 : 22) : 0;
  const TASK_TOP = 40 + MILE_H;
  // Dag-modus: bredere dager (som mannskapsplan). Storskjerm: enda bredere.
  const dagBredde = storskjerm ? 38 : 28;       // px per dag i dag-visning
  const ukeBredde = storskjerm ? 24 : 18;       // px per dag i uke-visning
  const basisBredde = dayView ? dagBredde : ukeBredde;
  const chartW = Math.max(totalDays * basisBredde, 580) * zoom;
  const dw     = chartW / totalDays;
  const svgH   = Math.max(rowCount * ROW + TASK_TOP + 16, 80);

  const weeks = [];
  for (let d = 0; d < totalDays; d += 7) weeks.push(d);
  // Dag-visning: alle individuelle dager
  const allDays = dayView ? Array.from({ length: totalDays }, (_, d) => d) : [];

  const yearBands = [];
  weeks.forEach(d => {
    const { y } = wkNum(bw, by, Math.round(d / 7));
    const last = yearBands[yearBands.length - 1];
    if (!last || last.y !== y) yearBands.push({ y, s: d, e: d + 7 });
    else last.e = d + 7;
  });

  const { week: nowWk, year: nowYr } = nowWeekYear();
  const noff = (nowYr * 52 + nowWk) - (by * 52 + bw);
  const nowX = (noff >= 0 && noff * 7 <= totalDays) ? noff * 7 * dw : null;

  const save = (next, nextCols) => {
    if (readOnly) return;
    tasksRef.current = next; setTasks(next);
    const autoPct = calcAutoProgress(next);
    onUpdate({ fdTasks: next, fdColColors: nextCols ?? colColors, ...(autoPct !== null ? { fdProgress: autoPct } : {}) });
  };
  const saveCols = nc => { if (readOnly) return; setColColors(nc); onUpdate({ fdColColors: nc }); };

  // Hent x-koordinat fra både mus og touch
  const getClientX = e => (e.touches?.[0]?.clientX ?? e.changedTouches?.[0]?.clientX ?? e.clientX);

  const onMouseMove = e => {
    if (!drag.current) return;
    if (e.touches) e.preventDefault?.();  // hindre scroll under drag på iPad
    const { tid, type, sx, os, od } = drag.current;
    const dx = Math.round((getClientX(e) - sx) / dw);
    setTasks(prev => {
      const next = prev.map(t => {
        if (t.id !== tid) return t;
        if (type === 'move')   return { ...t, start: Math.max(0, os + dx) };
        if (type === 'resize') return { ...t, dur:   Math.max(1, od + dx) };
        return t;
      });
      tasksRef.current = next; return next;
    });
  };

  const onMouseUp = () => {
    if (drag.current) {
      drag.current = null;
      const autoPct = calcAutoProgress(tasksRef.current);
      onUpdate({ fdTasks: tasksRef.current, ...(autoPct !== null ? { fdProgress: autoPct } : {}) });
    }
    if (rowDragRef.current !== null) { rowDragRef.current = null; setDropIdx(null); }
  };

  const startDrag = (e, tid, type) => {
    if (readOnly) return;
    e.stopPropagation();
    if (!e.touches) e.preventDefault();
    const t = tasks.find(t => t.id === tid);
    drag.current = { tid, type, sx: getClientX(e), os: t.start, od: t.dur };
  };

  const toggleDone = (e, tid) => {
    e.stopPropagation();
    save(tasks.map(t => t.id === tid ? { ...t, pct: (t.pct ?? 0) >= 100 ? 0 : 100 } : t));
  };

  const setPct = (tid, pct) => {
    const clamped = Math.max(0, Math.min(100, Math.round(pct)));
    save(tasks.map(t => t.id === tid ? { ...t, pct: clamped } : t));
  };

  const deleteTask = id => save(tasks.filter(t => t.id !== id));

  const addTask = () => {
    if (!newTask.trim()) return;
    const end = tasks.length ? Math.max(...tasks.map(t => t.start + t.dur)) : 0;
    save([...tasks, { id: uid(), name: newTask, start: end, dur: 7, pct: 0, fag: newFag }]);
    setNewTask('');
  };

  const addStandardFaser = () => {
    const existing = new Set(tasks.map(t => t.name));
    const toAdd = STANDARD_FASER.filter(f => !existing.has(f.name));
    if (!toAdd.length) return;
    let cursor = tasks.length ? Math.max(...tasks.map(t => t.start + t.dur)) : 0;
    const newTasks = toAdd.map(f => {
      const t = { id: uid(), name: f.name, start: cursor, dur: f.dur, pct: 0, fag: f.fag };
      cursor += f.dur; return t;
    });
    save([...tasks, ...newTasks]);
  };

  return (
    <div style={storskjerm ? { position: 'fixed', inset: 0, zIndex: 300, background: '#fff', overflow: 'auto', padding: '8px 12px' } : undefined}>
      {storskjerm && (
        <div style={{ position: 'fixed', top: 8, right: 14, zIndex: 400, display: 'flex', gap: 4, alignItems: 'center', background: '#1e293b', color: '#fff', borderRadius: 10, padding: '5px 10px', opacity: 0.92 }}>
          <span style={{ fontSize: 13, fontWeight: 500, marginRight: 8 }}><IkonTekst ikon={Tv} size={14} gap={5}>{project.navn || 'Framdriftsplan'}</IkonTekst></span>
          <button onClick={() => setZoom(z => Math.max(0.3, +(z - 0.2).toFixed(1)))}
            style={{ background: 'none', border: '1px solid rgba(255,255,255,.3)', borderRadius: 6, color: '#fff', fontSize: 16, fontWeight: 500, cursor: 'pointer', padding: '1px 9px' }}>−</button>
          <span style={{ fontSize: 12, fontWeight: 500, minWidth: 40, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(4, +(z + 0.2).toFixed(1)))}
            style={{ background: 'none', border: '1px solid rgba(255,255,255,.3)', borderRadius: 6, color: '#fff', fontSize: 16, fontWeight: 500, cursor: 'pointer', padding: '1px 9px' }}>＋</button>
          <div className="ukemode-toggle" style={{ marginLeft: 6 }}>
            <button className={`ukemode-btn ${timeMode === 'uke' ? 'active' : ''}`} onClick={() => setTimeMode('uke')}>Uker</button>
            <button className={`ukemode-btn ${timeMode === 'dag' ? 'active' : ''}`} onClick={() => setTimeMode('dag')}>Dager</button>
          </div>
          <button onClick={() => setStorskjerm(false)}
            style={{ background: 'none', border: '1px solid rgba(255,255,255,.4)', borderRadius: 6, color: '#fff', fontSize: 13, cursor: 'pointer', padding: '3px 12px', marginLeft: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Ikon ikon={X} size={13} /> Lukk</button>
        </div>
      )}
      {tasks.length === 0 && (
        <div className="fd2-tom-gantt">
          <span>Ingen faser lagt til ennå.</span>
          <button className="btn btn-primary btn-sm" onClick={addStandardFaser}>
            <IkonTekst ikon={Plus} size={14} gap={4}>Legg til standard byggefaser</IkonTekst>
          </button>
        </div>
      )}

      <div className="fd2-gantt-toolbar" style={storskjerm ? { display: 'none' } : undefined}>
        <span style={{ fontSize: 12, color: '#5d6b80', fontWeight: 500 }}>Zoom:</span>
        <button className="fd2-zoom-btn" onClick={() => setZoom(z => Math.max(0.3, +(z - 0.2).toFixed(1)))}>−</button>
        <span className="fd2-zoom-pct">{Math.round(zoom * 100)}%</span>
        <button className="fd2-zoom-btn" onClick={() => setZoom(z => Math.min(4, +(z + 0.2).toFixed(1)))}>+</button>
        <button className="fd2-zoom-btn" onClick={() => setZoom(1)} style={{ fontSize: 10, width: 'auto', padding: '0 8px' }}>Reset</button>
        <div className="ukemode-toggle" style={{ marginLeft: 4 }}>
          <button className={`ukemode-btn ${timeMode === 'uke' ? 'active' : ''}`} onClick={() => setTimeMode('uke')}>Uker</button>
          <button className={`ukemode-btn ${timeMode === 'dag' ? 'active' : ''}`} onClick={() => setTimeMode('dag')}>Dager</button>
        </div>
        <button className="btn btn-sm" style={{ marginLeft: 4 }} onClick={() => setStorskjerm(true)}
          title="Storskjerm – stor visning for TV/projektor">
          <IkonTekst ikon={Tv} size={14} gap={5}>Storskjerm</IkonTekst>
        </button>
        {tasks.length > 0 && !readOnly && (
          <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={addStandardFaser}>
            + Standardfaser
          </button>
        )}
        <div className="fd2-fag-legend">
          {Object.entries(FAG).filter(([k]) => k !== 'annet').map(([k, v]) => (
            <span key={k} className="fd2-fag-chip" style={{ background: v.color + '1a', color: v.color, border: `1px solid ${v.color}55` }}>
              {v.label}
            </span>
          ))}
        </div>
      </div>

      <div className="fd2-gantt-wrap">
        <div className="fd2-gantt-left" style={{ width: PAD }}>
          <svg width={PAD} height={svgH} viewBox={`0 0 ${PAD} ${svgH}`} style={{ display: 'block' }}>
            <rect x={0} y={0} width={PAD} height={40} fill="#f8fafc" />
            <text x={10} y={26} fontSize={11} fontWeight="500" fill="#5d6b80">Fase</text>
            <text x={PAD - 132} y={26} fontSize={10} fill="#5d6b80" textAnchor="middle">Lengde</text>
            <text x={PAD - 91} y={26} fontSize={10} fill="#5d6b80" textAnchor="middle">Ferdig</text>
            <text x={PAD - 34} y={26} fontSize={10} fill="#5d6b80" textAnchor="middle">{'\u2713'}</text>
            {MILE_H > 0 && (
              <rect x={0} y={40} width={PAD} height={MILE_H} fill="#faf5ff" />
            )}
            {tasks.map((t, i) => {
              const y = rowOfTask[i] * ROW + TASK_TOP;
              const done = (t.pct ?? 0) >= 100;
              const barCol = t.customColor || fc(t.fag);
              const rowBg = t.rowColor || (done ? '#f0fdf4' : rowOfTask[i] % 2 === 0 ? '#fff' : '#fafafa');
              return (
                <g key={t.id}
                  onMouseDown={() => { rowDragRef.current = i; }}
                  onMouseEnter={() => { if (rowDragRef.current !== null && rowDragRef.current !== i) setDropIdx(i); }}
                  onMouseUp={() => {
                    if (rowDragRef.current !== null && rowDragRef.current !== i) {
                      const n = [...tasks]; const [m] = n.splice(rowDragRef.current, 1); n.splice(i, 0, m); save(n);
                    }
                    rowDragRef.current = null; setDropIdx(null);
                  }}>
                  <title>{t.name} — klikk fargesirkelen for å endre farge</title>
                  {dropIdx === i && <rect x={0} y={y} width={PAD} height={2} fill="#2563eb" />}
                  <rect x={0} y={y} width={PAD} height={ROW} fill={rowBg} />
                  {/* Farge-dot: klikk for å velge farge (tydelig klikkbar med ring) */}
                  <g className="fd2-g-ctrl" style={{ cursor: 'pointer' }}
                    onClick={e => { e.stopPropagation(); setPickerMode('bar'); setPickerTaskId(pickerTaskId === t.id ? null : t.id); }}>
                    <circle cx={13} cy={y + ROW / 2} r={9} fill="#fff" stroke={pickerTaskId === t.id && pickerMode === 'bar' ? '#2563eb' : '#e2e8f0'} strokeWidth={1.5} />
                    <circle cx={13} cy={y + ROW / 2} r={6} fill={barCol} opacity={done ? 0.5 : 1} />
                    {t.customColor && <circle cx={19} cy={y + ROW / 2 - 6} r={2.5} fill="#2563eb" stroke="#fff" strokeWidth={1} />}
                  </g>
                  {/* Rad-farge-dot (lang-klikk / shift+klikk) */}
                  <rect x={0} y={y} width={4} height={ROW}
                    fill={t.rowColor || 'transparent'} rx={0}
                    className="fd2-g-ctrl" style={{ cursor: 'pointer' }}
                    onClick={e => { e.stopPropagation(); setPickerMode('row'); setPickerTaskId(pickerTaskId === t.id ? null : t.id); }}
                    title="Klikk for å sette radfarge" />
                  <clipPath id={`nc${t.id}`}><rect x={24} y={y} width={PAD - 158} height={ROW} /></clipPath>
                  {editingTaskId === t.id ? (
                    <foreignObject x={22} y={y + 6} width={PAD - 160} height={ROW - 12}>
                      <input
                        autoFocus
                        defaultValue={t.name}
                        style={{ width: '100%', height: '100%', border: '1.5px solid #3b82f6', borderRadius: 5, padding: '2px 6px', fontSize: 12, outline: 'none', background: '#fff' }}
                        onBlur={e => { save(tasks.map(tt => tt.id === t.id ? { ...tt, name: e.target.value.trim() || tt.name } : tt)); setEditingTaskId(null); }}
                        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingTaskId(null); }}
                        onClick={e => e.stopPropagation()}
                      />
                    </foreignObject>
                  ) : (
                    <text x={26} y={y + ROW / 2 + 5} fontSize={12} fill={done ? '#5d6b80' : '#1e293b'}
                      style={{ userSelect: 'none', textDecoration: done ? 'line-through' : 'none', cursor: 'text' }}
                      clipPath={`url(#nc${t.id})`}
                      onDoubleClick={e => { e.stopPropagation(); setEditingTaskId(t.id); }}>
                      {t.name.length > 20 ? t.name.slice(0, 19) + '…' : t.name}
                    </text>
                  )}
                  {/* Lengde/varighet (klikkbar) */}
                  <g className="fd2-g-ctrl" style={{ cursor: 'pointer' }}
                    onClick={e => { e.stopPropagation(); setPickerMode('lengde'); setPickerTaskId(pickerTaskId === t.id ? null : t.id); }}>
                    <rect x={PAD - 152} y={y + ROW / 2 - 9} width={40} height={18} rx={5}
                      fill="#f1f5f9" stroke="#e2e8f0" strokeWidth={1} />
                    <text x={PAD - 132} y={y + ROW / 2 + 4} fontSize={10} fontWeight="500" textAnchor="middle"
                      fill="#475569" style={{ userSelect: 'none', pointerEvents: 'none' }}>
                      {t.dur}d
                    </text>
                  </g>
                  {/* Fremdrift-prosent (klikkbar) */}
                  <g className="fd2-g-ctrl" style={{ cursor: 'pointer' }}
                    onClick={e => { e.stopPropagation(); setPickerMode('pct'); setPickerTaskId(pickerTaskId === t.id ? null : t.id); }}>
                    <rect x={PAD - 110} y={y + ROW / 2 - 9} width={38} height={18} rx={9}
                      fill={done ? '#15803d' : (t.pct ?? 0) > 0 ? '#dbeafe' : '#f1f5f9'} />
                    <text x={PAD - 91} y={y + ROW / 2 + 4} fontSize={10} fontWeight="500" textAnchor="middle"
                      fill={done ? '#fff' : (t.pct ?? 0) > 0 ? '#1d4ed8' : '#5d6b80'}
                      style={{ userSelect: 'none', pointerEvents: 'none' }}>
                      {t.pct ?? 0}%
                    </text>
                  </g>
                  {/* Merge/split rad-knapper */}
                  {i > 0 && <text x={PAD - 70} y={y + ROW / 2 + 4} fontSize={10} fill="#cbd5e1"
                    className="fd2-g-ctrl" style={{ cursor: 'pointer', userSelect: 'none' }}
                    title="Slå sammen med raden over"
                    onClick={e => { e.stopPropagation(); save(tasks.map((tt, ii) => ii === i ? { ...tt, lane: laneOf[i - 1] } : tt)); }}>⇑</text>}
                  {laneOf[i] === laneOf[i] && tasks.some((tt, ii) => ii !== i && laneOf[ii] === laneOf[i]) && (
                    <text x={PAD - 70} y={y + ROW / 2 + 14} fontSize={10} fill="#b45309"
                      className="fd2-g-ctrl" style={{ cursor: 'pointer', userSelect: 'none' }}
                      title="Skill ut på egen rad"
                      onClick={e => { e.stopPropagation(); save(tasks.map((tt, ii) => ii === i ? { ...tt, lane: Date.now() + ii } : tt)); }}>⇓</text>
                  )}
                  <text x={PAD - 54} y={y + ROW / 2 + 5} fontSize={11} fill="#cbd5e1"
                    className="fd2-g-ctrl" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => deleteTask(t.id)}>{'\u2715'}</text>
                  <rect x={PAD - 36} y={y + ROW / 2 - 9} width={18} height={18} rx={4}
                    className="fd2-g-ctrl"
                    fill={done ? '#15803d' : '#fff'} stroke={done ? '#15803d' : '#e2e8f0'} strokeWidth={1.5}
                    style={{ cursor: 'pointer' }} onClick={e => toggleDone(e, t.id)} />
                  {done && (
                    <text x={PAD - 27} y={y + ROW / 2 + 5} fontSize={13} fill="#fff" textAnchor="middle"
                      className="fd2-g-ctrl" style={{ pointerEvents: 'none', userSelect: 'none' }}>{'\u2713'}</text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        <div className="fd2-gantt-right" onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
          onTouchMove={onMouseMove} onTouchEnd={onMouseUp} style={{ touchAction: 'pan-y' }}>
          <svg width={chartW} height={svgH} viewBox={`0 0 ${chartW} ${svgH}`} style={{ display: 'block', userSelect: 'none' }}>
            {yearBands.map(b => (
              <g key={b.y}>
                <rect x={b.s * dw} y={0} width={(b.e - b.s) * dw} height={20} fill={b.y % 2 === 0 ? '#f1f5f9' : '#e9eef5'} />
                <text x={b.s * dw + 6} y={14} fontSize={11} fontWeight="500" fill="#475569">{b.y}</text>
              </g>
            ))}
            {MILE_H > 0 && (
              <rect x={0} y={40} width={chartW} height={MILE_H} fill="#faf5ff" />
            )}
            {/* Rad-bakgrunnsfarger (høyre panel) */}
            {tasks.map((t, i) => t.rowColor ? (
              <rect key={'rbg' + t.id} x={0} y={rowOfTask[i] * ROW + TASK_TOP} width={chartW} height={ROW}
                fill={t.rowColor} opacity={0.22} style={{ pointerEvents: 'none' }} />
            ) : null)}

            {/* Dagvisning: individuelle dager med dato + helge-markering (som mannskapsplan) */}
            {dayView ? allDays.map(d => {
              const dato = datoForDag(d);
              const realDow = (dato.getDay() + 6) % 7; // 0=Man … 6=Søn
              const erHelg = realDow === 5 || realDow === 6;
              const erManved = realDow === 0;          // mandag = uke-start
              const { w } = wkNum(bw, by, Math.floor(d / 7));
              const datoTxt = `${dato.getDate()}.${dato.getMonth() + 1}`;
              return (
                <g key={'day' + d}>
                  <rect x={d * dw} y={TASK_TOP} width={dw} height={svgH - TASK_TOP}
                    fill={erHelg ? 'rgba(148,163,184,.22)' : 'transparent'} />
                  <line x1={d * dw} y1={20} x2={d * dw} y2={svgH}
                    stroke={erManved ? '#cbd5e1' : erHelg ? '#cbd5e1' : '#f1f5f9'}
                    strokeWidth={erManved ? 1 : 0.5} />
                  {erManved && (
                    <text x={d * dw + 3} y={20 + 11} fontSize={storskjerm ? 11 : 9} fontWeight="500" fill="#2563eb">U{w}</text>
                  )}
                  <text x={d * dw + dw / 2} y={TASK_TOP - 12} fontSize={storskjerm ? 12 : 10}
                    fontWeight={erHelg ? 400 : 500} fill={erHelg ? '#5d6b80' : '#475569'} textAnchor="middle">
                    {DAG_BOKSTAV[realDow]}
                  </text>
                  <text x={d * dw + dw / 2} y={TASK_TOP - 2} fontSize={storskjerm ? 10 : 8}
                    fill={erHelg ? '#cbd5e1' : '#5d6b80'} textAnchor="middle">
                    {datoTxt}
                  </text>
                </g>
              );
            }) : weeks.map((d, i) => {
              const { w } = wkNum(bw, by, Math.round(d / 7));
              const cc = colColors[String(i)];
              return (
                <g key={d}>
                  <rect x={d * dw} y={TASK_TOP} width={7 * dw} height={svgH - TASK_TOP}
                    fill={cc || (i % 2 === 0 ? 'rgba(0,0,0,0.01)' : 'rgba(0,0,0,0.03)')} />
                  <line x1={d * dw} y1={20} x2={d * dw} y2={svgH} stroke="#e2e8f0" strokeWidth={0.5} />
                  <text x={d * dw + 4} y={33} fontSize={10} fill="#5d6b80"
                    style={{ cursor: 'pointer' }}
                    title="Klikk for å farge kolonnen"
                    onClick={() => {
                      const key = String(i)
                      const cur = colColors[key]
                      const next = { ...colColors }
                      const idx = COL_CYCLE.indexOf(cur)
                      if (idx === COL_CYCLE.length - 1 || idx < 0 && cur) delete next[key]
                      else next[key] = COL_CYCLE[(idx + 1) % COL_CYCLE.length]
                      saveCols(next)
                    }}>U{w}</text>
                </g>
              );
            })}

            {tasks.map((t, i) => {
              const x  = t.start * dw;
              const w  = Math.max(t.dur * dw - 2, 6);
              const y  = rowOfTask[i] * ROW + TASK_TOP;
              const pct = t.pct ?? 0;
              const done = pct >= 100;
              const col  = t.customColor || fc(t.fag);
              return (
                <g key={t.id}>
                  <title>{t.name} · {t.dur} dager — dra for å flytte, eller dobbeltklikk for å skrive inn lengde</title>
                  <rect x={x} y={y + 6} width={w} height={22} rx={5} fill={col} opacity={done ? 0.2 : 0.35}
                    style={{ cursor: 'grab' }}
                    onMouseDown={e => startDrag(e, t.id, 'move')}
                    onTouchStart={e => startDrag(e, t.id, 'move')}
                    onDoubleClick={e => { e.stopPropagation(); setPickerMode('lengde'); setPickerTaskId(t.id); }} />
                  {w * pct / 100 > 0 && (
                    <rect x={x} y={y + 6} width={w * pct / 100} height={22} rx={5} fill={col} opacity={done ? 0.65 : 0.85}
                      style={{ pointerEvents: 'none' }} />
                  )}
                  <clipPath id={`bc${t.id}`}><rect x={x + 4} y={y + 6} width={Math.max(w - 22, 0)} height={22} /></clipPath>
                  <text x={x + 6} y={y + 21} fontSize={10} fill="white" fontWeight="500"
                    style={{ pointerEvents: 'none' }} clipPath={`url(#bc${t.id})`}>{t.dur}d</text>
                  {done && w > 24 && (
                    <text x={x + w / 2} y={y + 21} fontSize={12} fill="white" textAnchor="middle"
                      style={{ pointerEvents: 'none' }}>{'\u2713'}</text>
                  )}
                  {/* Resize-håndtak — bredere tap-target for iPad */}
                  <rect x={x + w - 12} y={y + 6} width={14} height={22} fill="rgba(0,0,0,0.15)" rx={3}
                    style={{ cursor: 'ew-resize' }}
                    onMouseDown={e => startDrag(e, t.id, 'resize')}
                    onTouchStart={e => startDrag(e, t.id, 'resize')} />
                  <text x={x + w - 5} y={y + 21} fontSize={11} fill="rgba(255,255,255,.85)" textAnchor="middle"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}>⟺</text>
                </g>
              );
            })}
            {nowX !== null && (
              <g>
                <line x1={nowX} y1={20} x2={nowX} y2={svgH} stroke="#dc2626" strokeWidth={2} strokeDasharray="4 3" />
                <rect x={nowX - 16} y={21} width={32} height={16} rx={4} fill="#dc2626" />
                <text x={nowX} y={33} fontSize={10} fontWeight="500" fill="white" textAnchor="middle">U{nowWk}</text>
              </g>
            )}
            {MILE_H > 0 && (project.fdMilepaler || []).map((m, mi) => {
              const mx = (m.dagFraStart || 0) * dw;
              return (
                <g key={mi}>
                  <line x1={mx} y1={40} x2={mx} y2={svgH} stroke="#7c3aed" strokeWidth={1} strokeDasharray="3 3" opacity={0.4} />
                  <polygon points={`${mx},${40+MILE_H-2} ${mx-4},${40+4} ${mx+4},${40+4}`} fill="#7c3aed" opacity={0.8} />
                  <text x={mx + 5} y={40 + MILE_H - 5} fontSize={8} fill="#7c3aed" fontWeight="500"
                    style={{ userSelect: 'none', pointerEvents: 'none' }}>
                    d{m.dagFraStart}
                  </text>
                  <title>{m.navn} · dag {m.dagFraStart}</title>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Popup for farge (bar/rad), fremdrift-prosent og lengde */}
      {pickerTaskId && (() => {
        const t = tasks.find(x => x.id === pickerTaskId)
        if (!t) return null
        const isModeRow = pickerMode === 'row'
        const isModePct = pickerMode === 'pct'
        const isModeLengde = pickerMode === 'lengde'

        // ── Lengde-velger (varighet + startdag, iPad-vennlig) ──
        if (isModeLengde) {
          const start = t.start ?? 0
          const dur = t.dur ?? 1
          const setStart = v => save(tasks.map(tt => tt.id === t.id ? { ...tt, start: Math.max(0, Math.round(v)) } : tt))
          const setDur   = v => save(tasks.map(tt => tt.id === t.id ? { ...tt, dur: Math.max(1, Math.round(v)) } : tt))
          const Knapp = ({ onClick, children }) => (
            <button onClick={onClick}
              style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid rgba(255,255,255,.3)', background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 18, fontWeight: 500, cursor: 'pointer' }}>{children}</button>
          )
          return (
            <div style={{ position: 'relative', zIndex: 50, margin: '4px 0' }} onClick={e => e.stopPropagation()}>
              <div style={{ background: '#1e293b', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 12, color: '#5d6b80' }}>
                  <Ikon ikon={Ruler} size={13} style={{ marginRight: 4 }} />Lengde: <strong style={{ color: '#e2e8f0' }}>{t.name.slice(0, 28)}</strong>
                </div>
                {/* Varighet */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: '#cbd5e1', width: 70 }}>Varighet:</span>
                  <Knapp onClick={() => setDur(dur - 1)}>−</Knapp>
                  <input type="number" min={1} value={dur}
                    onChange={e => setDur(parseInt(e.target.value || '1', 10))}
                    style={{ width: 64, height: 34, textAlign: 'center', fontSize: 15, fontWeight: 500, border: 'none', borderRadius: 8 }} />
                  <span style={{ fontSize: 13, color: '#5d6b80' }}>dager</span>
                  <Knapp onClick={() => setDur(dur + 1)}>+</Knapp>
                  <span style={{ fontSize: 11, color: '#5d6b80', marginLeft: 4 }}>({(dur / 7).toFixed(1)} uker)</span>
                  <Knapp onClick={() => setDur(dur + 7)}>+uke</Knapp>
                </div>
                {/* Startdag */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: '#cbd5e1', width: 70 }}>Start dag:</span>
                  <Knapp onClick={() => setStart(start - 1)}>−</Knapp>
                  <input type="number" min={0} value={start}
                    onChange={e => setStart(parseInt(e.target.value || '0', 10))}
                    style={{ width: 64, height: 34, textAlign: 'center', fontSize: 15, fontWeight: 500, border: 'none', borderRadius: 8 }} />
                  <Knapp onClick={() => setStart(start + 1)}>+</Knapp>
                  <span style={{ fontSize: 11, color: '#5d6b80', marginLeft: 4 }}>{datoForDag(start).getDate()}.{datoForDag(start).getMonth() + 1}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button style={{ background: '#2563eb', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', padding: '7px 16px' }}
                    onClick={() => setPickerTaskId(null)}>Ferdig</button>
                </div>
              </div>
            </div>
          )
        }

        // ── Prosent-velger ──
        if (isModePct) {
          const curPct = t.pct ?? 0
          return (
            <div style={{ position: 'relative', zIndex: 50, margin: '4px 0' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1e293b', borderRadius: 10, padding: '8px 12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: '#5d6b80', whiteSpace: 'nowrap' }}>
                  <Ikon ikon={ChartGantt} size={13} style={{ marginRight: 4 }} />Ferdig: <strong style={{ color: '#e2e8f0' }}>{t.name.slice(0, 20)}</strong>
                </span>
                {[0, 10, 25, 50, 75, 90, 100].map(p => (
                  <button key={p}
                    style={{ background: curPct === p ? '#15803d' : 'rgba(255,255,255,.1)', border: '1px solid ' + (curPct === p ? '#15803d' : 'rgba(255,255,255,.25)'), borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer', padding: '4px 9px' }}
                    onClick={() => setPct(t.id, p)}>{p}%</button>
                ))}
                <input type="number" min={0} max={100} defaultValue={curPct}
                  style={{ width: 56, padding: '3px 6px', border: 'none', borderRadius: 6, fontSize: 13, textAlign: 'center' }}
                  onClick={e => e.stopPropagation()}
                  onChange={e => setPct(t.id, parseInt(e.target.value || '0', 10))}
                  title="Skriv inn egen prosent" />
                <span style={{ fontSize: 12, color: '#5d6b80' }}>%</span>
                <button style={{ background: 'none', border: 'none', color: '#5d6b80', cursor: 'pointer', fontSize: 14, padding: '0 4px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  onClick={() => setPickerTaskId(null)}><Ikon ikon={X} size={13} /> Lukk</button>
              </div>
            </div>
          )
        }

        // ── Farge-velger ──
        const aktivFarge = isModeRow ? t.rowColor : t.customColor
        const standardFarge = fc(t.fag)
        return (
          <div style={{ position: 'relative', zIndex: 50, margin: '4px 0 4px 0' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1e293b', borderRadius: 10, padding: '8px 12px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: '#5d6b80', whiteSpace: 'nowrap' }}>
                <Ikon ikon={Palette} size={13} style={{ marginRight: 4 }} />{isModeRow ? 'Radfarge:' : 'Velg farge:'} <strong style={{ color: '#e2e8f0' }}>{t.name.slice(0, 20)}</strong>
              </span>
              {/* Standard (fag-farge) — kun for bar-modus */}
              {!isModeRow && (
                <div title="Standard (fagfarge)"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', padding: '2px 6px', borderRadius: 6, background: !aktivFarge ? 'rgba(255,255,255,.12)' : 'transparent', border: '1px solid ' + (!aktivFarge ? '#fff' : 'transparent') }}
                  onClick={() => { save(tasks.map(tt => tt.id === t.id ? { ...tt, customColor: undefined } : tt)); }}>
                  <span style={{ width: 14, height: 14, borderRadius: '50%', background: standardFarge, display: 'inline-block' }} />
                  <span style={{ fontSize: 10, color: '#cbd5e1' }}>Standard</span>
                </div>
              )}
              <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,.15)' }} />
              {SWATCH_COLORS.map(c => (
                <div key={c} title={c} style={{ width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer', border: (aktivFarge === c) ? '2px solid #fff' : '2px solid transparent' }}
                  onClick={() => { save(tasks.map(tt => tt.id === t.id ? { ...tt, [isModeRow ? 'rowColor' : 'customColor']: c } : tt)); }} />
              ))}
              <label title="Egendefinert farge"
                style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', fontSize: 10, color: '#cbd5e1' }}>
                <Ikon ikon={Rainbow} size={14} />
                <input type="color" value={aktivFarge || standardFarge}
                  style={{ width: 26, height: 22, padding: 0, border: 'none', borderRadius: 4, cursor: 'pointer', background: 'none' }}
                  onChange={e => save(tasks.map(tt => tt.id === t.id ? { ...tt, [isModeRow ? 'rowColor' : 'customColor']: e.target.value } : tt))} />
              </label>
              {isModeRow && aktivFarge && (
                <button style={{ background: 'none', border: '1px solid #475569', borderRadius: 6, color: '#cbd5e1', cursor: 'pointer', fontSize: 11, padding: '2px 8px' }}
                  onClick={() => { save(tasks.map(tt => tt.id === t.id ? { ...tt, rowColor: undefined } : tt)); setPickerTaskId(null); }}>Fjern</button>
              )}
              <button style={{ background: 'none', border: 'none', color: '#5d6b80', cursor: 'pointer', fontSize: 14, padding: '0 4px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                onClick={() => setPickerTaskId(null)}><Ikon ikon={X} size={13} /> Lukk</button>
            </div>
          </div>
        )
      })()}

      {!readOnly && (
        <div className="fd2-add-row">
          <input value={newTask} onChange={e => setNewTask(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTask()}
            placeholder="+ Ny fase (Enter for å legge til)"
            className="input" style={{ flex: 1, minWidth: 140, fontSize: 13 }} />
          <select value={newFag} onChange={e => setNewFag(e.target.value)}
            className="input" style={{ width: 130, fontSize: 13 }}>
            {Object.entries(FAG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" onClick={addTask}>Legg til</button>
        </div>
      )}

      {tasks.length > 0 && (
        <div className="fd2-progress-sum">
          <span>{tasks.filter(t => (t.pct ?? 0) >= 100).length} av {tasks.length} faser fullført</span>
          <span>·</span>
          <span>Beregnet fremdrift: <strong>{calcAutoProgress(tasks)}%</strong></span>
        </div>
      )}
    </div>
  );
}

// ─── ProjectDetail ────────────────────────────────────────────────────────────

function ProjectDetail({ project, onBack, onUpdate, readOnly = false }) {
  const [status,   setStatus]   = useState(project.fdStatus || 'Pågående');
  const [note,     setNote]     = useState(project.fdNote || '');
  const [startWk,  setStartWk]  = useState(() => projStartWY(project).week);
  const [startYr,  setStartYr]  = useState(() => projStartWY(project).year);
  const [totalWk,  setTotalWk]  = useState(project.fdTotalWeeks || 12);
  const [aktTab,   setAktTab]   = useState('gantt');
  const [visGenModal, setVisGenModal] = useState(false);

  const { laster: aiLaster, feil: aiFeil, regenererMedAI } = useFramdriftAI(project, onUpdate);

  function handleAIApply({ fdTasks, fdStartWeek, fdStartYear, fdTotalWeeks, milepaler, replace }) {
    if (replace) {
      onUpdate({
        fdTasks,
        fdStartWeek,
        fdStartYear,
        fdTotalWeeks,
        fdMilepaler: milepaler || [],
        fdGenDato: new Date().toISOString(),
        fdGenAv: 'AI',
      });
    } else {
      const existing = project.fdTasks || [];
      const offset = existing.length ? Math.max(...existing.map(t => t.start + t.dur)) : 0;
      const merged = [
        ...existing,
        ...fdTasks.map(t => ({ ...t, id: uid(), start: t.start + offset })),
      ];
      const mergedMile = [
        ...(project.fdMilepaler || []),
        ...(milepaler || []).map(m => ({ ...m, dagFraStart: (m.dagFraStart || 0) + offset })),
      ];
      onUpdate({ fdTasks: merged, fdMilepaler: mergedMile });
    }
    setVisGenModal(false);
  }

  useEffect(() => {
    setStatus(project.fdStatus || 'Pågående');
    setNote(project.fdNote || '');
    const wy = projStartWY(project);
    setStartWk(wy.week); setStartYr(wy.year);
    setTotalWk(project.fdTotalWeeks || 12);
  }, [project.id]);

  const pct     = project.fdProgress ?? 0;
  const sc      = STATUS_COLORS[status] ?? '#2563eb';
  const harAI   = project.fdGenAv === 'AI' && Boolean(project.kildeTilbudData);
  const harData = (project.fdTasks || []).length > 0;

  return (
    <div className="fd2-detail">

      {/* Print-only header — vises kun ved utskrift */}
      <div className="fd2-print-header fd2-print-only">
        <div className="fd2-print-tittel-rad">
          <div>
            <div className="fd2-print-prosjektnavn">{project.navn}</div>
            {project.adresse && <div className="fd2-print-adr">{project.adresse}</div>}
          </div>
          <div className="fd2-print-meta">
            <div>Skrevet ut: {new Date().toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
            <div>Status: <strong>{status}</strong></div>
            <div>Fremdrift: <strong>{pct}%</strong></div>
          </div>
        </div>
        <div className="fd2-print-sub">
          {project.fdStartWeek && `Startuke: U${project.fdStartWeek}/${project.fdStartYear || ''} · `}
          {project.fdTotalWeeks ? `${project.fdTotalWeeks} uker · ` : ''}
          {(project.fdTasks || []).filter(t => (t.pct ?? 0) >= 100).length}/{(project.fdTasks || []).length} faser fullført
        </div>
        {Array.isArray(project.fdMilepaler) && project.fdMilepaler.length > 0 && (
          <div className="fd2-print-milepaler">
            <strong>Milepæler:</strong>{' '}
            {project.fdMilepaler.map((m, i) => `${m.navn} (dag ${m.dagFraStart})`).join(' · ')}
          </div>
        )}
      </div>

      {readOnly && (
        <div className="no-print" style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 14px', margin: '0 0 10px', fontSize: 13, color: '#1e40af', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Ikon ikon={Eye} size={15} />Lesetilgang — du kan se framdriften men ikke endre den.
        </div>
      )}

      {/* Kundeportal fase 3: opt-in-deling av framdriften til kundesiden.
          Fase-titlene blir kundesynlige — derfor eksplisitt valg + forhåndsvisning. */}
      {!readOnly && (
        <div className="no-print" style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', margin: '0 0 10px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 500 }}>
            <input type="checkbox" checked={project.framdriftDeltMedKunde === true}
              onChange={e => onUpdate({ framdriftDeltMedKunde: e.target.checked })} />
            Del framdriften med kunden
          </label>
          <span style={{ color: 'var(--text-muted)' }}>
            {project.framdriftDeltMedKunde ? 'Milepæler (tittel, status, periode) sendes til kundesiden ved endringer — aldri navn eller timer.' : 'Ingenting sendes før du slår dette på.'}
          </span>
          <button className="btn" style={{ fontSize: 12, padding: '4px 10px', marginLeft: 'auto' }}
            onClick={async () => {
              try {
                const r = await fetch('/api/prosjekter/framdrift-eksport?torr=1&prosjektId=' + encodeURIComponent(project.id), {
                  headers: { Authorization: 'Bearer ' + (localStorage.getItem('fbs_token') || '') },
                });
                const d = await r.json();
                if (!r.ok || !d.payload) { window.alert(d.grunn || d.error || 'Kunne ikke bygge forhåndsvisning.'); return; }
                window.alert('Dette får kunden se (tilbud ' + d.payload.tilbudId + '):\n\n' +
                  d.payload.framdrift.milepaler.map(m => '• ' + m.tittel + ' — ' + m.status + ' (' + m.periodeTekst + ')').join('\n'));
              } catch (e) { window.alert('Feil: ' + e.message); }
            }}>
            Vis hva kunden får se
          </button>
        </div>
      )}

      {/* Sticky header */}
      <div className="fd2-detail-header no-print">
        <button className="btn btn-sm" onClick={onBack}>← Tilbake</button>
        <div className="fd2-detail-tittel-wrap">
          <h3 className="fd2-detail-tittel">{project.navn}</h3>
          {project.adresse && <span className="fd2-detail-adr"><Ikon ikon={MapPin} size={12} style={{ marginRight: 3 }} />{project.adresse}</span>}
        </div>
        <div className="fd2-detail-badges">
          {harAI && (
            <span className="fd2-kilde-badge fd2-kilde-ai"><Ikon ikon={Sparkles} size={11} style={{ marginRight: 3 }} />AI fra tilbuds-appen</span>
          )}
          {!harAI && harData && (
            <span className="fd2-kilde-badge fd2-kilde-manuell"><Ikon ikon={ClipboardList} size={11} style={{ marginRight: 3 }} />Manuell framdrift</span>
          )}
          {project.fdGenDato && (
            <span className="fd2-kilde-badge fd2-kilde-dato">
              {new Date(project.fdGenDato).toLocaleDateString('nb-NO')}
            </span>
          )}
          <button className="btn btn-sm" title="Skriv ut / Lagre som PDF"
            onClick={() => openPrintWindow(project, status, pct)}
            style={{ marginLeft: 4, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Ikon ikon={Printer} size={14} /> PDF
          </button>
        </div>
      </div>

      {/* Status-rad */}
      <div className="fd2-status-rad">
        <div className="fd2-status-gruppe">
          <span className="fd2-status-label">Status</span>
          <div className="fd2-status-pills">
            {STATUS_OPTIONS.map(s => (
              <button key={s}
                className={`fd2-status-pill${status === s ? ' active' : ''}`}
                style={status === s ? { background: STATUS_COLORS[s], color: '#fff', borderColor: STATUS_COLORS[s] } : { color: STATUS_COLORS[s], borderColor: STATUS_COLORS[s] + '66' }}
                onClick={() => { setStatus(s); onUpdate({ fdStatus: s }); }}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="fd2-fremdrift-gruppe">
          <span className="fd2-status-label">Fremdrift <strong>{pct}%</strong></span>
          <div className="fd2-fremdrift-bar">
            <div className="fd2-fremdrift-fill" style={{ width: pct + '%', background: sc }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="btn btn-sm fd2-ai-btn"
            onClick={() => setVisGenModal(true)}>
            <IkonTekst ikon={Sparkles} size={14} gap={5}>Generer med AI</IkonTekst>
          </button>
          {project.kildeTilbudData && (
            <button className="btn btn-sm" style={{ fontSize: 11, padding: '4px 8px', color: '#5d6b80' }}
              onClick={regenererMedAI} disabled={aiLaster}
              title="Regenerer fra eksisterende tilbudsdata">
              {aiLaster ? <span className="fd2-spinner" /> : <Ikon ikon={RefreshCw} size={14} />}
            </button>
          )}
        </div>
      </div>

      {aiFeil && <div className="fd2-feil-banner"><Ikon ikon={CircleX} size={14} style={{ marginRight: 4 }} />{aiFeil}</div>}

      {visGenModal && (
        <GenererModal
          project={project}
          onClose={() => setVisGenModal(false)}
          onApply={handleAIApply}
        />
      )}

      {/* Tabs */}
      <div className="fd2-tabs">
        {[
          { key: 'gantt',       label: <IkonTekst ikon={ChartGantt} size={14} gap={5}>Gantt</IkonTekst> },
          { key: 'innstilling', label: <IkonTekst ikon={Settings} size={14} gap={5}>Innstillinger</IkonTekst> },
          { key: 'notater',     label: <IkonTekst ikon={FilePen} size={14} gap={5}>Notater</IkonTekst> },
        ].map(tab => (
          <button key={tab.key}
            className={`fd2-tab${aktTab === tab.key ? ' active' : ''}`}
            onClick={() => setAktTab(tab.key)}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Gantt-tab */}
      {aktTab === 'gantt' && (
        <div className="fd2-tab-innhold">
          <GanttChart project={project} onUpdate={onUpdate} readOnly={readOnly} />

          {/* Print-only faseoversikt-tabell */}
          {(project.fdTasks || []).length > 0 && (
            <div className="fd2-print-only fd2-print-tabell-wrap">
              <table className="fd2-print-tabell">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Fase</th>
                    <th>Fag</th>
                    <th>Start dag</th>
                    <th>Varighet</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(project.fdTasks || []).map((t, i) => (
                    <tr key={t.id} className={(t.pct ?? 0) >= 100 ? 'fd2-print-rad-ferdig' : ''}>
                      <td>{i + 1}</td>
                      <td>{t.name}</td>
                      <td style={{ color: fc(t.fag) }}>{FAG[t.fag]?.label || t.fag}</td>
                      <td>Dag {t.start}</td>
                      <td>{t.dur} d</td>
                      <td>{(t.pct ?? 0) >= 100 ? <><Ikon ikon={Check} size={12} style={{ marginRight: 2 }} />Ferdig</> : t.pct > 0 ? `${t.pct}%` : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {Array.isArray(project.fdMilepaler) && project.fdMilepaler.length > 0 && (
            <div className="fd2-milepaler">
              <div className="fd2-milepaler-tittel"><IkonTekst ikon={Pin} size={14} gap={5}>Milepæler</IkonTekst></div>
              <div className="fd2-milepaler-chips">
                {project.fdMilepaler.map((m, i) => (
                  <span key={i} className="fd2-milepael-chip">
                    {m.navn}{m.dagFraStart != null ? ` · dag ${m.dagFraStart}` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Innstillinger-tab */}
      {aktTab === 'innstilling' && (
        <div className="fd2-tab-innhold">
          <div className="fd2-innstilling-grid">
            <div className="fd2-innstilling-felt">
              <label className="fd2-label">Startuke</label>
              <input type="number" min={1} max={52} value={startWk} className="input"
                style={{ width: 80 }}
                onChange={e => setStartWk(Number(e.target.value))}
                onBlur={() => onUpdate({ fdStartWeek: startWk, fdStartYear: startYr })} />
            </div>
            <div className="fd2-innstilling-felt">
              <label className="fd2-label">År</label>
              <input type="number" min={2023} max={2035} value={startYr} className="input"
                style={{ width: 90 }}
                onChange={e => setStartYr(Number(e.target.value))}
                onBlur={() => onUpdate({ fdStartWeek: startWk, fdStartYear: startYr })} />
            </div>
            <div className="fd2-innstilling-felt">
              <label className="fd2-label">Totale uker</label>
              <input type="number" min={1} max={200} value={totalWk} className="input"
                style={{ width: 90 }}
                onChange={e => setTotalWk(Number(e.target.value))}
                onBlur={() => onUpdate({ fdTotalWeeks: totalWk })} />
            </div>
          </div>
          {harAI && (
            <div className="fd2-kilde-info">
              <div className="fd2-kilde-info-tittel"><IkonTekst ikon={Package} size={14} gap={5}>Data fra tilbuds-appen</IkonTekst></div>
              <div className="fd2-kilde-info-rad">
                <span>Generert:</span>
                <strong>{project.fdGenDato ? new Date(project.fdGenDato).toLocaleString('nb-NO') : '–'}</strong>
              </div>
              <div className="fd2-kilde-info-rad">
                <span>Faser:</span>
                <strong>{(project.fdTasks || []).length} stk</strong>
              </div>
              {project.kildeTilbudData?.adresse && (
                <div className="fd2-kilde-info-rad">
                  <span>Adresse:</span>
                  <strong>{project.kildeTilbudData.adresse}</strong>
                </div>
              )}
              {project.kildeTilbudData?.oppstart && (
                <div className="fd2-kilde-info-rad">
                  <span>Oppstart (fra tilbud):</span>
                  <strong>{project.kildeTilbudData.oppstart}</strong>
                </div>
              )}
              {project.kildeTilbudData?.varighet && (
                <div className="fd2-kilde-info-rad">
                  <span>Varighet (fra tilbud):</span>
                  <strong>{project.kildeTilbudData.varighet}</strong>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Notater-tab */}
      {aktTab === 'notater' && (
        <div className="fd2-tab-innhold">
          <div className="fd2-notater-grid">
            <div>
              <label className="fd2-label">Avvik / merknader</label>
              <textarea rows={4} value={note} className="input"
                style={{ width: '100%', resize: 'vertical', fontSize: 13 }}
                placeholder="Beskriv avvik eller endringer…"
                onChange={e => setNote(e.target.value)}
                onBlur={() => onUpdate({ fdNote: note })} />
            </div>
            {[
              { key: 'fdNoteOrders', label: <IkonTekst ikon={Package} size={13} gap={4}>Bestillinger & leveranser</IkonTekst>, ph: 'Vinduer bestilt 10.04…' },
              { key: 'fdNoteSubs',   label: <IkonTekst ikon={HardHat} size={13} gap={4}>Underentreprenører</IkonTekst>,        ph: 'Rørlegger – Ola Hansen…' },
            ].map(({ key, label, ph }) => (
              <div key={key}>
                <label className="fd2-label">{label}</label>
                <textarea rows={4} value={project[key] || ''} className="input"
                  style={{ width: '100%', resize: 'vertical', fontSize: 13 }}
                  placeholder={ph}
                  onChange={e => onUpdate({ [key]: e.target.value })}
                  onBlur={e => onUpdate({ [key]: e.target.value })} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ProjectCard removed — replaced by inline list in main return ─────────────

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Framdriftsplan({ readOnly = false, ansattId = null }) {
  // (kundeportal fase 3-importer brukes i updateProject over)
  const { state, dispatch } = useApp();
  const [selectedId, setSelectedId] = useState(null);
  const [filter,     setFilter]     = useState('Alle');
  const [synker,     setSynker]     = useState(false);
  const [sistSynk,   setSistSynk]   = useState(null);
  const [synkFeil,   setSynkFeil]   = useState('');

  // Force cloud sync når siden lastes
  useEffect(() => { syncFraCloud(); }, []);

  async function syncFraCloud() {
    setSynker(true);
    setSynkFeil('');
    try {
      const token = localStorage.getItem('fbs_token') || '';
      if (!token) { setSynkFeil('Ikke innlogget'); return; }
      const r = await fetch('/api/state', { headers: { Authorization: `Bearer ${token}` } });
      if (r.status === 401) { setSynkFeil('Innlogging utløpt – last siden på nytt'); return; }
      if (!r.ok) { setSynkFeil(`Sky-feil (${r.status})`); return; }
      const cloudState = await r.json();
      if (!cloudState || typeof cloudState !== 'object') { setSynkFeil('Ugyldig sky-data'); return; }
      // Bruk mergeWithCloud slik at prosjekter fra sky alltid vinner hvis sky er nyere
      const merged = mergeWithCloud(state, cloudState);
      dispatch({ type: 'LOAD_STATE', payload: merged });
      setSistSynk(new Date());
    } catch { setSynkFeil('Nettverksfeil – sjekk internett'); }
    finally { setSynker(false); }
  }

  const updateProject = (proj, extra) => {
    dispatch({ type: 'UPDATE_PROSJEKT', payload: { ...proj, ...extra } });
    // Kundeportal fase 3: framdriftsendringer på delte prosjekter varsler
    // eksport-endepunktet (debounced; serveren dedupper og krever delings-flagget)
    const delt = extra.framdriftDeltMedKunde !== undefined ? extra.framdriftDeltMedKunde : proj.framdriftDeltMedKunde;
    if (delt && erFramdriftsEndring(extra)) varsleFramdriftEksport(proj.id);
  };

  // Ansatt (lesetilgang): kun prosjekter de er tildelt via bemanningsplanen
  const tildelteProsjektIds = useMemo(() => ansattId
    ? new Set((state.tildelinger || []).filter(t => t.ansattId === ansattId).map(t => t.prosjektId))
    : null, [ansattId, state.tildelinger]);

  const aktive = useMemo(() => state.prosjekter
    .filter(p => !p.arkivert && p.status !== 'fullfort')
    .filter(p => !tildelteProsjektIds || tildelteProsjektIds.has(p.id)), [state.prosjekter, tildelteProsjektIds]);
  const [velgerSok, setVelgerSok] = useState('');

  // Duplikat-hint (samme fuzzy-motor som Prosjekter): vis «ligner på …»
  // under velgeren når det valgte prosjektet har en sannsynlig dublett.
  const duplikatAvValgt = useMemo(() => {
    if (!selectedId) return null;
    const valgt = aktive.find(p => p.id === selectedId);
    if (!valgt) return null;
    let best = null;
    for (const q of aktive) {
      if (q.id === valgt.id) continue;
      const sc = kandidatScore(valgt, q);
      if (sc >= 50 && (!best || sc > best.sc)) best = { sc, q };
    }
    return best ? (best.q.adresse || best.q.navn) : null;
  }, [selectedId, aktive]);

  const counts = useMemo(() => ({
    Alle:        aktive.length,
    'AI-plan':   aktive.filter(p => p.fdGenAv === 'AI' && p.kildeTilbudData).length,
    Pågående:    aktive.filter(p => !p.fdStatus || p.fdStatus === 'Pågående' || p.fdStatus === 'Ikke startet').length,
    Forsinket:   aktive.filter(p => p.fdStatus === 'Forsinket').length,
    Ferdig:      aktive.filter(p => p.fdStatus === 'Ferdig').length,
  }), [aktive]);

  const filtered = aktive.filter(p => {
    if (filter === 'Alle')      return true;
    if (filter === 'AI-plan')   return p.fdGenAv === 'AI' && Boolean(p.kildeTilbudData);
    if (filter === 'Pågående')  return !p.fdStatus || p.fdStatus === 'Pågående' || p.fdStatus === 'Ikke startet';
    if (filter === 'Forsinket') return p.fdStatus === 'Forsinket';
    if (filter === 'Ferdig')    return p.fdStatus === 'Ferdig';
    return true;
  });

  const sortOrder = { Forsinket: 0, Pågående: 1, 'Ikke startet': 2, Ferdig: 3 };
  filtered.sort((a, b) => {
    const sa = sortOrder[a.fdStatus || 'Pågående'] ?? 1;
    const sb = sortOrder[b.fdStatus || 'Pågående'] ?? 1;
    if (sa !== sb) return sa - sb;
    return (b.fdProgress ?? 0) - (a.fdProgress ?? 0);
  });

  const { week: nw, year: ny } = nowWeekYear();
  const { medAIPlan, utenPlan, antForsinket, krevOppmerksomhet } = useMemo(() => {
    const medAIPlan  = aktive.filter(p => p.fdGenAv === 'AI' && p.kildeTilbudData).length;
    const utenPlan   = aktive.filter(p => !(p.fdTasks || []).length).length;
    const antForsinket = aktive.filter(p => p.fdStatus === 'Forsinket').length;
    const krevOppmerksomhet = [
      ...aktive.filter(p => p.fdStatus === 'Forsinket').map(p => ({ p, ikon: CircleAlert, ikonFarge: '#dc2626', info: 'Forsinket' })),
      ...aktive.filter(p => {
        if ((p.fdTasks || []).length > 0 || !p.fdStartWeek) return false;
        const diff = (p.fdStartYear || ny) * 52 + p.fdStartWeek - ny * 52 - nw;
        return diff >= 0 && diff <= 8;
      }).map(p => {
        const diff = (p.fdStartYear || ny) * 52 + p.fdStartWeek - ny * 52 - nw;
        return { p, ikon: Rocket, ikonFarge: '#b45309', info: `Starter om ${diff} uker — mangler plan` };
      }),
    ];
    return { medAIPlan, utenPlan, antForsinket, krevOppmerksomhet };
  }, [aktive, nw, ny]);

  if (selectedId) {
    const live = state.prosjekter.find(p => p.id === selectedId);
    if (live) {
      return (
        <div className="page">
          <ProjectDetail
            project={live}
            onBack={() => setSelectedId(null)}
            onUpdate={readOnly ? () => {} : (extra => updateProject(live, extra))}
            readOnly={readOnly}
          />
        </div>
      );
    }
  }

  return (
    <div className="page fd2-page">
      {/* Header */}
      <div className="fd2-page-header">
        <div>
          <h2 className="fd2-page-tittel">Framdriftsplan</h2>
          <p className="fd2-page-sub">{aktive.length} aktive prosjekter · {medAIPlan} med AI-plan</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <button className="btn btn-sm fd2-sync-btn" onClick={syncFraCloud} disabled={synker}
            title="Hent siste data fra sky">
            {synker ? <IkonTekst ikon={Loader} size={13} gap={4}>Synker…</IkonTekst> : <IkonTekst ikon={RefreshCw} size={13} gap={4}>Synk</IkonTekst>}
            {sistSynk && !synker && (
              <span className="fd2-sync-tid">
                {sistSynk.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </button>
          {synkFeil && <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 500 }}><Ikon ikon={TriangleAlert} size={11} style={{ marginRight: 3 }} />{synkFeil}</span>}
        </div>
      </div>

      {/* Velg prosjekt — med søk, uten arkiverte (B-listen 15.08) */}
      <div className="fd2-velg-wrap" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input className="input" placeholder="Søk prosjekt…" value={velgerSok}
          onChange={e => setVelgerSok(e.target.value)}
          style={{ height: 38, maxWidth: 220 }} />
        <select className="fd2-velg-select" value=""
          onChange={e => { if (e.target.value) setSelectedId(e.target.value); }}>
          <option value="" disabled>Velg prosjekt for å se framdriftsplan…</option>
          {[...aktive]
            .filter(p => !velgerSok || (p.navn || '').toLowerCase().includes(velgerSok.toLowerCase()) || (p.adresse || '').toLowerCase().includes(velgerSok.toLowerCase()))
            .sort((a, b) => a.navn.localeCompare(b.navn, 'nb')).map(p => (
            <option key={p.id} value={p.id}>
              {p.navn}
              {(p.fdTasks || []).length > 0 ? ' \u2713' : ''}
              {p.fdGenAv === 'AI' ? ' · AI' : ''}
            </option>
          ))}
        </select>
      </div>
      {duplikatAvValgt && (
        <div style={{ fontSize: 12, color: 'var(--warning)', margin: '4px 0 8px', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Ikon ikon={TriangleAlert} size={12} /> Valgt prosjekt ligner på «{duplikatAvValgt}» — mulig dublett (slå sammen fra Prosjekter-siden)
        </div>
      )}

      {/* Stats */}
      <div className="fd2-dashboard-stats">
        {[
          { tall: aktive.length, label: 'Aktive prosjekter', color: '#1e293b' },
          { tall: medAIPlan,     label: <IkonTekst ikon={Sparkles} size={12} gap={4}>AI-plan</IkonTekst>, color: '#7c3aed' },
          { tall: utenPlan,      label: 'Mangler plan',        color: '#b45309' },
          ...(antForsinket > 0 ? [{ tall: antForsinket, label: <IkonTekst ikon={CircleAlert} size={12} gap={4} farge="#dc2626">Forsinket</IkonTekst>, color: '#dc2626' }] : []),
        ].map((s, i) => (
          <div key={i} className="fd2-stat-boks" style={{ borderLeft: `3px solid ${s.color}` }}>
            <div className="fd2-stat-tall" style={{ color: s.color }}>{s.tall}</div>
            <div className="fd2-stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Krever oppmerksomhet */}
      {krevOppmerksomhet.length > 0 && (
        <div className="fd2-oppmerksomhet">
          <div className="fd2-oppmerksomhet-tittel"><IkonTekst ikon={Flame} size={14} gap={5}>Krever oppmerksomhet</IkonTekst></div>
          {krevOppmerksomhet.map(({ p, info, ikon, ikonFarge }) => (
            <div key={p.id} className="fd2-oppmerksomhet-rad" onClick={() => setSelectedId(p.id)}>
              <Ikon ikon={ikon} size={14} farge={ikonFarge} />
              <span className="fd2-oppm-navn">{p.navn}</span>
              <span className="fd2-oppm-info">{info}</span>
            </div>
          ))}
        </div>
      )}

      {/* Alle prosjekter — kompakt liste */}
      <div className="fd2-alle-liste">
        <div className="fd2-alle-tittel">Alle prosjekter ({aktive.length})</div>
        {[...aktive].sort((a, b) => {
          const so = { Forsinket: 0, Pågående: 1, 'Ikke startet': 2, Ferdig: 3 };
          const sa = so[a.fdStatus || 'Ikke startet'] ?? 2;
          const sb = so[b.fdStatus || 'Ikke startet'] ?? 2;
          return sa !== sb ? sa - sb : a.navn.localeCompare(b.navn, 'nb');
        }).map(p => {
          const tasks = p.fdTasks || [];
          const sc = STATUS_COLORS[p.fdStatus || 'Ikke startet'] ?? '#5d6b80';
          const harAI = p.fdGenAv === 'AI' && p.kildeTilbudData;
          return (
            <div key={p.id} className="fd2-prosjekt-rad" onClick={() => setSelectedId(p.id)}>
              <div className="fd2-rad-dot" style={{ background: sc }} />
              <div className="fd2-rad-navn">{p.navn}</div>
              <div className="fd2-rad-badges">
                {harAI && <span className="fd2-kilde-badge fd2-kilde-ai" style={{ fontSize: 10 }}><Ikon ikon={Sparkles} size={11} /></span>}
                {tasks.length > 0
                  ? <span className="fd2-rad-info">{tasks.filter(t=>(t.pct??0)>=100).length}/{tasks.length} faser</span>
                  : <span className="fd2-rad-info" style={{ color: '#b45309' }}>Ingen plan</span>
                }
              </div>
              <span className="fd2-rad-status" style={{ color: sc }}>{p.fdStatus || 'Ikke startet'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
