# Location Optimizer — Agent Guide

Verbindliche Arbeitsanweisung für jede Änderung in diesem Repo.
Fachliche Quelle der Wahrheit: `location-optimizer-mvp.md`. Diese Datei enthält
die daraus abgeleiteten, bereits getroffenen Entscheidungen.

## Was die App macht

Nutzer definieren mehrere Zielorte mit je einer maximalen Autofahrzeit.
Pro Ziel wird eine Isochrone berechnet; die Schnittmenge aller Isochronen ist
die gemeinsame erreichbare Wohnregion und wird auf einer MapLibre-Karte gezeigt.

## Stack

- TypeScript überall, ESM (`"type": "module"`)
- Frontend: React + Vite + MapLibre GL JS
- Backend: Express (eigener Prozess, Port 3001), Vite proxied `/api` dorthin
- Geometrie: Turf.js (`@turf/intersect`, `@turf/bbox`)
- Tests: Vitest
- Provider: OpenRouteService (Geocoding + Isochronen), über Interfaces gekapselt

## Architekturgrenzen (nicht verletzen)

```
frontend → api → application → domain ← infrastructure
```

- `src/domain/` kennt **keine** Provider, kein Express, kein HTTP, kein Turf-Detail
  nach außen. Nur Modelle, Ports (Interfaces) und fachliche Regeln.
- `src/application/` orchestriert über Ports, kennt keine konkreten Provider.
- `src/infrastructure/` implementiert Ports (ORS-Adapter, Config, Caching).
  Provider-Response-Typen bleiben **innerhalb** des jeweiligen Adapters.
- `src/api/` ist nur Transport: Validierung (zod) + Mapping auf Application.
- `src/frontend/` rendert ausschließlich vom Backend geliefertes GeoJSON.
  **Das Frontend berechnet niemals selbst eine Schnittmenge.**

Die zentralen Wechselpunkte sind `GeocodingProvider`, `IsochroneProvider` und
`LocationAnalysisStrategy`. Neue Abstraktionen nur bei echtem Wechselpunkt.

## Bedienablauf (verbindlich, vom Nutzer bestaetigt)

Zwei klar getrennte Schritte:

**Schritt 1 — Ziele setzen (live).**
Nutzer gibt Name, Ort und maximale Fahrzeit ein und bestaetigt die Adresse
(Auswahl eines Geocoding-Treffers / Enter / Blur). Direkt danach wird **nur die
Isochrone dieses einen Ziels** berechnet und auf der Karte angezeigt. Es wird
noch **keine** Schnittmenge berechnet. Das wiederholt sich pro Ziel, die Karte
baut sich schrittweise auf.

**Schritt 2 — Analysieren (auf Klick).**
Sind alle Ziele gesetzt, klickt der Nutzer auf "Analysieren". Erst dann wird die
Schnittmenge aller aktiven Isochronen berechnet und als eigener, hervorgehobener
Layer dargestellt.

Daraus folgt:

- Die Schnittmenge wird **nicht** automatisch nach jedem Ziel aktualisiert.
- Aendert der Nutzer ein Ziel, wird dessen Isochrone sofort neu berechnet; ein
  bereits vorhandenes Analyse-Ergebnis gilt dann als veraltet und wird
  verworfen bzw. als veraltet markiert, bis erneut analysiert wird.
- Die Schnittmenge wird trotzdem **ausschliesslich serverseitig** berechnet
  (Spec 9). Das Frontend schickt dafuer die Constraints an `/api/analyze`.
- Ein serverseitiger Isochronen-Cache (Key: `lat,lon,mode,minutes`) sorgt dafuer,
  dass `/api/analyze` die in Schritt 1 bereits geholten Isochronen nicht erneut
  beim Provider anfragt (Spec 10: keine unnoetigen API-Aufrufe).
- Constraints duerfen eine bereits aufgeloeste `coordinate` mitliefern, dann
  entfaellt ein zweiter Geocoding-Call.

Damit ist der Widerspruch der Spec aufgeloest: §10 (Live-Darstellung) gilt fuer
die **einzelnen Isochronen**, §2/§17/§20 (Button) gilt fuer die **Schnittmenge**.

Hinweis: Die Spec hat zweimal `# 11`. Gemeint sind API (§11) und
Fehlerbehandlung (§12).

## Provider-Fakten (verifiziert 13.09.2026)

- Basis-URLs sind `https://api.heigit.org/openrouteservice` (Isochronen) und
  `https://api.heigit.org/pelias/v1` (Geocoding). `api.openrouteservice.org`
  ist abgekündigt (Abschaltung war 24.08.2026) — nicht mehr verwenden.
- Der API-Key geht **nur** über den `Authorization`-Header, nie als
  `api_key`-Query-Parameter (sonst landet er in URLs und Logs).
- ORS begrenzt Isochronen auf 3600 s = **60 Minuten**. Das Limit gehoert in den
  Adapter (`IsochroneProvider.maxTravelTimeMinutes`), nicht in die Domain, und
  wird über `/api/config` bis in die UI durchgereicht.

## Harte Regeln

- **Keine API-Keys im Repo, in Logs oder im Frontend-Bundle.** Keys nur in `.env`
  (gitignored), dokumentiert in `.env.example`. Den Nutzer nie bitten, einen Key
  in den Chat zu posten.
- Provider und Analyse-Strategie kommen aus der Konfiguration, nicht hart codiert.
- Leere Schnittmenge ist **kein Fehler**: `intersection: null`, Isochronen bleiben
  sichtbar, UI erklärt es verständlich.
- Provider-Fehler (Rate Limit, Adresse nicht gefunden, Netzwerk) werden auf
  Domain-Fehlertypen gemappt und nie still verschluckt.
- Nutzertexte und Kommentare sind **deutsch**, mit echten Umlauten (nicht `ue`/`ae`/`oe`).
  Code, Bezeichner und Typen sind englisch.
- Keine Tastendruck-API-Calls. Geocoding erst bei Bestätigung (Enter/Blur/Auswahl).
- Keine echten API-Calls in Unit-Tests — Provider-Adapter gegen Mock-Responses.

## Nicht im MVP

Heatmap, Ranking, Scoring, Gewichtungen, POI-Suche, Immobilien, Accounts, Login,
Datenbank, Persistenz, eigene Routing-Engine. Architektur soll es ermöglichen —
implementiert wird es nicht.

## Befehle

```bash
npm run dev        # Frontend + Backend parallel
npm test           # Vitest
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
```

## Arbeitsweise

- Nach jeder Phase muss die App lauffähig bleiben (siehe Spec §19).
- Domain-Logik bekommt Tests, bevor UI poliert wird (Spec §21 Prioritäten).
- Bei ungeeignetem Provider: nicht eigenmächtig den Stack wechseln, sondern
  kurz begründen und den Nutzer entscheiden lassen.
