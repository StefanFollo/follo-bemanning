// Norwegian public holidays (helligdager)

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// Use local date (not UTC) to avoid timezone shift
function iso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addD(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function getNorwegianHolidays(year) {
  const easter = easterSunday(year);
  return {
    [iso(new Date(year, 0, 1))]:  'Nyttårsdag',
    [iso(addD(easter, -3))]:       'Skjærtorsdag',
    [iso(addD(easter, -2))]:       'Langfredag',
    [iso(easter)]:                 '1. påskedag',
    [iso(addD(easter,  1))]:       '2. påskedag',
    [iso(new Date(year, 4, 1))]:  'Arbeidernes dag',
    [iso(new Date(year, 4, 17))]: 'Grunnlovsdag',
    [iso(addD(easter, 39))]:       'Kristi himmelfartsdag',
    [iso(addD(easter, 49))]:       '1. pinsedag',
    [iso(addD(easter, 50))]:       '2. pinsedag',
    [iso(new Date(year, 11, 25))]: '1. juledag',
    [iso(new Date(year, 11, 26))]: '2. juledag',
  };
}

// Returns a merged map for a range of years
export function getHolidayMap(fromYear, toYear) {
  const map = {};
  for (let y = fromYear; y <= toYear; y++) {
    Object.assign(map, getNorwegianHolidays(y));
  }
  return map;
}
