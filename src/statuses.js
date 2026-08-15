// Felles status-definisjoner — ÉN kilde til sannhet.
// Tidligere hadde hver side sin egen kopi som skled fra hverandre:
// Dashboard manglet 'lead' og 'planlagt' og viste feil farge/ikon for dem.
// Nye statuser legges til HER, så følger alle sider automatisk med.
// Ikon-feltet er en lucide-react-komponentreferanse — rendres via <Ikon ikon={...} />.

import {
  Sprout, ClipboardList, Pencil, Send, CircleCheck, CircleX,
  Circle, CalendarDays, Hammer, Ban, Lock, Receipt,
} from 'lucide-react';

export const BEF_STATUS = {
  lead:          { label: 'Lead',                farge: '#0f766e', bg: '#f0fdfa', ikon: Sprout },
  planlagt:      { label: 'Planlagt befaring',   farge: '#1d4ed8', bg: '#eff6ff', ikon: ClipboardList },
  tilbud_arbeid: { label: 'Tilbud under arbeid', farge: '#b45309', bg: '#fffbeb', ikon: Pencil },
  tilbud_sendt:  { label: 'Tilbud sendt',        farge: '#6d28d9', bg: '#f5f3ff', ikon: Send },
  godkjent:      { label: 'Godkjent',            farge: '#15803d', bg: '#f0fdf4', ikon: CircleCheck },
  tapt:          { label: 'Tapt',                farge: '#4b5563', bg: '#f9fafb', ikon: CircleX },
};

export const REKL_STATUS = {
  ny:           { label: 'Ny',              farge: '#1d4ed8', bg: '#eff6ff', ikon: Circle },
  planlagt:     { label: 'Planlagt',        farge: '#b45309', bg: '#fffbeb', ikon: CalendarDays },
  under_arbeid: { label: 'Under utbedring', farge: '#6d28d9', bg: '#f5f3ff', ikon: Hammer },
  utbedret:     { label: 'Utbedret',        farge: '#15803d', bg: '#f0fdf4', ikon: CircleCheck },
  avvist:       { label: 'Avvist',          farge: '#dc2626', bg: '#fef2f2', ikon: Ban },
  lukket:       { label: 'Lukket',          farge: '#4b5563', bg: '#f9fafb', ikon: Lock },
};

export const SERV_STATUS = {
  ny:           { label: 'Ny',                      farge: '#1d4ed8', bg: '#eff6ff', ikon: Circle },
  planlagt:     { label: 'Planlagt',                farge: '#b45309', bg: '#fffbeb', ikon: CalendarDays },
  under_arbeid: { label: 'Under arbeid',            farge: '#6d28d9', bg: '#f5f3ff', ikon: Hammer },
  ferdig:       { label: 'Ferdig – ikke fakturert', farge: '#15803d', bg: '#f0fdf4', ikon: CircleCheck },
  fakturert:    { label: 'Fakturert',               farge: '#0e7490', bg: '#ecfeff', ikon: Receipt },
};
