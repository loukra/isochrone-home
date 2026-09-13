# Location Optimizer

**Wo kann ich wohnen, damit alle wichtigen Orte in erträglicher Zeit erreichbar
sind?**

Zwei Menschen arbeiten in verschiedenen Städten, die Eltern wohnen in einer
dritten, und das Fitnessstudio soll auch nicht eine Stunde entfernt sein. Auf
einer Karte lässt sich diese Frage nicht beantworten — Luftlinie lügt, weil sie
über Flüsse hinweg und um Umwege herum rechnet.

Die App rechnet stattdessen mit **Fahrzeiten**: Pro Ziel wird eine Isochrone
berechnet — die Fläche, aus der dieses Ziel innerhalb der erlaubten Zeit
erreichbar ist. Die **Schnittmenge** aller Isochronen ist die Region, die alle
Bedingungen gleichzeitig erfüllt.

## Was die App kann

**Schritt 1 — Ziele setzen.** Name, Adresse, Verkehrsmittel (Auto, Fahrrad,
E-Bike, zu Fuß) und maximale Reisezeit. Jedes Ziel hat sein **eigenes**
Verkehrsmittel: Eine Person fährt mit dem Auto zur Arbeit, die nächste mit dem
Rad. Sobald du die Adresse bestätigst, erscheint die Isochrone dieses Ziels.

**Schritt 2 — gemeinsame Region.** Sobald alle Ziele stehen, wird die
Schnittmenge automatisch berechnet und hervorgehoben. Kein Knopf: Sie kostet
kein Anbieterkontingent, und niemand setzt Ziele, um die Region *nicht* zu
sehen.

**Schritt 3 — Orte in der Nähe.** Fitnessstudio, Supermarkt, Bahnhof,
Kindergarten, Schule, Schwimmbad, Arzt. Die App sucht sie im Umkreis der Region
und listet sie auf. Du hakst an, was zählt; erst dann werden Fahrzeiten um diese
Orte berechnet und die Region entsprechend verengt.

Die Suchtreffer sind zunächst nur **Luftlinie** — ein Ort kann außerhalb liegen
und trotzdem der richtige sein. Erst „Erreichbarkeit berechnen" macht daraus
eine echte Fahrzeitaussage.

**Tab „Orte prüfen".** Konkrete Adressen gegen die Region halten: Liegt diese
Wohnung drin? Aufgeklappt zeigt jede Kachel die gemessene Fahrzeit und Strecke
zu jedem Ziel — inklusive Hinweis, welches Ziel sein Limit reißt.

## Installation

Voraussetzung: **Node.js 22.13 oder neuer** (entwickelt und getestet mit 26).
Läuft auf Linux, macOS und Windows.

```bash
git clone https://github.com/<dein-name>/isochrone-home.git
cd isochrone-home
npm install
```

Dann die Konfiguration anlegen und einen API-Key eintragen (siehe unten):

```bash
cp .env.example .env
```

Auf Windows in der PowerShell stattdessen `Copy-Item .env.example .env`.

### Starten

Für den normalen Gebrauch — ein Prozess, der Oberfläche und API ausliefert:

```bash
npm run build
```

```bash
npm start
```

Danach http://localhost:3001 im Browser öffnen.

Zum Entwickeln stattdessen `npm run dev` (Vite auf Port 5173, Backend auf 3001,
mit Hot Reload).

### Als Mac-App (optional)

Der Ordner `desktop/` enthält eine schlanke macOS-Hülle: ein Fenster, das die
Oberfläche anzeigt, und den Server als Kindprozess dahinter. Fenster zu heißt
Server aus.

```bash
npm run app
```

Das erzeugt `LocationOptimizer.app` im Projektordner. Sie ist an **diesen**
Rechner gebunden — Projektpfad und Node-Pfad werden beim Bauen fest eingetragen
— und nicht weitergebbar. Wird das Projekt verschoben, einmal neu bauen.

Der Ordner ist **optional und nur für macOS**. Auf Windows und Linux ist der
Weg über `npm start` und den Browser der richtige; es fehlt dort nichts außer
dem eigenen Fenster.

## Den API-Key musst du selbst mitbringen

Die App liefert **keinen** Schlüssel mit. Du legst dir selbst einen an:

1. Account anlegen: https://openrouteservice.org/dev/#/signup
2. Im Dashboard einen Token erzeugen. Benötigt werden die Dienste
   **Isochrones**, **Matrix** und **Geocoding**.
3. In die `.env` eintragen:

   ```env
   OPENROUTESERVICE_API_KEY=dein-key
   ```

Welche Nutzungsgrenzen und Bedingungen für dich gelten, steht in deinem
Dashboard. Ist eine Grenze erreicht, sagt die App das im Klartext, statt in einen
generischen Fehler zu laufen.

Der Key wird **ausschließlich im Backend** benutzt, geht nie ins
Frontend-Bundle und wird nur über den `Authorization`-Header gesendet, nie als
URL-Parameter. Die `.env` steht in `.gitignore`.

## Welche Dienste benutzt werden

| Dienst | Wofür | Schlüssel nötig |
| --- | --- | --- |
| [OpenRouteService](https://openrouteservice.org) (Isochronen) | Erreichbarkeitsflächen je Ziel | ja |
| OpenRouteService (Matrix) | Fahrzeit und Strecke im Tab „Orte prüfen" | ja, derselbe |
| OpenRouteService / Pelias | Adresssuche | ja, derselbe |
| [Overpass](https://overpass-api.de) (OpenStreetMap) | Orte suchen (Studios, Märkte, Bahnhöfe …) | nein |
| Kartenstil ([OpenFreeMap](https://openfreemap.org)) | Hintergrundkarte | nein |

Nur OpenRouteService braucht also einen Schlüssel. Matrix und Isochronen sind
dort zwei getrennte Dienste — ein Ausfall des einen lässt den anderen stehen.
Overpass und der Kartenstil sind offene Dienste; bitte rücksichtsvoll benutzen.

Antworten dieser Dienste werden in `.cache/` auf der Platte zwischengespeichert
(Isochronen 7 Tage, Orte 24 Stunden, Adressen 30 Tage), damit ein Neustart nicht
erneut Kontingent kostet. Der Ordner enthält keine Nutzerdaten und darf jederzeit
gelöscht werden.

### Anderen Kartenstil verwenden

Der Standard braucht keinen Token. Ein anderer Stil geht über die `.env`:

```env
MAP_STYLE_URL=https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json
```

Braucht der Stil einen Token, kommt er in `MAP_TOKEN`. Nützlich, wenn der
Standardanbieter gerade langsam ist — das kommt bei offenen Kacheldiensten vor.

## Andere Anbieter einbinden

Die fachliche Logik kennt keinen Anbieter. Alles Externe hängt an fünf
Schnittstellen in `src/domain/ports/`:

| Port | Aufgabe | Umschaltbar über |
| --- | --- | --- |
| `GeocodingProvider` | Adresse → Koordinate | `GEOCODING_PROVIDER` |
| `IsochroneProvider` | Koordinate + Zeit → Fläche | `ISOCHRONE_PROVIDER` |
| `TravelTimeProvider` | Punkt → Punkte: Dauer, Strecke | folgt `ISOCHRONE_PROVIDER` |
| `PoiProvider` | Kategorie + Bereich → Orte | derzeit fest Overpass |
| `LocationAnalysisStrategy` | das Analyseverfahren selbst | `ANALYSIS_STRATEGY` |

Verdrahtet wird ausschließlich in
`src/infrastructure/configuration/container.ts`. Ein neuer Anbieter ist damit
eine neue Klasse in `src/infrastructure/` plus ein `case` im Container — Domain,
API und Frontend bleiben unangetastet.

**Womit man rechnen muss:** Dass ein anderer Anbieter dieselbe *Frage*
beantwortet, heißt nicht, dass er dieselbe *Antwort* liefert. Anzupassen ist
üblicherweise:

- **Das Format.** Manche liefern GeoJSON, andere WKT oder ein eigenes Schema.
  Die Umrechnung gehört in den Adapter, nicht in die Domain — Provider-Typen
  bleiben grundsätzlich **innerhalb** ihres Adapters.
- **Die Grenzen.** OpenRouteService deckelt Isochronen bei 60 Minuten. Andere
  Anbieter deckeln woanders oder gar nicht. Deshalb trägt der Port die
  Eigenschaft `maxTravelTimeMinutes` und reicht sie bis in die Oberfläche
  durch — sonst läuft man in eine nichtssagende Fehlermeldung.
- **Die Verkehrsmittel.** Die App bietet vier an (Auto, Fahrrad, E-Bike, zu
  Fuß). Wer die nicht alle kennt, muss sie im Adapter abbilden oder ablehnen.
- **Die Fehler.** Rate Limit, unbekannte Adresse, Ausfall — jeder Anbieter
  benennt sie anders. Der Adapter übersetzt sie in die Domain-Fehlertypen,
  damit die Oberfläche verständlich bleibt.

## Befehle

```bash
npm run dev        # Frontend + Backend parallel, Hot Reload (Entwicklung)
npm start          # ein Prozess, liefert das Build mit aus
npm run build      # Produktions-Build der Oberfläche
npm run app        # macOS-App bauen (nur macOS)
npm test           # Vitest
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
```

## Architektur

```
frontend → api → application → domain ← infrastructure
```

```
src/
├── domain/              fachlicher Kern, kennt keinen Anbieter
│   ├── models/          Coordinate, LocationConstraint, Poi, DomainError
│   ├── ports/           die fünf Schnittstellen aus der Tabelle oben
│   └── services/        Schnittmenge und Vereinigung (Turf), Validierung
├── application/         orchestriert über Ports, kennt keine Anbieter
├── infrastructure/      Adapter: ORS, Overpass, Plattencache, Konfiguration
├── api/                 Express-Routen, zod-Validierung, Fehler-Mapping
└── frontend/            React + MapLibre
desktop/                 optionale macOS-Hülle (Swift)
```

Die Domain hängt von keinem Anbieter ab; eine ESLint-Regel verbietet Imports aus
`infrastructure/`, `api/` und `frontend/` innerhalb von `src/domain/`.

Die Schnittmenge wird **ausschließlich serverseitig** berechnet — das Frontend
zeichnet nur, was das Backend liefert.

## API

| Endpoint | Zweck |
| --- | --- |
| `GET /api/config` | öffentliche Frontend-Konfiguration, keine Geheimnisse |
| `POST /api/geocode` | Adress-Kandidaten zur Bestätigung |
| `POST /api/isochrone` | Isochrone genau eines Ziels |
| `POST /api/analyze` | Isochronen + Schnittmenge aller Ziele |
| `POST /api/pois` | Orte einer Kategorie im Umkreis der Region |
| `POST /api/pois/region` | Region auf die angehakten Orte verengen |
| `POST /api/locations/check` | liegen diese Punkte in der Region? |
| `POST /api/locations/travel-times` | gemessene Fahrzeit und Strecke je Ziel |

### Fehlerfälle

| Situation | Status | Meldung |
| --- | --- | --- |
| Ungültige Eingabe | 400 | feldbezogener Hinweis |
| Adresse nicht gefunden | 404 | „Die Adresse … konnte nicht gefunden werden." |
| Rate Limit erreicht | 429 | „Das Anfragelimit des Kartendienstes ist erreicht." |
| Anbieter nicht erreichbar | 502 | „Die Berechnung konnte momentan nicht durchgeführt werden." |
| Keine Schnittmenge | 200 | `intersection: null`, Isochronen bleiben sichtbar |

Eine leere Schnittmenge ist **kein Fehler**: Die einzelnen Isochronen bleiben
auf der Karte, damit nachvollziehbar ist, warum es keine gemeinsame Region gibt.

## Gespeicherter Stand

Ziele, Zeiten, Verkehrsmittel, Bedingungen, Häkchen, geprüfte Orte und der
Kartenausschnitt überleben einen Reload. Sie liegen im `localStorage` des
Browsers — kein Konto, keine Datenbank, kein Server.

Gespeichert wird nur die **Eingabe**, nie etwas Gerechnetes: Isochronen und
Regionen werden beim Start neu geholt. Eine Geometrie im Browser hat kein
Ablaufdatum, ein Stand von vor drei Monaten zeigte sonst still ein Straßennetz
von vor drei Monaten. Dank Plattencache kostet das Wiederherstellen in der Regel
keinen einzigen Anbieter-Aufruf.

## Nicht enthalten

Heatmap, Ranking, Scoring, Gewichtungen, Immobilienangebote, Benutzerkonten,
Login, Datenbank, eigene Routing-Engine. Die Architektur ermöglicht solche
Erweiterungen, implementiert sie aber bewusst nicht.
