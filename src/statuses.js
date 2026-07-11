// Felles status-definisjoner — ÉN kilde til sannhet.
// Tidligere hadde hver side sin egen kopi som skled fra hverandre:
// Dashboard manglet 'lead' og 'planlagt' og viste feil farge/ikon for dem.
// Nye statuser legges til HER, så følger alle sider automatisk med.

export const BEF_STATUS = {
  lead:          { label: 'Lead',                farge: '#0d9488', bg: '#f0fdfa', ikon: '🌱' },
  planlagt:      { label: 'Planlagt befaring',   farge: '#3b82f6', bg: '#eff6ff', ikon: '📋' },
  tilbud_arbeid: { label: 'Tilbud under arbeid', farge: '#f59e0b', bg: '#fffbeb', ikon: '✏️' },
  tilbud_sendt:  { label: 'Tilbud sendt',        farge: '#8b5cf6', bg: '#f5f3ff', ikon: '📤' },
  godkjent:      { label: 'Godkjent',            farge: '#16a34a', bg: '#f0fdf4', ikon: '✅' },
  tapt:          { label: 'Tapt',                farge: '#6b7280', bg: '#f9fafb', ikon: '❌' },
};

export const REKL_STATUS = {
  ny:           { label: 'Ny',              farge: '#3b82f6', bg: '#eff6ff', ikon: '🔵' },
  planlagt:     { label: 'Planlagt',        farge: '#f59e0b', bg: '#fffbeb', ikon: '📅' },
  under_arbeid: { label: 'Under utbedring', farge: '#8b5cf6', bg: '#f5f3ff', ikon: '🔨' },
  utbedret:     { label: 'Utbedret',        farge: '#16a34a', bg: '#f0fdf4', ikon: '✅' },
  avvist:       { label: 'Avvist',          farge: '#dc2626', bg: '#fef2f2', ikon: '🚫' },
  lukket:       { label: 'Lukket',          farge: '#6b7280', bg: '#f9fafb', ikon: '🔒' },
};

export const SERV_STATUS = {
  ny:           { label: 'Ny',                      farge: '#3b82f6', bg: '#eff6ff', ikon: '🔵' },
  planlagt:     { label: 'Planlagt',                farge: '#f59e0b', bg: '#fffbeb', ikon: '📅' },
  under_arbeid: { label: 'Under arbeid',            farge: '#8b5cf6', bg: '#f5f3ff', ikon: '🔨' },
  ferdig:       { label: 'Ferdig – ikke fakturert', farge: '#16a34a', bg: '#f0fdf4', ikon: '✅' },
  fakturert:    { label: 'Fakturert',               farge: '#0891b2', bg: '#ecfeff', ikon: '🧾' },
};
