# Location Optimizer

Findet die gemeinsame erreichbare Wohnregion mehrerer Zielorte.

Für jedes Ziel (z. B. "Eltern A, Münster, max. 30 Minuten") wird eine
Auto-Isochrone berechnet. Die Schnittmenge aller Isochronen ist die Region, aus
der alle Ziele innerhalb der jeweiligen Fahrzeit erreichbar sind.

## Bedienung

Zwei Schritte:

1. **Ziel hinzufügen** — Name, Ort und maximale Fahrzeit eintragen, mit `Enter`
   bzw. "Übernehmen" bestätigen. Erst dann wird geocodiert und die Isochrone
   dieses Ziels auf der Karte angezeigt. Beim Tippen passiert nichts.
   Gibt es mehrere Treffer für den Ort, wählst du den richtigen aus.
2. **Analysieren** — sind alle Ziele gesetzt, berechnet ein Klick auf
   "Analysieren" die gemeinsame Schnittmenge und hebt sie grün hervor.

Jedes Ziel hat eine feste Farbe, die auch im Formular angezeigt wird. Änderst du
ein Ziel, wird nur dessen Isochrone neu berechnet; das Analyse-Ergebnis wird als
veraltet markiert, bis du erneut analysierst.

### Gespeicherter Stand

Deine Ziele bleiben nach einem Reload erhalten — samt Isochronen, Farben und
letztem Analyse-Ergebnis. Der Stand liegt ausschließlich in `localStorage`
deines Browsers: kein Backend, keine Datenbank, kein Konto. Beim Wiederherstellen
werden **keine** API-Aufrufe fällig, die Geometrien kommen aus dem Cache.

Entfernst du alle Ziele, wird der Stand gelöscht. Ist der Speicher blockiert
(z. B. privates Fenster), funktioniert die App normal weiter — nur eben ohne
Wiederherstellung.

## Setup

```bash
npm install
cp .env.example .env
```

Trage anschließend deinen OpenRouteService-API-Key in die `.env` ein (siehe
unten), dann:

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001

### API-Key besorgen

Die App nutzt **OpenRouteService** für Geocoding und Isochronen.

1. Kostenlosen Account anlegen: https://openrouteservice.org/dev/#/signup
2. Im Dashboard einen Token erzeugen ("Request a token", Plan: _Free_).
   Damit sind die benötigten Dienste **Isochrones** und **Geocoding** freigeschaltet.
3. Key in die `.env` eintragen:

   ```env
   OPENROUTESERVICE_API_KEY=dein-key
   ```

Kein Billing und keine Kreditkarte nötig. Der Free-Plan ist limitiert
(Größenordnung: 500 Isochronen-Anfragen pro Tag, 1.000 Geocoding-Anfragen pro
Tag, wenige Anfragen pro Minute) — für den MVP ausreichend. Wird das Limit
erreicht, zeigt die App eine entsprechende Meldung an.

Der Key wird **nur im Backend** verwendet und gelangt nie ins Frontend-Bundle.
Er wird ausschließlich über den `Authorization`-Header gesendet, nie als
URL-Parameter. Die `.env` ist in `.gitignore` und darf nicht committet werden.

#### API-Endpunkte (Stand 09/2026)

`api.openrouteservice.org` wurde zugunsten von `api.heigit.org` abgekündigt
(angekündigt am 28.04.2026, Abschaltung 24.08.2026). Die App nutzt bereits die
neuen Adressen:

| Dienst     | URL                                                              |
| ---------- | ---------------------------------------------------------------- |
| Isochronen | `https://api.heigit.org/openrouteservice/v2/isochrones/{profil}` |
| Geocoding  | `https://api.heigit.org/pelias/v1/search`                        |

Bestehende Keys funktionieren unverändert. Beide Basis-URLs lassen sich über
`OPENROUTESERVICE_ISOCHRONE_URL` bzw. `OPENROUTESERVICE_GEOCODING_URL`
überschreiben, etwa für eine eigene Instanz.

#### Grenzen des Providers

OpenRouteService begrenzt Isochronen auf **3600 Sekunden = 60 Minuten**
Fahrzeit. Die App kennt dieses Limit (`IsochroneProvider.maxTravelTimeMinutes`),
gibt es über `GET /api/config` an das Frontend weiter und lehnt größere Werte
mit einer verständlichen Meldung ab, statt in einen generischen Providerfehler
zu laufen.

### Karte

Standardmäßig wird ein tokenfreier Style verwendet
(`https://tiles.openfreemap.org/styles/liberty`). Ein anderer Style lässt sich
über `MAP_STYLE_URL` in der `.env` setzen; braucht dieser einen Token, kommt er
in `MAP_TOKEN`.

## Befehle

```bash
npm run dev        # Frontend + Backend parallel
npm test           # Vitest (65 Tests)
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm run build      # Produktions-Build des Frontends
```

## Architektur

```
frontend → api → application → domain ← infrastructure
```

```
src/
├── domain/              fachlicher Kern, kennt keine Provider
│   ├── models/          Coordinate, LocationConstraint, MapLayer, DomainError
│   ├── ports/           GeocodingProvider, IsochroneProvider, LocationAnalysisStrategy
│   └── services/        Schnittmenge (Turf), Validierung
├── application/
│   └── analysis/        IsochroneIntersectionStrategy, IsochroneQuery
├── infrastructure/
│   ├── geocoding/       OpenRouteServiceGeocoder
│   ├── isochrone/       OpenRouteServiceIsochroneProvider + Caching-Decorator
│   ├── openrouteservice/ HTTP-Client inkl. Fehler-Mapping
│   └── configuration/   Config-Laden, Dependency Injection
├── api/                 Express-Routen, zod-Validierung, Fehler-Handler
└── frontend/            React + MapLibre
```

Die Domain hängt **nicht** von OpenRouteService ab. Provider werden über
Interfaces (Ports) eingebunden und in
`src/infrastructure/configuration/container.ts` verdrahtet. Ein ESLint-Regel-Set
verbietet Imports aus `infrastructure/`, `api/` und `frontend/` innerhalb von
`src/domain/`.

Das Analyseverfahren ist hinter `LocationAnalysisStrategy` abstrahiert. Eine
spätere `HeatmapStrategy` wird im Container registriert und über
`ANALYSIS_STRATEGY` in der `.env` ausgewählt — Frontend und Domain bleiben
unverändert.

## API

| Endpoint              | Zweck                                                         |
| --------------------- | ------------------------------------------------------------- |
| `GET /api/config`     | öffentliche Frontend-Konfiguration (Map-Style), keine Secrets |
| `POST /api/geocode`   | Adress-Kandidaten zur Bestätigung (Schritt 1)                 |
| `POST /api/isochrone` | Isochrone genau eines Ziels (Schritt 1)                       |
| `POST /api/analyze`   | Isochronen + Schnittmenge aller Ziele (Schritt 2)             |

Die Schnittmenge wird ausschließlich serverseitig berechnet. Ein In-Memory-Cache
(Key: Koordinate + Verkehrsmittel + Minuten) verhindert, dass `analyze` bereits
geholte Isochronen erneut beim Provider anfragt.

Provider-Antworten werden nie ungefiltert durchgereicht.

### Fehlerfälle

| Situation                 | Status | Meldung                                                     |
| ------------------------- | ------ | ----------------------------------------------------------- |
| Ungültige Eingabe         | 400    | feldbezogener Hinweis                                       |
| Adresse nicht gefunden    | 404    | „Die Adresse … konnte nicht gefunden werden."               |
| Rate Limit erreicht       | 429    | „Das Anfragelimit des Kartendienstes ist erreicht."         |
| Provider nicht erreichbar | 502    | „Die Berechnung konnte momentan nicht durchgeführt werden." |
| Keine Schnittmenge        | 200    | `intersection: null`, Isochronen bleiben sichtbar           |

Eine leere Schnittmenge ist **kein Fehler**: Die einzelnen Isochronen bleiben auf
der Karte, damit nachvollziehbar ist, warum es keine gemeinsame Region gibt.

## Nicht im MVP

Heatmap, Ranking, Scoring, Gewichtungen, POI-Suche, Immobilien, Benutzerkonten,
Login, Datenbank, serverseitige Persistenz. Die Architektur ermöglicht diese
Erweiterungen, implementiert sie aber bewusst nicht. Der lokale Browser-Cache
ist davon ausgenommen: er ist reiner Bedienkomfort und berührt das Backend nicht.
