> **Historisches Dokument — nicht der aktuelle Stand.**
>
> Dies ist der urspruengliche Auftrag von September 2026. Die App ist an
> mehreren Stellen bewusst davon abgewichen, jeweils auf Entscheidung des
> Nutzers:
>
> - **§2** beschreibt eine reine Auto-Isochrone und einen Start per Knopf.
>   Heute hat jedes Ziel sein eigenes Verkehrsmittel (Auto, Rad, E-Bike, zu
>   Fuss), und die Schnittmenge rechnet sich von allein.
> - **§2** verlangt, die Karte automatisch auf das Ergebnis zu zoomen. Das
>   wurde umgedreht: Der Ausschnitt gehoert dem Nutzer, eingepasst wird einmal
>   und danach nur auf Knopfdruck.
> - **§3** verbietet ausdruecklich POI-Suche und Persistenz. Beides gibt es
>   inzwischen -- die Ortssuche ist Schritt 3 der Bedienung, und Eingaben
>   ueberleben einen Reload.
> - **§11** kommt zweimal vor. Gemeint sind API (erstes) und Fehlerbehandlung
>   (zweites).
>
> Massgeblich fuer den heutigen Stand sind `README.md` (was die App tut) und
> `CLAUDE.md` (warum sie es so tut).

# Location Optimizer – MVP Technical Specification

## 1. Ziel

Baue eine kleine Webanwendung, mit der Nutzer einen oder mehrere Zielorte definieren können und anschließend die gemeinsame erreichbare Wohnregion auf einer Karte sehen.

Der erste MVP verwendet ausschließlich **Isochronen**.

Beispiel:

- Eltern A: maximal 30 Minuten Autofahrt
- Eltern B: maximal 30 Minuten Autofahrt
- Arbeitsplatz: maximal 25 Minuten Autofahrt

Für jeden Zielort wird eine Isochrone erzeugt. Anschließend wird die **Schnittmenge aller Isochronen** berechnet und auf einer interaktiven Karte dargestellt.

### Wichtig

Die Anwendung soll von Anfang an modular aufgebaut sein. Die aktuelle Implementierung ist nur eine erste `IsochroneIntersection`-Analyse. Später sollen alternative Analyseverfahren wie z. B. eine Heatmap ergänzt werden können, ohne Frontend, Domänenmodell oder Provider-Integrationen grundlegend umbauen zu müssen.

Nicht overengineeren: Der MVP braucht keine Benutzerkonten, keine Datenbank und kein komplexes Scoring.

---

# 2. MVP-Funktionalität

## Eingabe

Die Webseite enthält ein Formular für beliebig viele Ziele.

Jedes Ziel besitzt:

- Name / Bezeichnung
- Adresse oder Ort als Freitext
- maximale Fahrzeit in Minuten

Beispiel:

```text
Ziel 1
Name: Eltern A
Ort: Münster
Maximale Fahrzeit: 30 Minuten

Ziel 2
Name: Eltern B
Ort: Dortmund
Maximale Fahrzeit: 30 Minuten
```

Anforderungen:

- Mindestens ein Ziel muss vorhanden sein.
- Nutzer können weitere Ziele hinzufügen.
- Nutzer können Ziele entfernen.
- Die maximale Fahrzeit muss positiv sein.
- Eine Berechnung darf erst gestartet werden, wenn alle erforderlichen Felder valide sind.

## Ergebnis

Nach dem Start:

1. Adressen werden geocodiert.
2. Für jedes Ziel wird eine Auto-Isochrone erzeugt.
3. Alle Isochronen werden geometrisch geschnitten.
4. Die Schnittmenge wird auf der Karte dargestellt.
5. Optional können die einzelnen Isochronen zusätzlich transparent dargestellt werden, damit der Nutzer nachvollziehen kann, wie das Ergebnis entsteht.

Die Karte soll automatisch auf das Ergebnis zoomen.

---

# 3. Nicht Bestandteil des MVP

Folgende Funktionen ausdrücklich NICHT implementieren:

- Heatmap
- Ranking von Wohnorten
- Score / Gewichtungen
- Soft Constraints
- Immobilienangebote
- Supermärkte / Fitnessstudios / POI-Suche
- Benutzerkonten
- Persistenz
- Login
- Social Features
- komplexe Optimierungsalgorithmen
- eigene Routing Engine
- eigene Kartendatenbank

Die Architektur soll diese Erweiterungen später ermöglichen, aber der MVP soll klein bleiben.

---

# 4. Architekturprinzipien

## 4.1 Domain vor Infrastruktur

Die fachliche Logik darf nicht direkt von Google, OpenRouteService, Mapbox, HERE etc. abhängen.

Beispiel:

```typescript
interface GeocodingProvider {
  geocode(address: string): Promise<Coordinate>;
}

interface IsochroneProvider {
  calculate(
    origin: Coordinate,
    options: IsochroneOptions
  ): Promise<GeoJsonFeature>;
}
```

Die Domain/Application Layer darf nur diese Interfaces kennen.

Konkrete Provider befinden sich in der Infrastructure-Schicht.

---

# 5. Analyse-Strategie abstrahieren

Die Anwendung soll nicht direkt eine Klasse namens `IsochroneService` als zentrale Business-Logik besitzen.

Stattdessen:

```typescript
interface LocationAnalysisStrategy {
  analyze(
    request: LocationAnalysisRequest
  ): Promise<LocationAnalysisResult>;
}
```

Erste Implementierung:

```typescript
class IsochroneIntersectionStrategy
  implements LocationAnalysisStrategy
{
  // ...
}
```

Später soll beispielsweise möglich sein:

```typescript
class HeatmapStrategy
  implements LocationAnalysisStrategy
{
  // später
}
```

Die restliche Anwendung soll von der konkreten Strategie möglichst unabhängig sein.

Die Auswahl der Strategie soll über eine zentrale Konfiguration bzw. Dependency Injection erfolgen.

---

# 6. Provider-Abstraktionen

## 6.1 Geocoding

```typescript
interface GeocodingProvider {
  geocode(address: string): Promise<Coordinate>;
}
```

Erste konkrete Implementierung kann OpenRouteService oder ein anderer geeigneter Anbieter sein.

Wichtig:

- API-Key niemals im Frontend exponieren, sofern der verwendete Anbieter einen geheimen Key benötigt.
- API-Zugriffe über das Backend ausführen.
- Provider-spezifische Response-Modelle nicht in die Domain leaken lassen.

## 6.2 Isochronen

```typescript
interface IsochroneProvider {
  calculate(
    origin: Coordinate,
    options: IsochroneOptions
  ): Promise<GeoJsonFeature>;
}
```

Beispiel:

```typescript
type IsochroneOptions = {
  travelMode: "driving";
  maxTravelTimeMinutes: number;
};
```

Die erste Implementierung soll Auto/Isochronen unterstützen.

Später können andere Modi ergänzt werden:

```text
walking
cycling
transit
```

ohne das grundlegende Interface unnötig umzubauen.

---

# 7. Domänenmodell

Vorschlag:

```typescript
type Coordinate = {
  latitude: number;
  longitude: number;
};

type LocationConstraint = {
  id: string;
  name: string;
  address: string;
  travelMode: TravelMode;
  maxTravelTimeMinutes: number;
};

type LocationAnalysisRequest = {
  constraints: LocationConstraint[];
};

type LocationAnalysisResult = {
  layers: MapLayer[];
  intersection: GeoJsonFeature | null;
};

type MapLayer = {
  id: string;
  type: "isochrone" | "intersection";
  name: string;
  geometry: GeoJsonFeature;
};
```

Das konkrete Modell darf angepasst werden, solange die Trennung der Verantwortlichkeiten erhalten bleibt.

---

# 8. Geometrische Schnittmenge

Für den MVP keine eigene Geometrie-Engine implementieren.

Eine etablierte GeoJSON-/Geometrie-Library verwenden, beispielsweise Turf.js.

Ablauf:

```text
Address
   ↓
GeocodingProvider
   ↓
Coordinate
   ↓
IsochroneProvider
   ↓
GeoJSON Polygon
   ↓
Polygon ∩ Polygon ∩ Polygon ...
   ↓
Intersection GeoJSON
```

Bei nur einem Ziel ist die Schnittmenge einfach dessen Isochrone.

Wenn die Schnittmenge leer ist:

- keine Exception als normale Business-Situation werfen
- Ergebnis sauber als `null` / leere Geometrie darstellen
- UI soll dem Nutzer verständlich mitteilen, dass keine gemeinsame Region gefunden wurde

---

# 9. Karten-Frontend

Eine interaktive Webkarte verwenden, vorzugsweise **MapLibre GL JS**.

Die Kartendarstellung soll ausschließlich die vom Backend gelieferten GeoJSON-Daten darstellen.

Das Frontend soll nicht selbst die fachliche Schnittmenge berechnen.

Beispiel:

```text
Backend
  ↓
LocationAnalysisResult
  ↓
Frontend
  ↓
MapLibre
  ├── Isochrone A
  ├── Isochrone B
  ├── Isochrone C
  └── Intersection
```

Die Darstellung soll nachvollziehbar sein:

- einzelne Isochronen transparent
- Schnittmenge deutlich hervorgehoben
- Zielpunkte auf der Karte anzeigen
- Karte automatisch auf alle relevanten Geometrien fitten

---

# 10. Karten- und Live-Darstellung der Isochronen

Die Karte ist ein zentraler Bestandteil des MVP und soll nicht erst ausschließlich nach einer vollständigen Berechnung das Endergebnis zeigen.

## Verhalten nach Eingabe eines Ziels

Sobald ein Nutzer einen Ort eingegeben, die Adresse erfolgreich geocodiert und eine maximale Fahrzeit angegeben bzw. bestätigt hat, soll die Isochrone für dieses Ziel möglichst **automatisch** berechnet und auf der Karte angezeigt werden.

Wichtig: Nicht bei jedem einzelnen Tastendruck eine API-Anfrage auslösen. Die Adresse muss zunächst bestätigt/geocodiert werden (z. B. durch Auswahl eines Suchergebnisses oder Blur/Enter), anschließend wird die Isochrone berechnet.

Der Nutzer soll dadurch die Karte schrittweise aufbauen können:

```text
Ziel 1 bestätigt
    ↓
Isochrone 1 erscheint

Ziel 2 bestätigt
    ↓
Isochrone 2 erscheint
+ gemeinsame Schnittmenge wird aktualisiert

Ziel 3 bestätigt
    ↓
Isochrone 3 erscheint
+ gemeinsame Schnittmenge wird erneut aktualisiert
```

Ein separater "Alles berechnen"-Button ist damit nicht zwingend erforderlich. Ein optionaler Button zum erneuten Berechnen/Retry ist jedoch zulässig.

## Darstellung einzelner Isochronen

Jede Isochrone bekommt eine eigene, stabile Farbe. Die Farben werden anhand der Ziel-ID vergeben und ändern sich nicht, wenn weitere Ziele hinzugefügt oder entfernt werden.

Beispiel:

```text
🔵 Eltern A
🟡 Eltern B
🔴 Arbeitsplatz
🟣 Weiteres Ziel
```

Die Isochronen sollen:

- transparent gefüllt sein
- eine gut sichtbare Umrandung besitzen
- sich bei Überschneidungen visuell überlagern können
- einen zugehörigen Zielmarker auf der Karte besitzen

Im Formular soll das jeweilige Ziel ebenfalls mit seiner Kartenfarbe gekennzeichnet werden.

## Darstellung der Schnittmenge

Die Schnittmenge soll **nicht einfach nur durch die Überlagerung der transparenten Isochronen** dargestellt werden.

Sie erhält einen eigenen, deutlich hervorgehobenen Karten-Layer mit einer separaten Farbe.

Beispiel:

```text
Isochrone A: transparent blau
Isochrone B: transparent gelb
Isochrone C: transparent rot

Gemeinsame Schnittmenge aller aktiven Ziele:
deutlich hervorgehobenes Grün
```

Die Schnittmenge wird nach jeder erfolgreich berechneten/aktualisierten Isochrone neu berechnet.

Bei nur einem Ziel ist die Schnittmenge identisch mit dessen Isochrone.

Bei mehreren Zielen gilt:

```text
intersection = isochroneA
               ∩ isochroneB
               ∩ isochroneC
               ...
```

## Leere Schnittmenge

Wenn keine gemeinsame Fläche existiert, sollen die einzelnen Isochronen weiterhin sichtbar bleiben.

Die Karte soll dann keine künstliche Fläche anzeigen. Stattdessen wird verständlich kommuniziert:

```text
Keine gemeinsame Region gefunden.
```

Die einzelnen Isochronen bleiben sichtbar, damit der Nutzer nachvollziehen kann, warum keine Schnittmenge existiert.

## Dynamische Aktualisierung

Ändert der Nutzer die maximale Fahrzeit eines bereits vorhandenen Ziels, soll nur die betroffene Isochrone neu berechnet werden. Anschließend wird die Schnittmenge aktualisiert.

Entfernt der Nutzer ein Ziel, soll dessen Isochrone entfernt und die Schnittmenge aus den verbleibenden Zielen neu berechnet werden.

Das vermeidet unnötige API-Aufrufe.

---

# 11. API des Backends

Ein einfacher Endpoint reicht für den MVP.

Beispielsweise:

```http
POST /api/analyze
Content-Type: application/json
```

Request:

```json
{
  "constraints": [
    {
      "id": "parents-a",
      "name": "Eltern A",
      "address": "Münster",
      "travelMode": "driving",
      "maxTravelTimeMinutes": 30
    },
    {
      "id": "parents-b",
      "name": "Eltern B",
      "address": "Dortmund",
      "travelMode": "driving",
      "maxTravelTimeMinutes": 30
    }
  ]
}
```

Response soll ein providerunabhängiges Modell liefern.

Keinesfalls ungefilterte Provider-Responses an das Frontend weiterreichen.

---

# 11. Fehlerbehandlung

Folgende Situationen sauber behandeln:

### Ungültige Adresse

```text
Die Adresse konnte nicht gefunden werden.
```

### Provider nicht erreichbar

```text
Die Berechnung konnte momentan nicht durchgeführt werden.
Bitte versuche es erneut.
```

### API-Limit / Rate Limit

Nicht still verschlucken. Backend soll einen geeigneten Fehlerstatus liefern und Frontend soll eine verständliche Meldung anzeigen.

### Keine Schnittmenge

```text
Für diese Anforderungen wurde keine gemeinsame Region gefunden.
```

### Leere Eingabe

Formularvalidierung im Frontend und zusätzlich Validierung im Backend.

---

# 12. API-Keys / Unterstützung durch den Nutzer

Der Coding Agent soll den Nutzer **nicht auffordern, API-Keys in den Quellcode einzutragen oder in Chat-Nachrichten zu posten**.

Stattdessen:

1. Eine `.env.example` anlegen.
2. Dokumentieren, welche Variablen benötigt werden.
3. Im README erklären, wo der Nutzer die jeweiligen API-Keys erzeugt.
4. Echte `.env` in `.gitignore` aufnehmen.
5. Beim Start prüfen, ob erforderliche Konfiguration fehlt.
6. Eine klare Fehlermeldung ausgeben.

Beispiel:

```env
ISOCHRONE_PROVIDER=openrouteservice
GEOCODING_PROVIDER=openrouteservice
OPENROUTESERVICE_API_KEY=
```

### Unterstützung vom Nutzer benötigt

Der Agent soll den Nutzer an genau diesen Stellen stoppen bzw. ihn darum bitten:

**A. API-Key**

Der Nutzer muss einen API-Key für den gewählten Geocoding-/Isochronen-Provider bereitstellen.

Der Agent soll erklären:

- welchen Anbieter er verwendet
- welche API(s) aktiviert werden müssen
- wo der Key eingetragen wird
- ob für die Nutzung ein Account/Billing notwendig ist
- niemals nach dem Key im Chat fragen, wenn er stattdessen lokal in `.env` eingetragen werden kann

**B. Provider-Entscheidung**

Wenn der gewählte Provider während der Implementierung nicht geeignet ist oder einen erforderlichen Dienst nicht anbietet, soll der Agent nicht eigenmächtig einen völlig anderen Stack einführen.

Stattdessen kurz begründen und den Nutzer um Entscheidung bitten.

**C. Karten-Tiles**

Falls der gewählte Kartenanbieter einen separaten Token benötigt, denselben Prozess verwenden:

```env
MAP_STYLE_URL=
MAP_TOKEN=
```

Keine Secrets committen.

---

# 13. Provider-Auswahl

Für den ersten MVP ist ein Provider mit direkter Isochronen-Unterstützung zu bevorzugen.

OpenRouteService ist ein sinnvoller erster Kandidat, weil die Anwendung explizit Isochronen benötigt.

Die Architektur darf aber nicht auf OpenRouteService zugeschnitten werden.

Beispiel:

```text
Infrastructure
├── geocoding
│   ├── OpenRouteServiceGeocoder
│   └── ...
│
├── isochrone
│   ├── OpenRouteServiceIsochroneProvider
│   └── ...
│
└── maps
    └── MapLibre
```

Provider-spezifische Optionen müssen innerhalb der jeweiligen Adapter bleiben.

---

# 14. Projektstruktur

Eine mögliche Struktur:

```text
src/
├── domain/
│   ├── models/
│   ├── services/
│   └── ports/
│
├── application/
│   └── analysis/
│
├── infrastructure/
│   ├── geocoding/
│   ├── isochrone/
│   └── configuration/
│
├── api/
│   └── routes/
│
└── frontend/
    ├── components/
    ├── map/
    └── forms/
```

Die genaue Struktur darf dem gewählten Framework angepasst werden.

Wichtig ist die Abhängigkeit:

```text
Frontend
   ↓
Application
   ↓
Domain
   ↑
Infrastructure
```

Nicht:

```text
Domain → OpenRouteService
```

---

# 15. Konfiguration

Provider und Analyseverfahren nicht hart codieren.

Beispiel:

```env
ANALYSIS_STRATEGY=isochrone-intersection

GEOCODING_PROVIDER=openrouteservice
ISOCHRONE_PROVIDER=openrouteservice

OPENROUTESERVICE_API_KEY=
```

Später:

```env
ANALYSIS_STRATEGY=heatmap
```

soll grundsätzlich ermöglichen, eine andere Analyseimplementierung zu verwenden.

Die UI muss dafür möglichst nicht verändert werden.

---

# 16. Zukunftserweiterungen

Die Architektur soll später folgende Erweiterungen ermöglichen:

## Heatmap

Neue Strategie:

```typescript
HeatmapStrategy
```

Diese könnte intern:

- ein räumliches Raster erzeugen
- Routing-Matrizen berechnen
- Punkte bewerten
- eine Heatmap erzeugen

Die bestehende Isochronenimplementierung bleibt unangetastet.

## Gewichtete Kriterien

Später:

```typescript
weight: number;
```

## Ideale statt harte Fahrzeit

Später beispielsweise:

```text
ideal: 5 min
acceptable: 15 min
```

## Unterschiedliche Verkehrsmittel

```text
driving
cycling
walking
transit
```

## Mehrere POIs

Später beispielsweise:

```text
Fitnessstudio
Supermarkt
Bahnhof
Arzt
Kindergarten
```

Diese Features sollen später ergänzt werden können, ohne das MVP unnötig kompliziert zu machen.

---

# 17. UX

Die Benutzeroberfläche soll bewusst simpel sein.

Initial:

```text
Location Optimizer

[ Ziel hinzufügen ]

┌─────────────────────────────┐
│ Name                        │
│ [ Eltern A               ]  │
│                             │
│ Ort / Adresse               │
│ [ Münster                ]  │
│                             │
│ Max. Fahrzeit               │
│ [ 30 ] Minuten              │
│                             │
│                         X   │
└─────────────────────────────┘

[ + Ziel hinzufügen ]

[ Region berechnen ]

──────────────────────────────

                    KARTE
```

Während der Berechnung:

```text
Isochronen werden berechnet...
```

Bei Erfolg:

```text
Gemeinsame Region gefunden
```

Bei leerer Schnittmenge:

```text
Keine gemeinsame Region gefunden.
```

Keine unnötigen Einstellungen im MVP.

---

# 18. Testing

Mindestens folgende Tests implementieren.

## Domain

- ein Ziel → Ergebnis entspricht Isochrone
- zwei Ziele → korrekte Intersection
- mehrere Ziele → sukzessive Intersection
- leere Intersection wird korrekt behandelt
- ungültige Fahrzeit wird abgelehnt

## Provider

Provider-Adapter mit Mock-Responses testen.

Keine echten API-Aufrufe in Unit Tests.

## API

- gültiger Request
- fehlender Ort
- ungültige Fahrzeit
- Providerfehler
- leere Schnittmenge

## Frontend

Mindestens:

- Ziel hinzufügen
- Ziel entfernen
- Validierung
- erfolgreiche Ergebnisdarstellung
- Fehlerzustände

---

# 19. Entwicklungsvorgehen

Nicht alles auf einmal bauen.

## Phase 1

Projekt aufsetzen:

- TypeScript
- Frontend
- Backend
- Linting
- Formatting
- `.env.example`
- README

## Phase 2

Provider Interfaces und Domain Models.

## Phase 3

Einen echten Provider anbinden:

```text
Adresse
→ Geocoding
→ Koordinate
→ Isochrone
```

## Phase 4

Ein Ziel auf der Karte anzeigen.

## Phase 5

Mehrere Ziele.

## Phase 6

Polygon-Intersection.

## Phase 7

Saubere UX und Fehlerbehandlung.

## Phase 8

Tests und Dokumentation.

Nach jeder Phase soll die Anwendung weiterhin lauffähig sein.

---

# 20. Definition of Done

Der MVP ist fertig, wenn ein Nutzer:

1. die Webseite öffnen kann
2. mindestens einen Ort eingeben kann
3. für jeden Ort eine maximale Autofahrzeit definieren kann
4. beliebig viele weitere Orte hinzufügen kann
5. auf „Berechnen“ klicken kann
6. für jeden Ort eine Isochrone erhält
7. die gemeinsame Schnittmenge auf einer interaktiven Karte sieht
8. bei keiner Schnittmenge eine verständliche Meldung erhält
9. bei API-/Geocoding-Fehlern eine verständliche Meldung erhält

Zusätzlich:

- keine API-Keys im Repository
- Provider sind über Interfaces abstrahiert
- Analyseverfahren ist über eine Strategy abstrahiert
- Geometrie-/Provider-spezifische Implementierungen sind gekapselt
- Tests für die wesentliche Domain-Logik vorhanden
- README erklärt Setup und benötigte API-Konfiguration

---

# 21. Wichtig für den Coding Agent

Prioritäten:

1. **Funktionierender MVP**
2. **Saubere Modularität**
3. **Klare Provider-Abstraktionen**
4. **Einfache Erweiterbarkeit**
5. **Tests der fachlichen Logik**
6. Erst danach UI-Polishing

Keine unnötige Enterprise-Architektur.

Keine Datenbank ohne konkreten Bedarf.

Keine Microservices.

Keine unnötigen Abstraktionen für hypothetische zukünftige Anforderungen.

Abstraktionen nur dort, wo sie einen realen Wechselpunkt darstellen:

- Geocoding Provider
- Isochrone/Routing Provider
- Analyse-Strategie
- Karten-Rendering

Der wichtigste zukünftige Wechselpunkt ist:

```text
IsochroneIntersectionStrategy
              ↓
       LocationAnalysisStrategy
              ↑
        HeatmapStrategy
```

Die erste Version soll klein sein, aber diese Architekturgrenzen sauber etablieren.
