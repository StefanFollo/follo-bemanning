// Persistent state via localStorage

// Engangs-import av befaringer fra Steddy-eksport
const STEDDY_BEFARINGER = [
  { kontaktNavn:'Niklas Langbråten', adresse:'Maristien 8, 1415 Oppegård', jobbType:'Tilbygg', estimertBelop:'', status:'tilbud_arbeid', dato:'2026-04-29', notat:'Tilbygg på ringmur - saltak, 2 etasjer\nProsjektnr: 906883', kommentar:'', telefon:'', epost:'', prosjektlederId:'', tilbudFrist:'', nesteKontakt:'', oensketOppstart:'', resultat:'', tapArsak:'', tid:'' },
  { kontaktNavn:'Lene Gadsbøll', adresse:'Munkerudkleiva 1, 1164 Oslo', jobbType:'Rehabilitering', estimertBelop:'', status:'tilbud_arbeid', dato:'2026-04-29', notat:'Fra enebolig til generasjonsbolig - ekstra etasje med flatt tak og takterrasse\nProsjektnr: 907194', kommentar:'', telefon:'', epost:'', prosjektlederId:'', tilbudFrist:'', nesteKontakt:'', oensketOppstart:'', resultat:'', tapArsak:'', tid:'' },
  { kontaktNavn:'Petter Østby', adresse:'Solstadveien 9, 1424 Ski', jobbType:'Annet', estimertBelop:'', status:'tilbud_arbeid', dato:'2026-04-29', notat:'Prosjektnr: 902061', kommentar:'', telefon:'', epost:'', prosjektlederId:'', tilbudFrist:'', nesteKontakt:'', oensketOppstart:'', resultat:'', tapArsak:'', tid:'' },
  { kontaktNavn:'Henrik Holthe', adresse:'Sønsterudveien 4, 1410 Kolbotn', jobbType:'Rehabilitering', estimertBelop:'', status:'tilbud_arbeid', dato:'2026-04-29', notat:'Ny himling ferdig malt\nProsjektnr: 910568', kommentar:'', telefon:'', epost:'', prosjektlederId:'', tilbudFrist:'', nesteKontakt:'', oensketOppstart:'', resultat:'', tapArsak:'', tid:'' },
  { kontaktNavn:'Stein-Erik Furu', adresse:'Steinhammerveien 7A, 1177 Oslo', jobbType:'Fasade jobb', estimertBelop:'', status:'tilbud_arbeid', dato:'2026-04-29', notat:'Bytte vindskier og vannbord\nProsjektnr: 916334', kommentar:'', telefon:'', epost:'', prosjektlederId:'', tilbudFrist:'', nesteKontakt:'', oensketOppstart:'', resultat:'', tapArsak:'', tid:'' },
  { kontaktNavn:'Betongconsult AS', adresse:'Bjørnelia 12, 1453 Bjørnemyr', jobbType:'Annet', estimertBelop:'', status:'tilbud_arbeid', dato:'2026-04-29', notat:'Ny terrasseplatting, ca. 75 m²\nProsjektnr: 916252', kommentar:'', telefon:'', epost:'', prosjektlederId:'', tilbudFrist:'', nesteKontakt:'', oensketOppstart:'', resultat:'', tapArsak:'', tid:'' },
  { kontaktNavn:'Kjell Ivar Moland', adresse:'Austlisvingen 29, 1423 Ski', jobbType:'Tilbygg', estimertBelop:'1225000', status:'tilbud_arbeid', dato:'2026-04-29', notat:'Prosjektnr: 914242', kommentar:'', telefon:'', epost:'', prosjektlederId:'', tilbudFrist:'', nesteKontakt:'', oensketOppstart:'', resultat:'', tapArsak:'', tid:'' },
  { kontaktNavn:'Maria Hardie', adresse:'Sloreåsen 13A, 1257 Oslo', jobbType:'Bad', estimertBelop:'', status:'tilbud_arbeid', dato:'2026-04-29', notat:'Totalrenovering bad\nProsjektnr: 918245', kommentar:'', telefon:'', epost:'', prosjektlederId:'', tilbudFrist:'', nesteKontakt:'', oensketOppstart:'', resultat:'', tapArsak:'', tid:'' },
  { kontaktNavn:'Kristina Smedsvig', adresse:'Kongsveien 72C, 1177 Oslo', jobbType:'Rehabilitering', estimertBelop:'', status:'tilbud_arbeid', dato:'2026-04-29', notat:'Oppussing av gang\nProsjektnr: 912936', kommentar:'', telefon:'', epost:'', prosjektlederId:'', tilbudFrist:'', nesteKontakt:'', oensketOppstart:'', resultat:'', tapArsak:'', tid:'' },
  { kontaktNavn:'Alexandra Yanez', adresse:'Gamle Åsvei 83, 1424 Ski', jobbType:'Annet', estimertBelop:'7910000', status:'tilbud_arbeid', dato:'2026-04-29', notat:'Prosjektnr: 914209', kommentar:'', telefon:'', epost:'', prosjektlederId:'', tilbudFrist:'', nesteKontakt:'', oensketOppstart:'', resultat:'', tapArsak:'', tid:'' },
  { kontaktNavn:'Sultan Naseer', adresse:'Solveien 1, 1415 Oppegård', jobbType:'Annet', estimertBelop:'1039500', status:'tilbud_arbeid', dato:'2026-04-29', notat:'Prosjektnr: 916113', kommentar:'', telefon:'', epost:'', prosjektlederId:'', tilbudFrist:'', nesteKontakt:'', oensketOppstart:'', resultat:'', tapArsak:'', tid:'' },
  { kontaktNavn:'Ole Christian Nilsen', adresse:'Pareliusveien 60, 1177 Oslo', jobbType:'Fasade jobb', estimertBelop:'', status:'tilbud_arbeid', dato:'2026-04-29', notat:'Ferdigstillelse av utvendig inngangsparti til kjellerhybel med trappekledning\nProsjektnr: 917210', kommentar:'', telefon:'', epost:'', prosjektlederId:'', tilbudFrist:'', nesteKontakt:'', oensketOppstart:'', resultat:'', tapArsak:'', tid:'' },
  { kontaktNavn:'Mads Eklund', adresse:'Jens Baggesens Vei 18, 1542 Vestby', jobbType:'Rehabilitering', estimertBelop:'298000', status:'tilbud_sendt', dato:'2026-02-14', notat:'Isolert utebod\nProsjektnr: 900558', kommentar:'', telefon:'', epost:'', prosjektlederId:'', tilbudFrist:'', nesteKontakt:'', oensketOppstart:'', resultat:'', tapArsak:'', tid:'' },
  { kontaktNavn:'Bård Normann Andersen', adresse:'Kråkstadveien 98, 1408 Kråkstad', jobbType:'Annet', estimertBelop:'', status:'tilbud_sendt', dato:'2026-04-10', notat:'Nybygg Kråkstadveien 98\nProsjektnr: 914029', kommentar:'', telefon:'', epost:'', prosjektlederId:'', tilbudFrist:'', nesteKontakt:'', oensketOppstart:'', resultat:'', tapArsak:'', tid:'' },
  { kontaktNavn:'Elise Skarsaune', adresse:'Durendalsveien 4, 1415 Oppegård', jobbType:'Rehabilitering', estimertBelop:'161660', status:'tilbud_sendt', dato:'2026-05-15', notat:'Prosjektnr: 902062', kommentar:'', telefon:'', epost:'', prosjektlederId:'', tilbudFrist:'', nesteKontakt:'', oensketOppstart:'', resultat:'', tapArsak:'', tid:'' },
  { kontaktNavn:'Oscar Bremler', adresse:'Arneborgveien 12, 1430 Ås', jobbType:'Fasade jobb', estimertBelop:'54400', status:'tilbud_sendt', dato:'2026-04-17', notat:'Bytte vinduer\nProsjektnr: 915160', kommentar:'', telefon:'', epost:'', prosjektlederId:'', tilbudFrist:'', nesteKontakt:'', oensketOppstart:'', resultat:'', tapArsak:'', tid:'' },
  { kontaktNavn:'Ida Christine Jacobsen', adresse:'Skogkanten 38A, 1410 Kolbotn', jobbType:'Rehabilitering', estimertBelop:'370000', status:'tilbud_sendt', dato:'2026-05-09', notat:'Totalrenovering bad\nProsjektnr: 896876', kommentar:'', telefon:'', epost:'', prosjektlederId:'', tilbudFrist:'', nesteKontakt:'', oensketOppstart:'', resultat:'', tapArsak:'', tid:'' },
  { kontaktNavn:'Sameiet Ljabruveien 46', adresse:'Ljabruveien 46A, 1167 Oslo', jobbType:'Annet', estimertBelop:'44100', status:'tilbud_sendt', dato:'2026-05-22', notat:'Prosjektnr: 920577', kommentar:'', telefon:'', epost:'', prosjektlederId:'', tilbudFrist:'', nesteKontakt:'', oensketOppstart:'', resultat:'', tapArsak:'', tid:'' },
  { kontaktNavn:'William Fryer', adresse:'Nordre Skrenten 5, 1413 Tårnåsen', jobbType:'Annet', estimertBelop:'142000', status:'tilbud_sendt', dato:'2026-05-22', notat:'Prosjektnr: 920647', kommentar:'', telefon:'', epost:'', prosjektlederId:'', tilbudFrist:'', nesteKontakt:'', oensketOppstart:'', resultat:'', tapArsak:'', tid:'' },
  { kontaktNavn:'Ida Christine Jacobsen', adresse:'Skogkanten 38A, 1410 Kolbotn', jobbType:'Tilbygg', estimertBelop:'344455', status:'tilbud_sendt', dato:'2026-05-09', notat:'Repanele og etterisolere tilbygg\nProsjektnr: 917851', kommentar:'', telefon:'', epost:'', prosjektlederId:'', tilbudFrist:'', nesteKontakt:'', oensketOppstart:'', resultat:'', tapArsak:'', tid:'' },
  { kontaktNavn:'Ole-Kristian Pettersen', adresse:'Bagerens Vei 11, 1542 Vestby', jobbType:'Annet', estimertBelop:'44300', status:'tilbud_sendt', dato:'2026-05-29', notat:'Prosjektnr: 911915', kommentar:'', telefon:'', epost:'', prosjektlederId:'', tilbudFrist:'', nesteKontakt:'', oensketOppstart:'', resultat:'', tapArsak:'', tid:'' },
  { kontaktNavn:'Brit Huse', adresse:'Sagveien 105, 1414 Trollåsen', jobbType:'Rehabilitering', estimertBelop:'322078', status:'tapt', dato:'2026-05-17', notat:'Platting i to nivåer, pergola og levegg\nProsjektnr: 918236', kommentar:'', tapArsak:'Avslått av kunde', telefon:'', epost:'', prosjektlederId:'', tilbudFrist:'', nesteKontakt:'', oensketOppstart:'', resultat:'', tid:'' },
  { kontaktNavn:'Sameiet Søndre Moer B6', adresse:'Torgveien 10, 1400 Ski', jobbType:'Fasade jobb', estimertBelop:'1856040', status:'godkjent', dato:'2026-03-08', notat:'Sameiet Søndre Moer B 6\nProsjektnr: 909231', kommentar:'', telefon:'', epost:'', prosjektlederId:'', tilbudFrist:'', nesteKontakt:'', oensketOppstart:'', resultat:'', tapArsak:'', tid:'' },
  { kontaktNavn:'Martin Birkeland', adresse:'Kappveien 24, 1415 Oppegård', jobbType:'Annet', estimertBelop:'62250', status:'godkjent', dato:'2026-04-26', notat:'Bytte av Vindskier\nProsjektnr: 914700', kommentar:'', telefon:'', epost:'', prosjektlederId:'', tilbudFrist:'', nesteKontakt:'', oensketOppstart:'', resultat:'', tapArsak:'', tid:'' },
  { kontaktNavn:'Håkon Øynes', adresse:'Skullerudbakken 46, 1189 Oslo', jobbType:'Rehabilitering', estimertBelop:'2145000', status:'godkjent', dato:'2025-12-17', notat:'Påbygg på kjedet bolig\nProsjektnr: 899144', kommentar:'Kontrakt påbegynt', telefon:'', epost:'', prosjektlederId:'', tilbudFrist:'', nesteKontakt:'', oensketOppstart:'', resultat:'', tapArsak:'', tid:'' },
  { kontaktNavn:'Bjørn og Ingunn Solberg Eriksson', adresse:'Bjerkehageveien 17C, 1405 Langhus', jobbType:'Rehabilitering', estimertBelop:'2551100', status:'godkjent', dato:'2026-03-21', notat:'Prosjektnr: 902673', kommentar:'Kontrakt signert', telefon:'', epost:'', prosjektlederId:'', tilbudFrist:'', nesteKontakt:'', oensketOppstart:'', resultat:'', tapArsak:'', tid:'' },
  { kontaktNavn:'Martin Birkeland', adresse:'Stangåsveien 16B, 1415 Oppegård', jobbType:'Rehabilitering', estimertBelop:'1290825', status:'godkjent', dato:'2026-04-22', notat:'Isolert trimrom og utebod\nProsjektnr: 907202', kommentar:'', telefon:'', epost:'', prosjektlederId:'', tilbudFrist:'', nesteKontakt:'', oensketOppstart:'', resultat:'', tapArsak:'', tid:'' },
  { kontaktNavn:'Rolf Holmboe', adresse:'Solbråtanveien 44D, 1410 Kolbotn', jobbType:'Rehabilitering', estimertBelop:'240500', status:'godkjent', dato:'2026-01-10', notat:'Prosjektnr: 901854', kommentar:'Kontrakt påbegynt', telefon:'', epost:'', prosjektlederId:'', tilbudFrist:'', nesteKontakt:'', oensketOppstart:'', resultat:'', tapArsak:'', tid:'' },
  { kontaktNavn:'Tomas Vik', adresse:'Bjørnemyrveien 30, 1415 Oppegård', jobbType:'Bad', estimertBelop:'340000', status:'godkjent', dato:'2026-05-17', notat:'Totalrenovering bad\nProsjektnr: 919867', kommentar:'', telefon:'', epost:'', prosjektlederId:'', tilbudFrist:'', nesteKontakt:'', oensketOppstart:'', resultat:'', tapArsak:'', tid:'' },
];

const DEFAULT_FAG = ['Bas Tømrer', 'Montør', 'Lærling Tømrer', 'Maler', 'Rørlegger', 'Tømrer', 'Flislegger', 'Prosjektleder'];

function mkId(n) { return 'seed' + n; }

const SEED_ANSATTE = [
  'Abdul Malik','Aleksej Kursakov','Alexis K. Lusimbwa','Andrius Jauniskis',
  'Antun Tkalec','Arturas Maciuta','Brage Grinde','Dawod Azizian',
  'Brogen Ernst Kristian Stølen','Glenn Fosser','Helena Espeland Tryg',
  'Imad Muhammad Abouzraa','James Paul Klassen','Joachim Norenberg',
  'Kateryna Barabanova','Kenneth Grinde','Kristoffer Olsen Tollofsen',
  'Krzysztof Slabon','Leif Anders Nysveen Grøv','Lucas G Fosser',
  'Malin Kristin Dolk','Mario Deila','Martins Cerins','Mikkel Heggen Kulsrud',
  'Muhammed Sarr','Petros Potsis','Pyrros Christou','Richard Fosser Minge',
  'Richard Havnegjerde Ekroll','Rytis Jackevicius','Rytis Jauniskis',
  'Serhii Pieniev','Sigurd Lind Aanby','Stanislaw Kostrubiec',
  'Tomas Strumilas','Tomasz Miroslaw Czop','Tommy Fredriksen',
].map((navn, i) => ({ id: mkId('a' + i), navn, fag: 'Montør', telefon: '', epost: '' }));

const PROJ_PALETTE = ['#2563eb','#16a34a','#dc2626','#9333ea','#ea580c','#0891b2','#be185d','#854d0e','#065f46','#1e40af','#b45309','#0f766e'];

const SEED_PROSJEKTER = [
  '25032 Tvetenveien 20','Arne Nordli','Askveien 6','Belsjøparken 13',
  'Bjerkelundsveien 39','Carl Nords vei 7b','Eikestubben 9',
  'Ellingsrudveien 43','Fiolveien 16B','Hareveien 14','Høyåsveien 5',
  'Køyafaret tomt','Liadalsveien 4-14','Lindemansveien 59',
  'Lofts leiligheter Sæterskogveien 4','Lokaler 2 etg Sæterskogveien 4',
  'Regnbueveien 3c','Reklamasjoner 2026','Sagveien 37',
  'Sameiet Søndre Moer B6','Sandbukta 4','Skullerudbakken 46',
  'Steinhammerveien 6B','Stølsveien 12B','Øreliveien 16B',
  'Åslandsveien 31','Åsulvs vei 21',
].map((navn, i) => ({ id: mkId('p' + i), navn, adresse: '', startDato: '', sluttDato: '', status: 'aktiv', beskrivelse: '', farge: PROJ_PALETTE[i % PROJ_PALETTE.length] }));

export const PROSJEKT_PALETTE = PROJ_PALETTE;

// Seed tildelinger from Proresult PDF (weeks 13-19, 2026-03-23 to 2026-05-08)
// a=ansatt index, p=prosjekt index
const SEED_TILDELINGER = [
  // Glenn Fosser → Stølsveien 12B wk13-15
  { id: mkId('t0'),  ansattId: mkId('a9'),  prosjektId: mkId('p23'), startDato: '2026-03-23', sluttDato: '2026-04-10' },
  // Leif Anders Nysveen Grøv → Stølsveien 12B wk13-15
  { id: mkId('t1'),  ansattId: mkId('a18'), prosjektId: mkId('p23'), startDato: '2026-03-23', sluttDato: '2026-04-10' },
  // Mario Deila → Stølsveien 12B wk13-14, Skullerudbakken 46 wk16
  { id: mkId('t2'),  ansattId: mkId('a21'), prosjektId: mkId('p23'), startDato: '2026-03-23', sluttDato: '2026-04-03' },
  { id: mkId('t3'),  ansattId: mkId('a21'), prosjektId: mkId('p21'), startDato: '2026-04-13', sluttDato: '2026-04-17' },
  // Martins Cerins → Stølsveien 12B wk13, wk16-17
  { id: mkId('t4'),  ansattId: mkId('a22'), prosjektId: mkId('p23'), startDato: '2026-03-23', sluttDato: '2026-03-27' },
  { id: mkId('t5'),  ansattId: mkId('a22'), prosjektId: mkId('p23'), startDato: '2026-04-13', sluttDato: '2026-04-24' },
  // Kristoffer Olsen Tollofsen → Sæterskogveien 4 wk13-15
  { id: mkId('t6'),  ansattId: mkId('a16'), prosjektId: mkId('p14'), startDato: '2026-03-23', sluttDato: '2026-04-10' },
  // Malin Kristin Dolk → Sæterskogveien 4 wk13-15
  { id: mkId('t7'),  ansattId: mkId('a20'), prosjektId: mkId('p14'), startDato: '2026-03-23', sluttDato: '2026-04-10' },
  // Richard Fosser Minge → Skullerudbakken 46 wk16
  { id: mkId('t8'),  ansattId: mkId('a27'), prosjektId: mkId('p21'), startDato: '2026-04-13', sluttDato: '2026-04-17' },
  // Rytis Jauniskis → Ellingsrudveien 43 wk13, wk15 + Hareveien 14 wk16
  { id: mkId('t9'),  ansattId: mkId('a30'), prosjektId: mkId('p7'),  startDato: '2026-03-23', sluttDato: '2026-03-27' },
  { id: mkId('t10'), ansattId: mkId('a30'), prosjektId: mkId('p7'),  startDato: '2026-04-06', sluttDato: '2026-04-10' },
  { id: mkId('t11'), ansattId: mkId('a30'), prosjektId: mkId('p9'),  startDato: '2026-04-13', sluttDato: '2026-04-17' },
  // Aleksej Kursakov → Hareveien 14 wk13, Sæterskogveien 4 wk14-16
  { id: mkId('t12'), ansattId: mkId('a1'),  prosjektId: mkId('p9'),  startDato: '2026-03-23', sluttDato: '2026-03-27' },
  { id: mkId('t13'), ansattId: mkId('a1'),  prosjektId: mkId('p14'), startDato: '2026-03-30', sluttDato: '2026-04-17' },
  // Arturas Maciuta → Hareveien 14 wk13, wk15-16
  { id: mkId('t14'), ansattId: mkId('a5'),  prosjektId: mkId('p9'),  startDato: '2026-03-23', sluttDato: '2026-03-27' },
  { id: mkId('t15'), ansattId: mkId('a5'),  prosjektId: mkId('p9'),  startDato: '2026-04-06', sluttDato: '2026-04-17' },
  // Helena Espeland Tryg → Hareveien 14 wk13-15
  { id: mkId('t16'), ansattId: mkId('a10'), prosjektId: mkId('p9'),  startDato: '2026-03-23', sluttDato: '2026-04-10' },
  // Tomas Strumilas → Hareveien 14 wk13, Åslandsveien 31 wk14, Sandbukta 4 wk15-16
  { id: mkId('t17'), ansattId: mkId('a34'), prosjektId: mkId('p9'),  startDato: '2026-03-23', sluttDato: '2026-03-27' },
  { id: mkId('t18'), ansattId: mkId('a34'), prosjektId: mkId('p25'), startDato: '2026-03-30', sluttDato: '2026-04-03' },
  { id: mkId('t19'), ansattId: mkId('a34'), prosjektId: mkId('p20'), startDato: '2026-04-06', sluttDato: '2026-04-17' },
  // Tommy Fredriksen → Lindemansveien 59 wk13, wk15
  { id: mkId('t20'), ansattId: mkId('a36'), prosjektId: mkId('p13'), startDato: '2026-03-23', sluttDato: '2026-03-27' },
  { id: mkId('t21'), ansattId: mkId('a36'), prosjektId: mkId('p13'), startDato: '2026-04-06', sluttDato: '2026-04-10' },
  // Imad Muhammad Abouzraa → Lindemansveien 59 wk13
  { id: mkId('t22'), ansattId: mkId('a11'), prosjektId: mkId('p13'), startDato: '2026-03-23', sluttDato: '2026-03-27' },
  // Muhammed Sarr → Lindemansveien 59 wk13
  { id: mkId('t23'), ansattId: mkId('a24'), prosjektId: mkId('p13'), startDato: '2026-03-23', sluttDato: '2026-03-27' },
  // Petros Potsis → Steinhammerveien 6B wk13, Fiolveien 16B wk14-15, Lindemansveien 59 wk16-17
  { id: mkId('t24'), ansattId: mkId('a25'), prosjektId: mkId('p22'), startDato: '2026-03-23', sluttDato: '2026-03-27' },
  { id: mkId('t25'), ansattId: mkId('a25'), prosjektId: mkId('p8'),  startDato: '2026-03-30', sluttDato: '2026-04-10' },
  { id: mkId('t26'), ansattId: mkId('a25'), prosjektId: mkId('p13'), startDato: '2026-04-13', sluttDato: '2026-04-24' },
  // Pyrros Christou → Steinhammerveien 6B wk13, Lindemansveien 59 wk14-15
  { id: mkId('t27'), ansattId: mkId('a26'), prosjektId: mkId('p22'), startDato: '2026-03-23', sluttDato: '2026-03-27' },
  { id: mkId('t28'), ansattId: mkId('a26'), prosjektId: mkId('p13'), startDato: '2026-03-30', sluttDato: '2026-04-10' },
  // Sigurd Lind Aanby → Steinhammerveien 6B wk13, Ellingsrudveien 43 wk14+wk16, Lindemansveien 59 wk17-18
  { id: mkId('t29'), ansattId: mkId('a32'), prosjektId: mkId('p22'), startDato: '2026-03-23', sluttDato: '2026-03-27' },
  { id: mkId('t30'), ansattId: mkId('a32'), prosjektId: mkId('p7'),  startDato: '2026-03-30', sluttDato: '2026-04-03' },
  { id: mkId('t31'), ansattId: mkId('a32'), prosjektId: mkId('p7'),  startDato: '2026-04-13', sluttDato: '2026-04-17' },
  { id: mkId('t32'), ansattId: mkId('a32'), prosjektId: mkId('p13'), startDato: '2026-04-20', sluttDato: '2026-05-01' },
  // Abdul Malik → Steinhammerveien 6B wk13
  { id: mkId('t33'), ansattId: mkId('a0'),  prosjektId: mkId('p22'), startDato: '2026-03-23', sluttDato: '2026-03-27' },
  // Andrius Jauniskis → Fiolveien 16B wk13-15
  { id: mkId('t34'), ansattId: mkId('a3'),  prosjektId: mkId('p8'),  startDato: '2026-03-23', sluttDato: '2026-04-10' },
  // Rytis Jackevicius → Fiolveien 16B wk13-15
  { id: mkId('t35'), ansattId: mkId('a29'), prosjektId: mkId('p8'),  startDato: '2026-03-23', sluttDato: '2026-04-10' },
];

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  // Oppdater lokal timestamp slik at sky-data aldri overskriver nyere lokal data
  localStorage.setItem('fbs_updated_at', Date.now().toString());
}

export function getLocalUpdatedAt() {
  return parseInt(localStorage.getItem('fbs_updated_at') || '0', 10);
}

export function loadState() {
  // One-time migration: seed tildelinger from PDF import if none exist yet
  const existing = load('fbs_tildelinger', null);
  const seeded = localStorage.getItem('fbs_tildelinger_seeded');
  if (!seeded && (!existing || existing.length === 0)) {
    save('fbs_tildelinger', SEED_TILDELINGER);
    localStorage.setItem('fbs_tildelinger_seeded', '1');
  }

  // One-time migration: importer befaringer fra Steddy-eksport
  if (!localStorage.getItem('fbs_steddy_import_done')) {
    const existingBef = load('fbs_befaringer', []);
    const medId = STEDDY_BEFARINGER.map(b => ({ ...b, id: Math.random().toString(36).slice(2) + Date.now().toString(36) }));
    save('fbs_befaringer', [...existingBef, ...medId]);
    localStorage.setItem('fbs_steddy_import_done', '1');
  }

  return {
    ansatte: load('fbs_ansatte', SEED_ANSATTE),
    prosjekter: load('fbs_prosjekter', SEED_PROSJEKTER),
    tildelinger: load('fbs_tildelinger', SEED_TILDELINGER),
    oppgaver: load('fbs_oppgaver', []),
    fag: load('fbs_fag', DEFAULT_FAG),
    rorTimer: load('fbs_ror_timer', []),
    befaringer: load('fbs_befaringer', []),
    reklamasjoner: load('fbs_reklamasjoner', []),
    serviceJobber: load('fbs_service_jobber', []),
  };
}

export function saveAnsatte(data) { save('fbs_ansatte', data); }
export function saveProsjekter(data) { save('fbs_prosjekter', data); }
export function saveTildelinger(data) { save('fbs_tildelinger', data); }
export function saveOppgaver(data) { save('fbs_oppgaver', data); }
export function saveFag(data) { save('fbs_fag', data); }
export function saveRorTimer(data) { save('fbs_ror_timer', data); }
export function saveBefaringer(data) { save('fbs_befaringer', data); }
export function saveReklamasjoner(data) { save('fbs_reklamasjoner', data); }
export function saveServiceJobber(data) { save('fbs_service_jobber', data); }

export function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Date utils
export function isoToDate(str) {
  return str ? new Date(str + 'T00:00:00') : null;
}

export function dateToIso(d) {
  // Use local date (not UTC) to avoid timezone shift in Norwegian timezone
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(dateStr, n) {
  const d = isoToDate(dateStr);
  d.setDate(d.getDate() + n);
  return dateToIso(d);
}

export function weekStart(dateStr) {
  const d = isoToDate(dateStr);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return dateToIso(d);
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = isoToDate(dateStr);
  return d.toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function daysBetween(a, b) {
  const da = isoToDate(a);
  const db = isoToDate(b);
  return Math.round((db - da) / 86400000);
}

export function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}

// Cloud sync via Vercel KV
export async function loadFromCloud() {
  try {
    const res = await fetch('/api/state');
    if (!res.ok) return null;
    const data = await res.json();
    return Object.keys(data).length > 0 ? data : null;
  } catch {
    return null;
  }
}

export async function saveToCloud(state) {
  try {
    await fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...state, _updatedAt: getLocalUpdatedAt() }),
    });
  } catch {
    // localStorage er backup
  }
}
