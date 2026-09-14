import type { PoiCategory, TravelMode } from '../types.js';

/**
 * Deutsche Texte -- die Urfassung.
 *
 * Aus diesem Objekt wird der Typ `Texts` abgeleitet. Jede weitere Sprache muss
 * ihn erfüllen, sonst schlägt der Typecheck fehl: Ein vergessener Text kann so
 * nicht bis in die Oberfläche durchrutschen.
 *
 * Texte mit Platzhaltern sind Funktionen statt Vorlagen mit `{0}`. Das kostet
 * eine Zeile mehr, prüft dafür Anzahl und Typ der Werte beim Übersetzen mit.
 */
export const de = {
  app: {
    title: 'Wohnzone',
    subtitle: 'Sieh, wo du wohnen kannst, damit alles in deiner Zeit erreichbar bleibt.',
    tablistLabel: 'Bereiche',
    languageLabel: 'Sprache',
    /** Für Zahlenformate -- im Deutschen 2,3 km, im Englischen 2.3 km. */
    locale: 'de-DE',
  },

  tabs: {
    targets: 'Meine Ziele',
    addresses: 'Adressen prüfen',
  },

  /**
   * Erscheinungsbild. "Wie das System" ist bewusst keine dritte Farbe, sondern
   * die Ansage, nicht wählen zu wollen -- der Text muss das sagen, sonst liest
   * es sich wie ein weiterer Modus neben Hell und Dunkel.
   */
  appearance: {
    label: 'Erscheinungsbild',
    system: 'Wie das System',
    light: 'Hell',
    dark: 'Dunkel',
  },

  analysis: {
    computing: 'Gemeinsame Region wird berechnet…',
    none: 'Es gibt keinen Bereich, aus dem alle Ziele in deiner Zeit erreichbar sind.',
    checkingPlaces: 'Erreichbarkeit der gewählten Orte wird geprüft…',
    targetBusy: (name: string) => `Erreichbarer Bereich für ${name} wird berechnet…`,
    categoryBusy: (plural: string) => `${plural} werden gesucht…`,
  },

  target: {
    heading: 'Neues Ziel',
    nameField: 'Name',
    addressField: 'Adresse',
    travelModeField: 'Verkehrsmittel',
    minutesField: (max: number) => `Max. Reisezeit (Minuten, max. ${max})`,
    cancel: 'Abbrechen',
    namePlaceholder: 'Eltern A',
    addressPlaceholder: 'Münster',
    whichAddress: 'Welche Adresse meinst du?',
    submit: 'Übernehmen',
    submitHint: 'Mit Enter bestätigen',
    submitting: 'Wird berechnet…',
    travelModeLabel: (name: string) => `Verkehrsmittel ${name}`,
    minutesLabel: (name: string) => `Reisezeit ${name} in Minuten`,
    minutesUnit: 'Min.',
    applyTitle: 'Geänderte Reisezeit übernehmen',
    applyLabel: (name: string) => `Reisezeit ${name} übernehmen`,
    hideLabel: (name: string) => `${name} auf der Karte ausblenden`,
    showLabel: (name: string) => `${name} wieder einblenden`,
    hideTitle: 'Auf der Karte ausblenden (zählt weiter mit)',
    showTitle: 'Wieder einblenden',
    removeLabel: (name: string) => `${name} entfernen`,
    // Bewusst nicht "Isochrone": Das Wort steht sonst nirgends in der
    // Oberfläche, und wer sie nur vorgelesen bekommt, hörte es ständig.
    computing: (travelMode: string) => `Erreichbarer Bereich wird berechnet (${travelMode})…`,
    add: '+ Ziel hinzufügen',
    retry: 'Erneut versuchen',
    addressNotFound: (address: string) => `Die Adresse „${address}" konnte nicht gefunden werden.`,
  },

  poi: {
    heading: 'Was brauche ich in der Nähe?',
    needsRegion: 'Setz zuerst Ziele — die Suche braucht eine gemeinsame Region.',
    addCondition: 'Bedingung hinzufügen',
    addConditionOption: '+ Bedingung hinzufügen',
    removeLabel: (category: string) => `${category} entfernen`,
    // Das Feld ist ausdrücklich kein Fahrzeit-Wert, sondern ein Luftlinien-
    // Radius; die echte Fahrzeit entsteht erst beim Knopf im Dock.
    radiusLabel: (category: string) => `Suchradius ${category}`,
    radiusUnit: 'Min.',
    travelModeLabel: (category: string) => `Verkehrsmittel ${category}`,
    search: 'Orte suchen',
    blocking: 'Diese Bedingung allein lässt nichts von der gemeinsamen Region übrig.',
    foundCount: (found: number, entries: number) => `${found} gefunden, ${entries} Einträge`,
    expandBranches: (label: string) => `Filialen von ${label} ausklappen`,
    collapseBranches: (label: string) => `Filialen von ${label} einklappen`,
    sortHint:
      'Oben: belegt große Fläche, dann Ketten, dann Unbekanntes. Nichts wird ausgeblendet — OSM kennt die Größe nur für einen Teil.',
    searching: 'Wird gesucht…',
    searchingSuffix: ' · sucht…',
    notSearched: ' · nicht gesucht',
    selectedCount: (n: number) => ` · ${n} gewählt`,
    sortLabel: 'Sortierung',
    sortByRelevance: 'Große zuerst',
    sortByDistance: 'Nächste zuerst',
    insideRegion: 'in der Region',
    // OSM führt für diesen Ort kein name-Tag. Steht in der Liste anstelle des
    // Namens -- der Ort selbst ist deshalb nicht weniger brauchbar.
    unnamed: 'Ohne Namen',
    memberLabel: (name: string, km: string) => `${name} (${km} km)`,
    outsideRegion: (km: string) => `${km} km außerhalb`,
    area: (squareMeters: number, approximate: boolean) =>
      ` · ${approximate ? 'bis ' : ''}${squareMeters} m²`,
  },

  apply: {
    placeOne: 'Ort',
    placeMany: 'Orte',
    button: (n: number, unit: string) => `Erreichbarkeit berechnen (${n} ${unit})`,
    busy: (n: number, unit: string) => `${n} ${unit} werden geprüft…`,
    blockedBy: (categories: string) => ` Daran liegt es: ${categories}.`,
    blockedByCombination: ' Jede Bedingung für sich passt — erst die Kombination ist zu streng.',
    tooMany: (selected: number, max: number) =>
      `${selected} Orte ausgewählt — höchstens ${max} auf einmal. Nimm ein paar Häkchen heraus.`,
    regionEmpty: 'Kein Bereich erfüllt alle Bedingungen gleichzeitig.',
    nothingSelected: 'Noch nichts ausgewählt — die Bedingungen sind inaktiv.',
    upToDate: 'Die Region berücksichtigt die gewählten Orte.',
    selected: (n: number, unit: string) => `${n} ${unit} angehakt.`,
  },

  address: {
    heading: 'Adressen prüfen',
    intro:
      'Sammle Adressen und sieh auf einen Blick, welche die Hauptkriterien (hell) und welche zusätzlich die gewählten Orte (dunkel) erfüllen.',
    queryField: 'Ort oder Adresse',
    emptyList:
      'Noch kein Ort geprüft. Jeder hinzugefügte Ort bleibt in der Liste und wird neu bewertet, sobald sich Ziele oder Auswahl ändern.',
    travelTimesHint:
      'Gemessen auf der schnellsten Route, ohne Verkehrslage. Direkt an der Grenze kann die Isochrone minimal abweichen.',
    placeholder: 'z. B. Musterstraße 1, Oldenburg',
    add: 'Adresse hinzufügen',
    adding: 'Wird gesucht…',
    chooseMatch: 'Bitte wähle den passenden Treffer:',
    empty: 'Bitte gib eine Adresse ein.',
    duplicate: (label: string) => `„${label}" steht bereits in der Liste.`,
    notFound: (label: string) => `Die Adresse „${label}" konnte nicht gefunden werden.`,
    removeLabel: (label: string) => `${label} entfernen`,
    removeTitle: 'Adresse entfernen',
    noRoute: 'Der Kartendienst kennt dorthin keine Route.',
    noRouteShort: 'keine Route',
    limit: (minutes: number) => `max. ${minutes} Min`,
    needsTargets: 'Lege zuerst ein Ziel an, dann steht hier die Fahrzeit dorthin.',
    overBy: (minutes: number) => `+${minutes} Min`,

    targetsMet: 'Alle Ziele erreichbar',
    targetsUnmet: 'Nicht alle Ziele erreichbar',
    targetsUnknown: 'Noch keine Region berechnet',
    placesMet: 'Gewählte Orte erreichbar',
    placesUnmet: 'Gewählte Orte nicht erreichbar',
    placesUnknown: 'Noch keine Orte übernommen',

    insideRegion: 'Liegt in der gemeinsamen Region.',
    outsideRegion: 'Liegt außerhalb der gemeinsamen Region.',
    regionMissing: 'Setz zuerst Ziele — die Region entsteht dann von allein.',
    placesReachable: 'Auch die gewählten Orte sind von hier erreichbar.',
    placesUnreachable: 'Die gewählten Orte sind von hier nicht erreichbar.',
    placesMissing: 'Hak zuerst unter „Was brauche ich in der Nähe?" Orte an.',

    travelTimesBusy: 'Fahrzeiten werden berechnet…',
    travelTimesEmpty: 'Noch keine Fahrzeiten.',
    underOneMinute: 'unter 1 Min',
    minutes: (n: number) => `${n} Min`,
  },

  status: {
    // Mehrzahl ist hier nicht bloß ein angehängtes "s": Im Deutschen wechselt
    // das ganze Wort, im Englischen der Bezug ("1 more" gegen "2 more").
    more: (n: number) => ` +${n} ${n === 1 ? 'weiteres' : 'weitere'}`,
    seconds: (n: number) => `${n}s`,
    slow: 'Der Dienst antwortet gerade langsam — es läuft weiter.',
  },

  map: {
    markerLabel: 'Geprüfte Adresse',
    markerPopup: (label: string) => `Geprüfte Adresse: ${label}`,
    insideRegion: 'in der Region',
    outsideRegion: (km: string) => `${km} km außerhalb`,
    floorArea: (squareMeters: number) => `${squareMeters} m² Grundfläche`,
    select: 'Auswählen',
    openWebsite: 'Website öffnen',
    fitAll: 'Alles einpassen',
    loadFailed: 'Die Karte kann gerade nicht geladen werden.',
    loadFailedHint: 'Der Kartendienst antwortet nicht. Versuch es in einem Moment erneut.',
  },

  travelModes: {
    driving: 'Auto',
    cycling: 'Fahrrad',
    ebike: 'E-Bike',
    walking: 'zu Fuß',
  } satisfies Record<TravelMode, string>,

  travelModesShort: {
    driving: 'Auto',
    cycling: 'Rad',
    ebike: 'E-Bike',
    walking: 'Fuß',
  } satisfies Record<TravelMode, string>,

  /**
   * "Kita" steht für Krippe, Kindergarten und Hort zusammen: OSM kennt für
   * Kita und Kindergarten nur `amenity=kindergarten`, zwei Einträge lieferten
   * also zweimal dieselbe Liste. Ein Name wie "Kita & Kindergarten" wäre
   * ehrlicher, bricht aber in der Kartenkopfzeile auf zwei Zeilen, während jede
   * andere Bedingung einzeilig bleibt -- und die Trefferliste zeigt mit
   * "Ev. Kindergarten ..." ohnehin sofort, was darin steckt.
   */
  categories: {
    supermarket: 'Supermarkt',
    station: 'Bahnhof',
    kindergarten: 'Kita',
    school: 'Schule',
    doctor: 'Arztpraxis',
    gym: 'Fitnessstudio',
    pool: 'Schwimmbad',
  } satisfies Record<PoiCategory, string>,

  /** Deutsche Mehrzahl ist unregelmäßig -- ein angehängtes "e" tut es nicht. */
  categoriesPlural: {
    supermarket: 'Supermärkte',
    station: 'Bahnhöfe',
    kindergarten: 'Kitas',
    school: 'Schulen',
    doctor: 'Arztpraxen',
    gym: 'Fitnessstudios',
    pool: 'Schwimmbäder',
  } satisfies Record<PoiCategory, string>,

  /**
   * Fehlertexte nach Domänen-Code. Das Backend liefert Code *und* Meldung; die
   * Meldung ist immer deutsch, weil der Server die Sprache des Browsers nicht
   * kennt. Trifft ein Code hier zu, gewinnt die übersetzte Fassung.
   */
  errors: {
    unexpected: 'Es ist ein unerwarteter Fehler aufgetreten. Bitte versuche es erneut.',
    serverUnreachable: 'Die App erreicht ihren Server nicht.',
    configUnavailable: 'Die App konnte ihre Konfiguration nicht laden.',
    byCode: {
      INVALID_INPUT: null,
      ADDRESS_NOT_FOUND: null,
      PROVIDER_RATE_LIMITED:
        'Das Anfragelimit des Kartendienstes ist erreicht. Bitte versuche es später erneut.',
      PROVIDER_UNAVAILABLE:
        'Die Berechnung konnte momentan nicht durchgeführt werden. Bitte versuche es erneut.',
      CONFIGURATION_ERROR: null,
    } as Record<string, string | null>,
  },
};

/**
 * Der Vertrag für jede weitere Sprache. Fehlt ein Schlüssel oder hat eine
 * Funktion die falsche Signatur, scheitert `npm run typecheck`.
 */
export type Texts = typeof de;
