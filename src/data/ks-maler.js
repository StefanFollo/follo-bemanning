// 34 sjekkliste-maler — Fase 3 datamodell
// Hierarki: gruppe → sjekkliste → sjekkpunkt
// Grupper: HMS | Sluttkontroll | Utførelse bad | Utførelse fasade |
//          Utførelse tak | Utførelse innvendig | Maling | Rørlegger | Elektrisk

const naa = new Date().toISOString();

function p(id, tekst, opts = {}) {
  return {
    id,
    tekst,                            // kort tittel (brukes i mobil-visning)
    beskrivelse: opts.beskrivelse || '', // AI fyller ut: regelverk, krav, how-to
    veiledning_kort: opts.veiledning || '', // én setning for mobil-hint
    regelverkLenker: opts.lenker || [], // [{ tekst, url }]
    krever_bilde: opts.bilde || false,
    krever_signering: opts.sign || false,
    kommentar_pakrevd: opts.kommentar || false,
  };
}

const KS_MALER_RAW = [

  // ════════════════════════════════════════════════════════════════════
  //  GRUPPE: HMS
  // ════════════════════════════════════════════════════════════════════

  {
    id: 'mal-hms-daglig',
    navn: 'HMS daglig sjekkliste',
    gruppe: 'HMS',
    kategori: 'hms',
    fag: [],
    obligatorisk: true,
    punkter: [
      p('d1', 'Vernerunde gjennomført på arbeidsstedet'),
      p('d2', 'Ryddig og orden på byggeplass — gangveier fri'),
      p('d3', 'Verneutstyr (hjelm, vernesko, refleks) i bruk'),
      p('d4', 'Stillas og stillasnett kontrollert og OK'),
      p('d5', 'Elektriske kabler og utstyr OK, ingen skader'),
      p('d6', 'Brannslukker tilgjengelig og kontrollert'),
      p('d7', 'Farlig avfall håndtert korrekt (asbest, maling, løsemidler)'),
      p('d8', 'Ingen nestenulykker eller ulykker å rapportere'),
      p('d9', 'Alle ansatte har bekreftet dagens arbeidsplan'),
    ],
    opprettet: naa, sist_endret: naa, endret_av: 'System', versjon: 1,
  },

  {
    id: 'mal-risikovurdering-oppstart',
    navn: 'Risikovurdering oppstart',
    gruppe: 'HMS',
    kategori: 'hms',
    fag: [],
    obligatorisk: true,
    punkter: [
      p('r1', 'Grunnforhold og fundamentering vurdert'),
      p('r2', 'Asbest- og miljøkartlegging gjennomført', { bilde: true, sign: true }),
      p('r3', 'Naborelasjon avklart — varslet berørte naboer'),
      p('r4', 'Adkomst og riggplass godkjent'),
      p('r5', 'Avfallshåndtering planlagt — container bestilt'),
      p('r6', 'Brannrisikovurdering gjennomført'),
      p('r7', 'Fallrisiko vurdert — stillas/liftkrav kartlagt'),
      p('r8', 'Graveforbud sjekket (kabelnett, rør etc.)', { sign: true }),
      p('r9', 'Verneutstyrskrav kommunisert til alle på prosjektet', { sign: true }),
      p('r10', 'SHA-koordinator utpekt for prosjektet'),
    ],
    opprettet: naa, sist_endret: naa, endret_av: 'System', versjon: 1,
  },

  {
    id: 'mal-sha-sja',
    navn: 'SHA-plan / Sikker jobb-analyse (SJA)',
    gruppe: 'HMS',
    kategori: 'hms',
    fag: [],
    obligatorisk: true,
    punkter: [
      p('s1', 'SHA-plan utarbeidet og signert av PL', { sign: true }),
      p('s2', 'Fareidentifikasjon gjennomgått med mannskapet'),
      p('s3', 'Tiltak mot identifiserte farer iverksatt'),
      p('s4', 'Beredskapsplan (brann, ulykke) på plass og kommunisert'),
      p('s5', 'Ansvarskjede for HMS dokumentert'),
      p('s6', 'Underentreprenørers SHA-krav avklart'),
      p('s7', 'Internkontroll-rutiner på plass'),
    ],
    opprettet: naa, sist_endret: naa, endret_av: 'System', versjon: 1,
  },

  // ════════════════════════════════════════════════════════════════════
  //  GRUPPE: Sluttkontroll
  // ════════════════════════════════════════════════════════════════════

  {
    id: 'mal-sluttkontroll',
    navn: 'Sluttkontroll prosjekt',
    gruppe: 'Sluttkontroll',
    kategori: 'hms',
    fag: [],
    obligatorisk: true,
    punkter: [
      p('sl1', 'Alle fagsjekklister er fullført og signert', { sign: true }),
      p('sl2', 'Avvik dokumentert og lukket — eller overlevert til kunde'),
      p('sl3', 'Rengjøring og rydding av byggeplass fullført'),
      p('sl4', 'Avfall sortert og hentet', { bilde: true }),
      p('sl5', 'Stillas demontert og areal frigjort'),
      p('sl6', 'Nøkler og adgang tilbakelevert kunde'),
      p('sl7', 'FDV-dokumentasjon (bruksanvisninger, tegninger) overlevert'),
      p('sl8', 'Sluttbefaring gjennomført med kunde', { sign: true }),
      p('sl9', 'Reklamasjonsfrister kommunisert til kunde'),
      p('sl10', 'Prosjekt avsluttet i bemanningsplanleggeren'),
    ],
    opprettet: naa, sist_endret: naa, endret_av: 'System', versjon: 1,
  },

  // ════════════════════════════════════════════════════════════════════
  //  GRUPPE: Utførelse bad
  // ════════════════════════════════════════════════════════════════════

  {
    id: 'mal-bad-riving',
    navn: 'Riving og forberedelse bad',
    gruppe: 'Utførelse bad',
    kategori: 'bad',
    fag: ['tomrer'],
    obligatorisk: false,
    punkter: [
      p('br1', 'Vanntilførsel stengt og avblommet'),
      p('br2', 'Asbest- og miljøkartlegging gjennomført før riving', { sign: true }),
      p('br3', 'Sanitærutstyr demontert og avhendet'),
      p('br4', 'Fliser og gulvbelegg fjernet — underlag kontrollert'),
      p('br5', 'Eksisterende membran/belegg fjernet', { bilde: true }),
      p('br6', 'Vegger og gulv kontrollert for råte og skader', { bilde: true }),
      p('br7', 'Skadede veggelementer/gulvbord skiftet ut', { sign: true }),
      p('br8', 'Underlag målt og avrettet til riktig fall mot sluk'),
    ],
    opprettet: naa, sist_endret: naa, endret_av: 'System', versjon: 1,
  },

  {
    id: 'mal-bad-membran',
    navn: 'Membran og våtrom',
    gruppe: 'Utførelse bad',
    kategori: 'bad',
    fag: ['tomrer', 'flis'],
    obligatorisk: false,
    punkter: [
      p('bm1', 'Underlag er rent, tørt og fast'),
      p('bm2', 'Fall mot sluk minimum 1:100 — kontrollert med vater', { bilde: true }),
      p('bm3', 'Sluk montert i korrekt høyde i forhold til ferdige fliser'),
      p('bm4', 'Membran lagt på sluk med min. 100 mm overlapp', { bilde: true, sign: true, kommentar: true }),
      p('bm5', 'Membran trukket opp 200 mm på alle vegger', { bilde: true }),
      p('bm6', 'Hjørner og gjennomføringer forsterket med duk/detaljtape', { bilde: true, sign: true }),
      p('bm7', 'Membrantykkelse iht. produktkrav kontrollert'),
      p('bm8', 'Herdingstid overholdt før flislegging startes', { sign: true }),
      p('bm9', 'Vanntetthetsprøve utført (om krevd)', { bilde: true, sign: true }),
    ],
    opprettet: naa, sist_endret: naa, endret_av: 'System', versjon: 1,
  },

  {
    id: 'mal-bad-flis',
    navn: 'Flislegging bad',
    gruppe: 'Utførelse bad',
    kategori: 'bad',
    fag: ['flis'],
    obligatorisk: false,
    punkter: [
      p('bf1', 'Membran kontrollert OK før oppstart'),
      p('bf2', 'Riktig flislim brukt iht. underlag og flistype', { kommentar: true }),
      p('bf3', 'Gulvflis lagt med korrekt fall mot sluk — kontrollert'),
      p('bf4', 'Veggflis rett og i vater'),
      p('bf5', 'Fuger er jevne og minimumskrav overholdt'),
      p('bf6', 'Bevegelig fuge ved gulv-vegg-overgang og hjørner'),
      p('bf7', 'Gulvflis kontrollert for hulrom (banketest)', { sign: true }),
      p('bf8', 'Fugning gjort med godkjent fugemasse for våtsone'),
      p('bf9', 'Sluk og kanter forseglet og tette', { bilde: true }),
    ],
    opprettet: naa, sist_endret: naa, endret_av: 'System', versjon: 1,
  },

  {
    id: 'mal-bad-ror',
    navn: 'Sanitæranlegg — rørlegger',
    gruppe: 'Utførelse bad',
    kategori: 'bad',
    fag: ['ror'],
    obligatorisk: false,
    punkter: [
      p('bro1', 'Rørgjennomføringer i membran tette og godkjente', { bilde: true, sign: true }),
      p('bro2', 'Avløpsstige og rørføring iht. tegning'),
      p('bro3', 'Sluk av godkjent type og korrekt montert', { bilde: true }),
      p('bro4', 'Dusjnisje / badekar montert og tilkoblet'),
      p('bro5', 'WC montert og tett — prøvetrykt', { sign: true }),
      p('bro6', 'Vask og blandebatteri montert og tett'),
      p('bro7', 'Varmekabel / varmeplan iht. prosjekt'),
      p('bro8', 'Trykktesting av rørinstallasjon utført', { bilde: true, sign: true }),
    ],
    opprettet: naa, sist_endret: naa, endret_av: 'System', versjon: 1,
  },

  {
    id: 'mal-bad-el',
    navn: 'Elektrisk bad',
    gruppe: 'Utførelse bad',
    kategori: 'bad',
    fag: ['el'],
    obligatorisk: false,
    punkter: [
      p('be1', 'Jordfeilbryter (HPFI) installert på kurs for bad', { sign: true }),
      p('be2', 'Uttakshøyder iht. sone-krav (sone 0/1/2/3)', { bilde: true, sign: true }),
      p('be3', 'Varmekabel montert iht. anvisning — dokumentasjon vedlagt', { bilde: true }),
      p('be4', 'Termostat for varmekabel kontrollert og funksjonell'),
      p('be5', 'Belysning i tak montert og godkjent for våtsone', { sign: true }),
      p('be6', 'Elektriker-attest (SUT) innhentet', { sign: true }),
    ],
    opprettet: naa, sist_endret: naa, endret_av: 'System', versjon: 1,
  },

  // ════════════════════════════════════════════════════════════════════
  //  GRUPPE: Utførelse fasade
  // ════════════════════════════════════════════════════════════════════

  {
    id: 'mal-fasade-stillas',
    navn: 'Stillas og fallsikring fasade',
    gruppe: 'Utførelse fasade',
    kategori: 'fasade',
    fag: [],
    obligatorisk: false,
    punkter: [
      p('fs1', 'Stillas montert og godkjent av sertifisert montør', { sign: true }),
      p('fs2', 'Stillasplan og lasteberegning foreligger'),
      p('fs3', 'Rekkverk og sikringsnett montert iht. krav', { bilde: true }),
      p('fs4', 'Adgangsstige sikret og låsbar'),
      p('fs5', 'Stillas inspisert ukentlig og etter storm', { kommentar: true }),
      p('fs6', 'Vernebord (sprutbrett) på vegger mot offentlig areal'),
    ],
    opprettet: naa, sist_endret: naa, endret_av: 'System', versjon: 1,
  },

  {
    id: 'mal-fasade-riving',
    navn: 'Riving og demontering fasade',
    gruppe: 'Utførelse fasade',
    kategori: 'fasade',
    fag: ['tomrer'],
    obligatorisk: false,
    punkter: [
      p('fr1', 'Asbest kartlagt — prøver tatt ved behov', { sign: true }),
      p('fr2', 'Vindskier, vannbord og beslag demontert'),
      p('fr3', 'Gammel kledning fjernet — underlag kontrollert', { bilde: true }),
      p('fr4', 'Råteskader kartlagt og dokumentert', { bilde: true, kommentar: true }),
      p('fr5', 'Råteskadet materiale skiftet og godkjent', { sign: true }),
    ],
    opprettet: naa, sist_endret: naa, endret_av: 'System', versjon: 1,
  },

  {
    id: 'mal-fasade-underlag',
    navn: 'Underlag, vindsperre og isolasjon fasade',
    gruppe: 'Utførelse fasade',
    kategori: 'fasade',
    fag: ['tomrer'],
    obligatorisk: false,
    punkter: [
      p('fu1', 'Isolasjon av korrekt type og tykkelse montert', { kommentar: true }),
      p('fu2', 'Dampsperre intakt og tapet — ingen hull', { bilde: true }),
      p('fu3', 'Vindsperre montert med overlapp min. 100 mm', { bilde: true }),
      p('fu4', 'Vindsperre lektet ut med godkjent lektedimensjon'),
      p('fu5', 'Gjennomføringer (rør, kabler) tette og detaljert', { sign: true }),
    ],
    opprettet: naa, sist_endret: naa, endret_av: 'System', versjon: 1,
  },

  {
    id: 'mal-fasade-kledning',
    navn: 'Panel og kledning fasade',
    gruppe: 'Utførelse fasade',
    kategori: 'fasade',
    fag: ['tomrer'],
    obligatorisk: false,
    punkter: [
      p('fk1', 'Trevirke av riktig klasse og trekklass', { kommentar: true }),
      p('fk2', 'Kledning montert med korrekt luftspalte (min. 25 mm)'),
      p('fk3', 'Horisontal kledning skrå for vannavrenning'),
      p('fk4', 'Hjørner, rundt vinduer og dører korrekt avsluttet', { bilde: true }),
      p('fk5', 'Spiker/skruer av rustfritt stål eller varmgalvanisert'),
      p('fk6', 'Nedre avslutning med mus-/insektsperre'),
    ],
    opprettet: naa, sist_endret: naa, endret_av: 'System', versjon: 1,
  },

  {
    id: 'mal-fasade-vinduer',
    navn: 'Vinduer og dører — montering',
    gruppe: 'Utførelse fasade',
    kategori: 'fasade',
    fag: ['tomrer'],
    obligatorisk: false,
    punkter: [
      p('fv1', 'Vinduer/dører i riktig mål og type iht. bestilling'),
      p('fv2', 'Karm montert loddrett og vannrett', { bilde: true }),
      p('fv3', 'Fuging mot karm med godkjent kompriband og akryl', { bilde: true, sign: true }),
      p('fv4', 'Vannbord montert med fall utover og fuget', { bilde: true }),
      p('fv5', 'Vindsperre/dampsperre tilkoblet karm og tapet'),
      p('fv6', 'Beslag over vindu (soilbeslag) montert korrekt'),
      p('fv7', 'Vinduer og dører åpner/lukker korrekt og uten motstand'),
    ],
    opprettet: naa, sist_endret: naa, endret_av: 'System', versjon: 1,
  },

  {
    id: 'mal-fasade-beslag',
    navn: 'Beslag og tetting fasade',
    gruppe: 'Utførelse fasade',
    kategori: 'fasade',
    fag: ['tomrer'],
    obligatorisk: false,
    punkter: [
      p('fb1', 'Vindskier og beslag montert og festet'),
      p('fb2', 'Fotbeslag langs fundament montert med fall utover', { bilde: true }),
      p('fb3', 'Hjørnebeslag montert og tette'),
      p('fb4', 'Alle gjennomføringer (rør, kabler) tette', { sign: true }),
      p('fb5', 'Visuell kontroll av hele fasade etter nedbør', { bilde: true }),
    ],
    opprettet: naa, sist_endret: naa, endret_av: 'System', versjon: 1,
  },

  // ════════════════════════════════════════════════════════════════════
  //  GRUPPE: Utførelse tak
  // ════════════════════════════════════════════════════════════════════

  {
    id: 'mal-tak-stillas',
    navn: 'Stillas og fallsikring tak',
    gruppe: 'Utførelse tak',
    kategori: 'tak',
    fag: [],
    obligatorisk: false,
    punkter: [
      p('ts1', 'Takstillas eller fallsikringsliner montert og godkjent', { sign: true }),
      p('ts2', 'Sikringsutstyr (sele, line) kontrollert og godkjent'),
      p('ts3', 'Takrennestige sikret og rett montert'),
      p('ts4', 'Varsling av naboer og fotgjengere iht. behov'),
    ],
    opprettet: naa, sist_endret: naa, endret_av: 'System', versjon: 1,
  },

  {
    id: 'mal-tak-riving',
    navn: 'Riving gammelt tak',
    gruppe: 'Utførelse tak',
    kategori: 'tak',
    fag: ['tomrer'],
    obligatorisk: false,
    punkter: [
      p('tr1', 'Asbest i takpapp kartlagt og prøvetatt', { sign: true }),
      p('tr2', 'Takstein/papp fjernet og avhendet forsvarlig'),
      p('tr3', 'Undertak fjernet — takstoler/sperrer kontrollert', { bilde: true }),
      p('tr4', 'Råte og insektskader på takstoler kartlagt', { bilde: true, kommentar: true }),
      p('tr5', 'Skadede konstruksjoner utbedret og godkjent', { sign: true }),
    ],
    opprettet: naa, sist_endret: naa, endret_av: 'System', versjon: 1,
  },

  {
    id: 'mal-tak-undertak',
    navn: 'Undertak og lekting',
    gruppe: 'Utførelse tak',
    kategori: 'tak',
    fag: ['tomrer'],
    obligatorisk: false,
    punkter: [
      p('tu1', 'Undertak av godkjent type montert — overlapp korrekt', { bilde: true }),
      p('tu2', 'Undertak limt/tapet i møne og rundt gjennomføringer', { sign: true }),
      p('tu3', 'Luftelekter montert (min. 23 mm) for ventilasjon'),
      p('tu4', 'Bærende lekter i riktig dimensjon og c/c-avstand'),
      p('tu5', 'Mønebeslag og takfotsbeslag montert'),
    ],
    opprettet: naa, sist_endret: naa, endret_av: 'System', versjon: 1,
  },

  {
    id: 'mal-tak-tekking',
    navn: 'Taktekking',
    gruppe: 'Utførelse tak',
    kategori: 'tak',
    fag: ['tomrer'],
    obligatorisk: false,
    punkter: [
      p('tt1', 'Riktig takstein/papp type iht. takhelling og bestilling', { kommentar: true }),
      p('tt2', 'Stein/papp lagt fra bunn og overlapp i riktig retning'),
      p('tt3', 'Møne og utkraginger korrekt utført', { bilde: true }),
      p('tt4', 'Takstein festet med stifter/skruer iht. vindkrav'),
      p('tt5', 'Rundt skorstein og takgjennomføringer godkjent bly/beslag', { bilde: true, sign: true }),
      p('tt6', 'Takrenner og nedløp montert og festet, fall mot nedløp'),
    ],
    opprettet: naa, sist_endret: naa, endret_av: 'System', versjon: 1,
  },

  {
    id: 'mal-tak-beslag',
    navn: 'Beslag og renner tak',
    gruppe: 'Utførelse tak',
    kategori: 'tak',
    fag: ['tomrer'],
    obligatorisk: false,
    punkter: [
      p('tb1', 'Takrenner i riktig fall (min. 3 mm/m mot nedløp)'),
      p('tb2', 'Nedløp festet og rett mot kloakk/bortledning'),
      p('tb3', 'Drippbeslag (snøfanger/isfanger) montert ved behov'),
      p('tb4', 'Alle beslag av rustfri/varmgalvanisert kvalitet'),
    ],
    opprettet: naa, sist_endret: naa, endret_av: 'System', versjon: 1,
  },

  // ════════════════════════════════════════════════════════════════════
  //  GRUPPE: Utførelse innvendig
  // ════════════════════════════════════════════════════════════════════

  {
    id: 'mal-tomrer-riving',
    navn: 'Riving innvendig',
    gruppe: 'Utførelse innvendig',
    kategori: 'tomrer',
    fag: ['tomrer'],
    obligatorisk: false,
    punkter: [
      p('ti1', 'Asbest og farlige stoffer kartlagt', { sign: true }),
      p('ti2', 'Strøm og vann stengt før rivingsstart'),
      p('ti3', 'Bærende vegger og dekker identifisert — IKKE revet uten godkjenning', { sign: true }),
      p('ti4', 'Avfall sortert og merket (trevirke, gips, metall etc.)', { bilde: true }),
      p('ti5', 'Rivingsomfang iht. tegning og bestilling kontrollert'),
    ],
    opprettet: naa, sist_endret: naa, endret_av: 'System', versjon: 1,
  },

  {
    id: 'mal-tomrer-baerende',
    navn: 'Bærekonstruksjoner og bindingsverk',
    gruppe: 'Utførelse innvendig',
    kategori: 'tomrer',
    fag: ['tomrer'],
    obligatorisk: false,
    punkter: [
      p('bb1', 'Bærekonstruksjon kontrollert mot tegning', { sign: true }),
      p('bb2', 'Bindingsverk i riktig dimensjon og c/c-avstand'),
      p('bb3', 'Åpning i bærende vegg sikret med bjelke/søyle', { bilde: true, sign: true }),
      p('bb4', 'Avstandslister og distansebrikker korrekt montert'),
      p('bb5', 'Fukt- og råteskader i konstruksjonen kartlagt og utbedret', { bilde: true }),
    ],
    opprettet: naa, sist_endret: naa, endret_av: 'System', versjon: 1,
  },

  {
    id: 'mal-tomrer-isolasjon',
    navn: 'Isolasjon og dampsperre',
    gruppe: 'Utførelse innvendig',
    kategori: 'tomrer',
    fag: ['tomrer'],
    obligatorisk: false,
    punkter: [
      p('is1', 'Isolasjonstype og tykkelse iht. prosjekt', { kommentar: true }),
      p('is2', 'Isolasjon uten hull og løse ender — kompakt'),
      p('is3', 'Dampsperre montert på varm side av konstruksjonen', { bilde: true, sign: true }),
      p('is4', 'Dampsperre overlappet og tapet i alle skjøter', { bilde: true }),
      p('is5', 'Gjennomføringer detaljert og tettede', { sign: true }),
      p('is6', 'Luftetetting i topp og bunn av yttervegg'),
    ],
    opprettet: naa, sist_endret: naa, endret_av: 'System', versjon: 1,
  },

  {
    id: 'mal-tomrer-gips',
    navn: 'Gips og innkledning',
    gruppe: 'Utførelse innvendig',
    kategori: 'tomrer',
    fag: ['tomrer'],
    obligatorisk: false,
    punkter: [
      p('gi1', 'Gipstype korrekt for romfunksjon (standard, vann- eller brannmotstandig)'),
      p('gi2', 'Gipsplater montert rett og i vater'),
      p('gi3', 'Skruer i riktig c/c-avstand og i flukt'),
      p('gi4', 'Skjøter stagget mellom plater'),
      p('gi5', 'Gjennomføringer kuttet ryddig — ingen løse kanter'),
      p('gi6', 'Alle indre hjørner og møtepunkter avsluttet korrekt'),
    ],
    opprettet: naa, sist_endret: naa, endret_av: 'System', versjon: 1,
  },

  {
    id: 'mal-tomrer-gulv',
    navn: 'Gulvlegging',
    gruppe: 'Utførelse innvendig',
    kategori: 'tomrer',
    fag: ['tomrer'],
    obligatorisk: false,
    punkter: [
      p('gl1', 'Underlag kontrollert for fukt — fuktmåling dokumentert', { bilde: true, sign: true }),
      p('gl2', 'Avrettingsmasse jevn og herdet'),
      p('gl3', 'Gulvtype og limsystem iht. produktkrav', { kommentar: true }),
      p('gl4', 'Ekspansjonsfuge langs vegger overalt'),
      p('gl5', 'Gulv rettlinjet og uten hopp > 3 mm/2m'),
      p('gl6', 'Overganger mot andre gulvtyper korrekt avsluttet'),
    ],
    opprettet: naa, sist_endret: naa, endret_av: 'System', versjon: 1,
  },

  // ════════════════════════════════════════════════════════════════════
  //  GRUPPE: Maling
  // ════════════════════════════════════════════════════════════════════

  {
    id: 'mal-maling-sparkling',
    navn: 'Sparkling og overflatebehandling',
    gruppe: 'Maling',
    kategori: 'maler',
    fag: ['maler'],
    obligatorisk: false,
    punkter: [
      p('ms1', 'Underlag rent, tørt og fritt for fett/støv'),
      p('ms2', 'Sprekker og hull sparklet og slipt'),
      p('ms3', 'Gipsskjøter og hjørner sparklet — min. 2 lag'),
      p('ms4', 'Skruhoder fylt og slipt'),
      p('ms5', 'Overflate finslipet og kontrollert under sidelys', { bilde: true }),
      p('ms6', 'Grunnmaling påført iht. produkt-spesifikasjon'),
    ],
    opprettet: naa, sist_endret: naa, endret_av: 'System', versjon: 1,
  },

  {
    id: 'mal-maling-innvendig',
    navn: 'Maling innvendig',
    gruppe: 'Maling',
    kategori: 'maler',
    fag: ['maler'],
    obligatorisk: false,
    punkter: [
      p('mi1', 'Malingstype og NCS-farge iht. bestilling', { kommentar: true }),
      p('mi2', 'Grunnmaling herdet før mellomstrøk'),
      p('mi3', 'Minimum 2 strøk maling — 3 strøk ved mørke farger'),
      p('mi4', 'Listverk og hjørner korrekt maskert og malt'),
      p('mi5', 'Rundt uttak og brytere ren avslutning'),
      p('mi6', 'Taket malt uten takskygger eller striper'),
      p('mi7', 'Sluttbefaring maling — ingen skvetter, striper eller glippfeil', { bilde: true }),
    ],
    opprettet: naa, sist_endret: naa, endret_av: 'System', versjon: 1,
  },

  {
    id: 'mal-maling-utvendig',
    navn: 'Maling utvendig',
    gruppe: 'Maling',
    kategori: 'fasade',
    fag: ['maler'],
    obligatorisk: false,
    punkter: [
      p('mu1', 'Vær og temperatur OK for maling (5–25°C, ingen nedbør)'),
      p('mu2', 'Underlag rent og tørt — gammelt løst maling fjernet'),
      p('mu3', 'Grunning/bunnmaling iht. produkt og trevirke-type', { kommentar: true }),
      p('mu4', 'Mellomstrøk påført og herdet'),
      p('mu5', 'Toppstrøk påført — dekkevne kontrollert'),
      p('mu6', 'Vinduer og beslag maskert og rengjort'),
    ],
    opprettet: naa, sist_endret: naa, endret_av: 'System', versjon: 1,
  },

  // ════════════════════════════════════════════════════════════════════
  //  GRUPPE: Rørlegger
  // ════════════════════════════════════════════════════════════════════

  {
    id: 'mal-ror-vvs',
    navn: 'VVS-installasjon generell',
    gruppe: 'Rørlegger',
    kategori: 'ror',
    fag: ['ror'],
    obligatorisk: false,
    punkter: [
      p('rv1', 'Rørplan gjennomgått og godkjent av PL', { sign: true }),
      p('rv2', 'Rørgjennomføringer i brannvegger branntette', { bilde: true, sign: true }),
      p('rv3', 'Rørskjøter kontrollert for lekkasje'),
      p('rv4', 'Isolasjon av rør iht. krav (varme/kalde rør)'),
      p('rv5', 'Stoppekraner tilgjengelig og merket'),
      p('rv6', 'Trykktesting av anlegg utført og dokumentert', { bilde: true, sign: true }),
    ],
    opprettet: naa, sist_endret: naa, endret_av: 'System', versjon: 1,
  },

  {
    id: 'mal-ror-varme',
    navn: 'Varmtvannsbereder og varmeanlegg',
    gruppe: 'Rørlegger',
    kategori: 'ror',
    fag: ['ror'],
    obligatorisk: false,
    punkter: [
      p('va1', 'Bereder av riktig kapasitet og montert iht. krav'),
      p('va2', 'Ekspansjonskar og sikkerhetsventil montert og kontrollert', { sign: true }),
      p('va3', 'Varmeanlegg (radiatorer/gulvvarme) tett — trykkprøvet', { bilde: true, sign: true }),
      p('va4', 'Termostat og regulering funksjonell og kalibrert'),
      p('va5', 'Automatisk lufting montert på høyeste punkt'),
    ],
    opprettet: naa, sist_endret: naa, endret_av: 'System', versjon: 1,
  },

  {
    id: 'mal-ror-avlop',
    navn: 'Avløp og sanitær',
    gruppe: 'Rørlegger',
    kategori: 'ror',
    fag: ['ror'],
    obligatorisk: false,
    punkter: [
      p('as1', 'Avløpsledninger montert med korrekt fall (min. 1,5 %)'),
      p('as2', 'Rensepunkter tilgjengelig på hver loddrett gren'),
      p('as3', 'Vannlås montert på alle avløpsarmaturer'),
      p('as4', 'Avløpsprøve utført — ingen lekkasjer', { sign: true }),
      p('as5', 'Tilkobling til kommunalt nett dokumentert'),
    ],
    opprettet: naa, sist_endret: naa, endret_av: 'System', versjon: 1,
  },

  // ════════════════════════════════════════════════════════════════════
  //  GRUPPE: Elektrisk
  // ════════════════════════════════════════════════════════════════════

  {
    id: 'mal-el-innvendig',
    navn: 'Elektrisk innvendig',
    gruppe: 'Elektrisk',
    kategori: 'el',
    fag: ['el'],
    obligatorisk: false,
    punkter: [
      p('ei1', 'El-arbeider utføres av godkjent elektriker', { sign: true }),
      p('ei2', 'Kursfortegnelse oppdatert for nye kurser'),
      p('ei3', 'Kabler i rør eller bak plate — ingen eksponerte kabler'),
      p('ei4', 'Uttak og brytere på riktig høyde iht. NS-EN'),
      p('ei5', 'Jordfeilbrytere (HPFI/RCD) i alle relevante kurser', { sign: true }),
    ],
    opprettet: naa, sist_endret: naa, endret_av: 'System', versjon: 1,
  },

  {
    id: 'mal-el-kurs',
    navn: 'Kurssikring og jordfeil',
    gruppe: 'Elektrisk',
    kategori: 'el',
    fag: ['el'],
    obligatorisk: false,
    punkter: [
      p('ek1', 'Sikringskap i orden og merket korrekt', { bilde: true }),
      p('ek2', 'Jordfeilbrytere testet (test-knapp) og OK', { sign: true }),
      p('ek3', 'Overspenningsvern montert der krevd'),
      p('ek4', 'Kapslingsgrad (IP) kontrollert for rom/bruksområde'),
    ],
    opprettet: naa, sist_endret: naa, endret_av: 'System', versjon: 1,
  },

  {
    id: 'mal-el-slutt',
    navn: 'Elektrisk sluttkontroll',
    gruppe: 'Elektrisk',
    kategori: 'el',
    fag: ['el'],
    obligatorisk: false,
    punkter: [
      p('es1', 'Elektriker-attest (SUT) innhentet og arkivert', { bilde: true, sign: true }),
      p('es2', 'Sluttkontroll-protokoll fra elektriker foreligger', { sign: true }),
      p('es3', 'Alle kurser testet og funksjonelle'),
      p('es4', 'Brannvarsling/røykvarslere testet og OK'),
      p('es5', 'Belysning komplett og funksjonell'),
    ],
    opprettet: naa, sist_endret: naa, endret_av: 'System', versjon: 1,
  },
];

// ─── Berik maler med fase og kilde ─────────────────────────────────────
// Gjøres via map() slik at INGEN eksisterende punkter eller beskrivelser endres.
// Fase-logikk basert på gruppe og ID:
//   HMS daglig → 'daglig'
//   HMS (risikovurdering, SHA) → 'oppstart'
//   Sluttkontroll + el-slutt → 'slutt'
//   Alt annet (bygg-arbeid) → 'bygg'
function tildelFase(m) {
  if (m.id === 'mal-hms-daglig') return 'daglig'
  if (m.gruppe === 'HMS') return 'oppstart'
  if (m.gruppe === 'Sluttkontroll' || m.id === 'mal-el-slutt') return 'slutt'
  return 'bygg'
}

export const KS_MALER = KS_MALER_RAW.map(m => ({
  ...m,
  fase: m.fase || tildelFase(m),
  kilde: m.kilde || 'follo',
}))

// ─── Pakke-definisjoner ─────────────────────────────────────────────────
// Brukes for auto-forslag ved prosjekt-opprettelse.
// autoVed: 'alle' | jobbType-nøkkel | 'slutt'
export const KS_PAKKER = [
  {
    id: 'pakke-hms', navn: 'HMS-pakke', ikon: '🦺',
    beskrivelse: 'Obligatorisk på alle prosjekter',
    malIds: ['mal-hms-daglig', 'mal-risikovurdering-oppstart', 'mal-sha-sja', 'mal-sluttkontroll'],
    autoVed: 'alle',
  },
  {
    id: 'pakke-bad', navn: 'Bad-rehab', ikon: '🛁',
    beskrivelse: 'Automatisk for bad-prosjekter',
    malIds: ['mal-bad-riving', 'mal-bad-membran', 'mal-bad-flis', 'mal-bad-ror'],
    autoVed: 'bad',
  },
  {
    id: 'pakke-fasade', navn: 'Fasade-rehab', ikon: '🏠',
    beskrivelse: 'Automatisk for fasade-prosjekter',
    malIds: ['mal-fasade-stillas', 'mal-fasade-riving', 'mal-fasade-underlag', 'mal-fasade-kledning', 'mal-fasade-vinduer', 'mal-fasade-beslag', 'mal-maling-utvendig', 'mal-tak-beslag'],
    autoVed: 'fasade',
  },
  {
    id: 'pakke-tilbygg', navn: 'Tilbygg', ikon: '🏗',
    beskrivelse: 'Automatisk for tilbygg-prosjekter',
    malIds: ['mal-risikovurdering-oppstart', 'mal-sha-sja', 'mal-tomrer-riving', 'mal-tomrer-baerende', 'mal-tomrer-isolasjon', 'mal-tomrer-gips', 'mal-tomrer-gulv', 'mal-fasade-stillas', 'mal-tak-stillas', 'mal-tak-undertak', 'mal-tak-tekking', 'mal-el-innvendig', 'mal-sluttkontroll'],
    autoVed: 'tilbygg',
  },
  {
    id: 'pakke-slutt', navn: 'Sluttkontroll', ikon: '🔨',
    beskrivelse: 'Automatisk ved slutt-fase i framdriftsplan',
    malIds: ['mal-sluttkontroll', 'mal-el-slutt'],
    autoVed: 'slutt',
  },
]

export default KS_MALER;
