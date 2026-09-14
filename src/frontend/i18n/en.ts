import type { Texts } from './de.js';

/**
 * Englische Fassung. Der Typ `Texts` erzwingt Vollständigkeit -- ein
 * vergessener Schlüssel ist ein Typfehler, kein stiller deutscher Rest in
 * einer englischen Oberfläche.
 */
export const en: Texts = {
  app: {
    title: 'Living Zone',
    subtitle: 'See where you could live with everything still within your time.',
    tablistLabel: 'Sections',
    sheetHandle: 'Drag the control panel up or down',
    languageLabel: 'Language',
    locale: 'en-GB',
  },

  tabs: {
    targets: 'My destinations',
    addresses: 'Check addresses',
  },

  appearance: {
    label: 'Appearance',
    system: 'Match system',
    light: 'Light',
    dark: 'Dark',
  },

  analysis: {
    computing: 'Calculating the shared region…',
    none: 'There is no area from which every destination is within your time.',
    checkingPlaces: 'Checking how well the selected places can be reached…',
    targetBusy: (name) => `Calculating the reachable area for ${name}…`,
    categoryBusy: (plural) => `Searching for ${plural}…`,
  },

  target: {
    heading: 'New destination',
    nameField: 'Name',
    addressField: 'Address',
    travelModeField: 'Mode of travel',
    minutesField: (max) => `Max. travel time (minutes, up to ${max})`,
    cancel: 'Cancel',
    namePlaceholder: 'Parents A',
    addressPlaceholder: 'Münster',
    whichAddress: 'Which address do you mean?',
    precision: { street: 'whole street', place: 'place only' },
    submit: 'Apply',
    submitHint: 'Confirm with Enter',
    submitting: 'Calculating…',
    travelModeLabel: (name) => `Mode of travel for ${name}`,
    minutesLabel: (name) => `Travel time to ${name} in minutes`,
    minutesUnit: 'min',
    applyTitle: 'Apply the changed travel time',
    applyLabel: (name) => `Apply travel time for ${name}`,
    hideLabel: (name) => `Hide ${name} on the map`,
    showLabel: (name) => `Show ${name} again`,
    hideTitle: 'Hide on the map (still counts)',
    showTitle: 'Show again',
    removeLabel: (name) => `Remove ${name}`,
    computing: (travelMode) => `Calculating the reachable area (${travelMode})…`,
    add: '+ Add destination',
    retry: 'Try again',
    addressNotFound: (address) => `The address “${address}” could not be found.`,
  },

  poi: {
    heading: 'What do I need nearby?',
    needsRegion: 'Add destinations first — the search needs a shared region.',
    addCondition: 'Add a requirement',
    addConditionOption: '+ Add a requirement',
    removeLabel: (category) => `Remove ${category}`,
    radiusLabel: (category) => `Search radius for ${category}`,
    radiusUnit: 'min',
    travelModeLabel: (category) => `Mode of travel for ${category}`,
    search: 'Find places',
    blocking: 'This condition alone leaves nothing of the shared region.',
    foundCount: (found, entries) => `${found} found, ${entries} entries`,
    expandBranches: (label) => `Show branches of ${label}`,
    collapseBranches: (label) => `Hide branches of ${label}`,
    sortHint:
      'At the top: large floor area, then chains, then unknown. Nothing is hidden — OSM only knows the size of some places.',
    searching: 'Searching…',
    searchingSuffix: ' · searching…',
    notSearched: ' · not searched',
    selectedCount: (n) => ` · ${n} selected`,
    sortLabel: 'Sorting',
    sortByRelevance: 'Largest first',
    sortByDistance: 'Nearest first',
    insideRegion: 'inside the region',
    unnamed: 'Unnamed',
    memberLabel: (name, km) => `${name} (${km} km)`,
    outsideRegion: (km) => `${km} km outside`,
    area: (squareMeters, approximate) =>
      ` · ${approximate ? 'up to ' : ''}${squareMeters} m²`,
  },

  apply: {
    placeOne: 'place',
    placeMany: 'places',
    button: (n, unit) => `Check travel times (${n} ${unit})`,
    busy: (n, unit) => `Checking ${n} ${unit}…`,
    blockedBy: (categories) => ` This is what rules it out: ${categories}.`,
    blockedByCombination:
      ' Each requirement works on its own — only together are they too strict.',
    tooMany: (selected, max) =>
      `${selected} places selected — at most ${max} at a time. Untick a few.`,
    regionEmpty: 'No area satisfies all requirements at once.',
    nothingSelected: 'Nothing selected yet — the requirements are inactive.',
    upToDate: 'The region accounts for the selected places.',
    selected: (n, unit) => `${n} ${unit} ticked.`,
  },

  address: {
    heading: 'Check addresses',
    intro:
      'Collect addresses and see at a glance which ones meet the main criteria (light) and which also reach your chosen places (dark).',
    queryField: 'Place or address',
    emptyList:
      'No address checked yet. Every address you add stays in the list and is re-assessed whenever destinations or selection change.',
    travelTimesHint:
      'Measured on the fastest route, without traffic. Right at the limit the isochrone can differ slightly.',
    placeholder: 'e.g. Musterstraße 1, Oldenburg',
    add: 'Add address',
    adding: 'Searching…',
    chooseMatch: 'Please pick the right match:',
    empty: 'Please enter an address.',
    duplicate: (label) => `“${label}” is already in the list.`,
    notFound: (label) => `The address “${label}” could not be found.`,
    removeLabel: (label) => `Remove ${label}`,
    showOnMap: 'Show on the map',
    expandDetails: (label) => `Show details for ${label}`,
    collapseDetails: (label) => `Hide details for ${label}`,
    removeTitle: 'Remove address',
    noRoute: 'The map service knows no route to there.',
    noRouteShort: 'no route',
    limit: (minutes) => `max. ${minutes} min`,
    needsTargets: 'Add a destination first, then the travel time appears here.',
    overBy: (minutes) => `+${minutes} min`,

    targetsMet: 'All destinations reachable',
    targetsUnmet: 'Not all destinations reachable',
    targetsUnknown: 'No region calculated yet',
    placesMet: 'Selected places reachable',
    placesUnmet: 'Selected places not reachable',
    placesUnknown: 'No places applied yet',

    insideRegion: 'Inside the shared region.',
    outsideRegion: 'Outside the shared region.',
    regionMissing: 'Add destinations first — the region then appears on its own.',
    placesReachable: 'The selected places can be reached from here too.',
    placesUnreachable: 'The selected places cannot be reached from here.',
    placesMissing: 'First tick some places under “What do I need nearby?”.',

    travelTimesBusy: 'Calculating travel times…',
    travelTimesEmpty: 'No travel times yet.',
    underOneMinute: 'under 1 min',
    minutes: (n) => `${n} min`,
  },

  status: {
    more: (n) => ` +${n} more`,
    seconds: (n) => `${n}s`,
    slow: 'The service is responding slowly right now — it keeps going.',
  },

  map: {
    markerLabel: 'Checked address',
    markerDetails: 'Travel times and details are in the card on the left.',
    insideRegion: 'inside the region',
    outsideRegion: (km) => `${km} km outside`,
    floorArea: (squareMeters) => `${squareMeters} m² floor area`,
    select: 'Select',
    openWebsite: 'Open website',
    fitAll: 'Fit everything',
    loadFailed: 'The map cannot be loaded right now.',
    loadFailedHint: 'The map service is not responding. Try again in a moment.',
  },

  travelModes: {
    driving: 'Car',
    cycling: 'Bicycle',
    ebike: 'E-bike',
    walking: 'On foot',
  },

  travelModesShort: {
    driving: 'Car',
    cycling: 'Bike',
    ebike: 'E-bike',
    walking: 'Foot',
  },

  categories: {
    supermarket: 'Supermarket',
    station: 'Train station',
    kindergarten: 'Nursery',
    school: 'School',
    doctor: 'Doctor',
    gym: 'Gym',
    pool: 'Swimming pool',
  },

  categoriesPlural: {
    supermarket: 'Supermarkets',
    station: 'Train stations',
    kindergarten: 'Nurseries',
    school: 'Schools',
    doctor: 'Doctors',
    gym: 'Gyms',
    pool: 'Swimming pools',
  },

  errors: {
    unexpected: 'Something went wrong. Please try again.',
    serverUnreachable: 'The app cannot reach its server.',
    configUnavailable: 'The app could not load its configuration.',
    byCode: {
      INVALID_INPUT: null,
      ADDRESS_NOT_FOUND: null,
      PROVIDER_RATE_LIMITED:
        'The map service’s request limit has been reached. Please try again later.',
      PROVIDER_UNAVAILABLE: 'The calculation could not be run right now. Please try again.',
      CONFIGURATION_ERROR: null,
    },
  },
};
