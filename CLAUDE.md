# Wohnzone — Agent Guide

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

Drei klar getrennte Schritte:

**Schritt 1 — Ziele setzen (live).**
Nutzer gibt Name, Ort, Verkehrsmittel und maximale Reisezeit ein und bestaetigt die Adresse
(Auswahl eines Geocoding-Treffers / Enter / Blur). Direkt danach wird **nur die
Isochrone dieses einen Ziels** berechnet und auf der Karte angezeigt. Es wird
noch **keine** Schnittmenge berechnet. Das wiederholt sich pro Ziel, die Karte
baut sich schrittweise auf.

**Schritt 2 — Schnittmenge (automatisch).**
Die Schnittmenge aller aktiven Isochronen wird berechnet, sobald kein Ziel mehr
laedt, und als eigener, hervorgehobener Layer dargestellt. Kein Knopf: Sie
kostet kein Providerkontingent, und niemand setzt Ziele, um die Region *nicht*
zu sehen. Eine Signatur aus Zielen, Zeiten und Verkehrsmitteln verhindert, dass
bei jedem Rendern erneut gerechnet wird; schlaegt der Aufruf fehl, wird sie
freigegeben, damit es nicht dauerhaft haengen bleibt.

**Der Erfolgsfall sagt nichts** (*geaendert am 14.09.2026 auf Wunsch des
Nutzers*). Wo frueher immer eine Zeile stand, steht jetzt meistens gar nichts:

| Fall | vorher | jetzt |
| --- | --- | --- |
| Kein Ziel | "Fuege dein erstes Ziel hinzu." | nichts -- das Formular steht schon offen da |
| Rechnet | "Gemeinsame Region wird berechnet…" | nichts -- **wortgleich** in der Statusleiste |
| Veraltet | "Die Ziele haben sich geaendert…" | nichts -- die Statusleiste zeigt das Neurechnen |
| Gefunden | "Gemeinsame Region gefunden." | nichts -- sie liegt gruen auf der Karte |
| Leer | "Es gibt keinen Bereich…" | Hinweiskasten |
| Fehler | Meldung | Hinweiskasten |

Der Leitsatz dahinter: **Eine Meldung, die bestaetigt, was man ohnehin sieht,
ist keine Auskunft, sondern Rauschen** -- und sie stumpft die beiden Faelle ab,
in denen wirklich etwas zu sagen ist. Uebrig bleiben genau die: Dann ist die
Karte leer, und ohne Text wuesste niemand, warum. Der Hinweis steht deshalb
auch nicht mehr als Satz im Fliesstext, sondern als getoenter Kasten
(`.notice`) unter den Zielen -- er erklaert den ganzen Rest der Seitenleiste.

Davor war es ein eigener, oben und unten von Trennlinien eingerahmter
Abschnitt zwischen den Zielen und "Was brauche ich in der Naehe?" -- ein
einzelner Satz, der mitten in der Seitenleiste schwebte und zu keinem der
beiden Nachbarn gehoerte.

Freigegeben wird sie **auch, sobald eine Zieländerung das Ergebnis entwertet**
(`markAnalysisStale`). "Veraltet" heisst "muss neu gerechnet werden", und die
Signatur zaehlt nur die *fertigen* Ziele: Ein Ziel zu loeschen, dessen
Isochrone gescheitert war, laesst sie unveraendert -- der Effekt hielte sich
fuer erledigt, und die helle Flaeche bliebe weg, bis man irgendetwas anderes
anfasst. Dass sie beim Aendern kurz verschwindet, ist dagegen Absicht: Sie
gehoert zum alten Stand, und eine falsche Flaeche stehen zu lassen waere still
irrefuehrend.

*Geaendert am 13.09.2026 auf Entscheidung des Nutzers.* Vorher gab es einen
eigenen "Analysieren"-Knopf (Spec §2/§17/§20). Die Begruendung dafuer war, die
Region duerfe nicht beim Tippen flackern -- die traegt nicht mehr: Jede
Zielaenderung ist bereits eine Bestaetigung (Enter, Knopf, Menueauswahl), nie
ein Tastendruck, und die Berechnung kostet 55 ms reine Geometrie auf
zwischengespeicherten Isochronen, kein Providerkontingent. Spec §2/§17/§20
gelten insoweit als ueberholt.

**Schritt 3 — Orte in der Naehe (mehrere Bedingungen, zwei Klicks).**
"Orte suchen" holt ueber Overpass alle Orte der Kategorie im Umkreis der
gemeinsamen Region (kostenlos, kein ORS-Kontingent) und zeigt sie als kleine
Punkte plus Liste. **Zeit und Verkehrsmittel sind hier nur ein Suchradius**
(`Minuten x km-je-Minute`, Luftlinie) — noch keine Erreichbarkeit. Der Nutzer hakt
selbst an, was zaehlt; erst "Erreichbarkeit berechnen" (`/api/pois/region`) berechnet
Isochronen um die angehakten Orte, vereinigt sie und schneidet sie mit der
gemeinsamen Region. Erst dieses Ergebnis ist eine echte Fahrzeitaussage.
Konsequenz: Ein Punkt kann weit ausserhalb liegen (die Liste sagt
"x km ausserhalb") und trotzdem angezeigt werden — Absicht, weil Luftlinie
ueber Fluesse hinweg und um Umwege herum luegt.

Mehrere Bedingungen (Fitnessstudio *und* Supermarkt *und* Bahnhof) stehen als
aufklappbare Karten untereinander, jede mit eigener Fahrzeit und eigener Liste.
**Offen ist immer nur eine** (*geaendert am 14.09.2026 auf Wunsch des
Nutzers*): Eine zu oeffnen schliesst die anderen, ein zweiter Klick auf die
offene schliesst auch sie. Vorher konnten alle gleichzeitig offen stehen, und
bei drei Bedingungen mit je fuenfundzwanzig Treffern wuchs die Seitenleiste auf
ein paar tausend Pixel -- wer die Bahnhoefe angehakt hatte und zum
Fitnessstudio wollte, scrollte an einer Liste vorbei, mit der er fertig war.
Eine neu angelegte Bedingung klappt auf, die uebrigen zu: Sie ist die, um die
es gerade geht. Ein gespeicherter Stand aus der Zeit davor kann mehrere offene
mitbringen -- beim Laden ueberlebt die erste.
Es gibt **einen** gemeinsamen Knopf dafuer; er schickt alle Bedingungen
in einem Request. Bedingungen ohne Auswahl sind inaktiv und kosten nichts.
Die Antwort liefert je Bedingung `satisfiable` — ob sie *allein* etwas von der
gemeinsamen Region uebrig laesst. Damit kann die UI bei leerem Ergebnis sagen,
welche Bedingung schuld ist, statt nur "nichts gefunden".

Daraus folgt:

- Die Schnittmenge wird **nicht** automatisch nach jedem Ziel aktualisiert.
- Aendert der Nutzer ein Ziel, wird dessen Isochrone sofort neu berechnet; ein
  bereits vorhandenes Analyse-Ergebnis gilt dann als veraltet und wird
  verworfen bzw. als veraltet markiert, bis erneut analysiert wird.
- Die Schnittmenge wird trotzdem **ausschliesslich serverseitig** berechnet
  (Spec 9). Das Frontend schickt dafuer die Constraints an `/api/analyze`.
- Ein serverseitiger Isochronen-Cache (Key: `lat,lon,mode,minutes,direction`)
  sorgt dafuer, dass `/api/analyze` die in Schritt 1 bereits geholten Isochronen
  nicht erneut beim Provider anfragt (Spec 10: keine unnoetigen API-Aufrufe).
- **Ein Ziel wird in beide Fahrtrichtungen gerechnet und geschnitten**
  (*ergaenzt am 14.09.2026 auf Entscheidung des Nutzers*; vorher nur eine
  Richtung, und zwar unbeabsichtigt der Rueckweg -- ORS nimmt ohne Angabe
  `location_type: start`). "25 Minuten zur Arbeit" heisst hoechstens 25
  Minuten, **egal in welche Richtung**: Wer hin 25 und zurueck 30 braucht,
  liegt bei der Einstellung 25 draussen und erst ab 30 drin.
  - Die beiden Richtungen sind nicht dieselbe Flaeche. Einbahnstrassen,
    Abbiegeverbote und Autobahnauffahrten trennen sie. Gemessen (Oldenburg,
    25 Min. Auto, `smoothing: 0`): Hinweg 916 km², Rueckweg 933 km², beide
    zusammen 846 km². Das ist kein verschobenes Gebiet, sondern ein schmaler
    Saum am Rand, in dem sich die Richtungen um zwei bis drei Minuten
    unterscheiden.
  - Geschnitten, nicht vereinigt: Die Vereinigung hiesse "in *irgendeiner*
    Richtung im Limit", und das will niemand -- man faehrt hin *und* zurueck.
  - `reachableArea` (`application/analysis/reachable-area.ts`) ist die einzige
    Stelle, die das tut. Schneiden sich die Richtungen wider Erwarten nicht,
    gilt der Hinweg -- das ist die Frage, die im Formular steht, und eine
    leere Karte waere die schlechtere Antwort.
  - Kostet zwei Providercalls je Ziel statt einem. Bei einer Handvoll Zielen
    von 500 Tagesanfragen belanglos, und beide Richtungen liegen getrennt im
    Cache.
- **Schritt 3 bleibt einseitig, Richtung Hinweg** (`direction: 'toTarget'`).
  Nicht aus Nachlaessigkeit: Dort duerfen es 25 angehakte Orte sein, beidseitig
  waeren das 50 Aufrufe von 500 am Tag -- fuer einen Unterschied, der am Rand
  ein paar hundert Meter ausmacht. Die Richtung ist trotzdem ausdruecklich
  gesetzt, weil "von wo aus erreiche ich dieses Studio" die Frage der Bedingung
  ist; die Providervorgabe waere der Rueckweg gewesen.
- Darum ist `IsochroneOptions.direction` ein **Pflichtfeld ohne Vorgabewert**.
  Eine Aufrufstelle, die es vergaesse, bekaeme still die Providervorgabe, und
  das saehe niemand der Flaeche an -- dieselbe Gefahr wie beim Vorfiltern von
  POIs.
- Offen und bewusst so: **Die Oberfläche sagt das nicht.** Im Formular steht
  weiter "Max. Reisezeit"; dass die Zahl bei den Zielen beidseitig gilt und bei
  den Bedingungen nicht, steht nur hier. Ein Wort dazu gehoerte in die
  Oberflaeche, sobald der Text- und i18n-Stand steht.
- Constraints duerfen eine bereits aufgeloeste `coordinate` mitliefern, dann
  entfaellt ein zweiter Geocoding-Call.
- **Die POI-Punkte liegen immer ganz oben.** MapLibre haengt jeden neuen Layer
  ueber alles Bestehende; eine spaeter erzeugte Flaeche (Schnittmenge, neues
  Ziel) deckt die Punkte sonst zu. `raisePoiLayers` stellt die Regel nach jeder
  Layer-Aenderung wieder her, statt jede Flaeche einzeln einzusortieren.
- **Die Deckkraft der Flaechen steht beieinander in `colors.ts`, nicht verstreut
  in `MapView`** (*geaendert am 14.09.2026 auf Wunsch des Nutzers*: "teilweise
  erkennt man das drunterliegende nicht so gut"). Der Grund ist nicht Ordnung,
  sondern dass die drei Werte sich **multiplizieren** -- einzeln sah jeder
  vernuenftig aus. Bei drei Zielen mit Schnittmenge und verengter Region kamen
  vorher 0,82³ x 0,50 x 0,55 nur **12 %** des Kartenbildes durch: Ortsnamen und
  Strassennummern waren unter dem Gruen nicht mehr zu lesen, und genau daran
  entscheidet sich, ob eine Gegend taugt. Jetzt 0,18 / 0,25 / 0,30, also 29 %.
  Traeger der Form ist ohnehin der 3px-Umriss, nicht die Fuellung -- die sagt
  nur "hier drin" und darf deshalb leise sein.
- **Sichtbarkeit je Ziel (Auge) ist reine Darstellung.** Ein ausgeblendetes
  Ziel zaehlt voll in Schnittmenge und Ortssuche weiter; nur seine beiden
  MapLibre-Layer gehen auf `visibility: none`. Quelle und Marker bleiben
  liegen, damit das Wiedereinblenden ohne Nachladen auskommt. Waere es anders,
  wuerde der Schalter unbemerkt das Ergebnis verschieben -- dieselbe Gefahr wie
  beim Vorfiltern von POIs.
  - Hinter der Adresse stand dafuer einmal "· ausgeblendet"
    (*entfernt am 14.09.2026 auf Wunsch des Nutzers*). Das durchgestrichene
    Auge daneben sagt dasselbe, und der Zusatz brach die Zeile um: Ob die
    Zielkarte zwei oder drei Zeilen hoch war, haing damit an der Laenge der
    Adresse.
- **Der Kartenausschnitt gehoert dem Nutzer.** Eingepasst wird genau einmal
  automatisch -- beim allerersten Ziel, sonst bliebe die Deutschlanduebersicht
  stehen und die erste Isochrone waere ein Fleck. Danach nie wieder von allein:
  Wer eine Reisezeit um eine Minute korrigiert, verlor vorher seinen
  hineingezoomten Ausschnitt, und das bei *jeder* Aenderung. Stattdessen sitzt
  unter den Zoomknoepfen rechts oben ein dritter Knopf "Alles einpassen"
  (`ZoomControls`) -- dieselbe Trennlinie wie im Dock, nur hier nicht nach
  Preis, sondern nach Besitz: Zoom ist eine Entscheidung, keine Folge.
  - Eingepasst werden die Zielboxen **plus die geprueften Orte**; die duerfen
    ausserhalb liegen, und gerade dann will man sie sehen. Die Treffer aus
    Schritt 3 bleiben draussen: Ihr Suchradius reicht absichtlich ueber die
    Region hinaus und blaehte den Ausschnitt auf.
  - Er sitzt in **derselben** Gruppe wie "+" und "-", nicht in einem eigenen
    Kasten darunter: Er tut dasselbe wie sie -- den Ausschnitt setzen -- und ein
    abgesetzter Kasten sieht nach fremdem Werkzeug aus. Dafuer kapselt
    `ZoomControls` die `NavigationControl` und haengt den Knopf an deren
    Container.
  - Der Knopf liest die Box ueber eine Funktion (Ref), nicht als Wert -- er lebt
    ausserhalb von React und passt sonst den Stand seiner Erzeugung ein.
  - **Der Ausschnitt selbst wird gespeichert** (`saveViewport` bei jedem
    `moveend`, eigener Schluessel `location-optimizer:viewport:v1`). Sonst faellt
    jeder Reload auf die Deutschlanduebersicht zurueck -- im Dev-Betrieb also bei
    jedem Dateispeichern, und das direkt neben einem Knopf, den es genau deshalb
    gibt. Ein wiederhergestellter Ausschnitt unterdrueckt das einmalige
    Einpassen: Er ist bereits eine Entscheidung.
  - Ausnahme: Zeigt der wiederhergestellte Ausschnitt von den Zielen **gar
    nichts** (Rechtecke ueberlappen sich nicht, `showsSomethingOf`), wird
    trotzdem eingepasst -- sonst staende man vor einer leeren Karte und muesste
    raten, wo die Isochronen liegen. Die Pruefung laeuft genau einmal, nicht bei
    jeder Aenderung; sonst zoege sie die Karte staendig zurueck.
- **Das Verkehrsmittel haengt am einzelnen Ziel, nicht an der App.** Genau das
  ist der Fall, den die App abbildet: Eine Person faehrt Auto zur Arbeit, die
  naechste faehrt Rad. Ein globaler Schalter koennte das nicht ausdruecken, ein
  Schalter je Ziel deckt beides ab. Ein Wechsel verhaelt sich wie eine
  geaenderte Reisezeit: Isochrone sofort neu holen, Analyse-Ergebnis veraltet.
  Die Auswahl im Select ist bereits eine Bestaetigung -- das ist kein
  Tastendruck-Call.
- **Jede POI-Bedingung traegt ihr eigenes Verkehrsmittel** (*geaendert am
  14.09.2026 auf Wunsch des Nutzers*; vorher rechnete Schritt 3 fest mit
  `driving`). Dieselbe Begruendung wie beim Ziel, nur schaerfer: Zum Supermarkt
  geht man, ins Schwimmbad faehrt man, und beides fordert dieselbe Person
  nebeneinander. Ein Wechsel verhaelt sich wie eine geaenderte Zeit -- sofort
  neu suchen, verengte Region verwerfen; die Auswahl im Menue *ist* die
  Bestaetigung. Voreingestellt bleibt `driving`: die weiteste Reichweite und
  damit die Annahme, die am wenigsten still etwas ausschliesst.
- **Der Suchradius haengt am Verkehrsmittel, nicht nur an der Zeit**
  (`KM_PER_MINUTE` in `domain/services/search-area.ts`: Auto 1,5 km/min,
  E-Bike 0,5, Rad 0,4, zu Fuss 0,12 -- jeweils rund die Haelfte ueber dem
  Tempo, mit dem ORS fuer das Profil rechnet). Ein gemeinsamer Wert waere hier
  nicht bloss unsauber, sondern unbrauchbar: Gemessen in der Referenzregion
  (Oldenburg/Delmenhorst, je 25 Min. Auto) findet "10 Minuten" beim Supermarkt
  mit 1,5 km/min **401** Treffer bis 14,9 km ausserhalb, mit dem Fussgaenger-
  wert **80** bis 1,2 km. Die Liste stuende sonst voll mit Orten, zu denen
  niemand laeuft, und die Angabe "x km ausserhalb" waere fuer die Entscheidung
  wertlos. Nach oben gilt weiter: lieber zu viel finden als unbemerkt zu wenig.
- Dass das Verkehrsmittel wirklich bis zum Provider durchschlaegt, haengt nicht
  am Vertrauen: Derselbe Supermarkt, 10 Minuten, ergab ueber `/api/pois/region`
  165 km² erreichbare Flaeche mit dem Auto, 14,4 km² mit dem Rad und 0,8 km²
  zu Fuss.
- POI-Bedingungen sind **Vereinigungen, nicht Schnitte**: Es genuegt, dass *ein*
  gewaehlter Ort erreichbar ist. Erst die Vereinigung wird mit der Familienregion
  geschnitten — O(N+M) statt jede Paarung einzeln zu pruefen.
- **Ueber "drin oder draussen" entscheidet die angezeigte Zahl, nicht die
  rohe** (`poi/distance.ts`) -- dieselbe Regel wie beim Rotwerden der
  Fahrzeiten. Vorher wurde auf `distanceToRegionKm === 0` geprueft und danach
  auf eine Nachkommastelle gerundet: Ein Bahnhof vierzig Meter ausserhalb stand
  als "0,0 km außerhalb" in der Liste -- ein Widerspruch in genau der Zeile, in
  der der Nutzer entscheidet, ob er den Ort anhakt.
- POIs **nie** automatisch vorfiltern. Ein faelschlich ausgeschlossenes grosses
  Studio verkleinert die Region **unsichtbar**; die Hand-Auswahl ist der sichere
  Weg. Die Auswahl wird orts**un**abhaengig persistiert
  (`place:<normalisierte Marke oder Name>`), damit dieselbe Kette bei einer Suche
  an einem anderen Ort wieder greift. Marke und Name teilen sich bewusst einen
  Namensraum — OSM taggt dieselbe Kette mal so, mal so (live in Oldenburg: drei
  clever-fit-Filialen, nur eine mit `brand`).
- **Gruppieren nur, wo eine Kette austauschbar ist** (`gym`, `supermarket`).
  Ortsgebundene Ziele wie `station` bleiben einzeln: OSM traegt dort den
  Betreiber im `brand`/`operator` ("DB InfraGO AG"), was sonst *alle* Bahnhoefe
  in einer Zeile zusammenfassen wuerde. Aus demselben Grund benennt sich eine
  solche Zeile nach `name`, nicht nach `brand` (siehe `labelOf`).
- **Bahnhof heisst in OSM zweierlei.** `railway=station` ist der Bahnhof mit
  Weichen, `railway=halt` der Haltepunkt ohne. Beides muss abgefragt werden:
  In der Referenzregion sind 28 von 69 Bahnstationen Haltepunkte -- Ganderkesee,
  Schierbrok, Oldenburg-Wechloy, Delmenhorst Hasporter Damm. Genau die kleinen
  Pendelstationen fehlten sonst, und zwar unbemerkt.
- **Sieben Kategorien, eine Liste** (*ergaenzt am 13.09.2026 auf Wunsch des
  Nutzers*): Supermarkt, Bahnhof, Kita, Schule, Arztpraxis, Fitnessstudio,
  Schwimmbad. Die Aufzaehlung steht an genau zwei Stellen -- `POI_CATEGORIES`
  in `domain/models/poi.ts` und die Spiegelung in `frontend/types.ts`, dieselbe
  Teilung wie bei `TRAVEL_MODES`. Die zod-Schemas von API *und* `localStorage`
  leiten sich daraus ab, statt die Werte abzuschreiben: Eine im Speicherschema
  vergessene Kategorie liesse den gespeicherten Stand beim Laden **still**
  durchfallen, und der Nutzer faende seine Bedingungen nach einem Reload nicht
  wieder. Aus demselben Grund erzeugt `MapView` den Farbausdruck aus
  `CATEGORY_COLORS`, statt die Kategorien erneut aufzuzaehlen -- eine fehlende
  Zeile waere dort still Grau geworden.
- **Kita und Kindergarten sind in OSM dasselbe Tag** (`amenity=kindergarten`);
  zwei Eintraege lieferten zweimal dieselbe Liste. Die Krippe
  (`amenity=childcare`) ist dagegen ein eigener Tag und wird mit abgefragt:
  22 Orte neben 113, zusammen 132 Treffer. Die Bedingung heisst trotzdem nur
  "Kita" -- "Kita & Kindergarten" ist die einzige Beschriftung, die die
  Kopfzeile der Bedingungskarte auf zwei Zeilen bricht, und die Trefferliste
  zeigt mit "Ev. Kindergarten ..." ohnehin, was darin steckt.
- **"Schwimmbad" ist in OSM kein einzelner Tag.** Baeder stehen als
  `leisure=sports_centre` + `sport=swimming`, `leisure=water_park` oder
  `amenity=public_bath`. `leisure=swimming_pool` ist eigentlich das *Becken*
  und trifft auch Gartenpools -- es bleibt trotzdem drin, ausgeschlossen wird
  nur, was OSM selbst als privat ausweist (7 von 21). Begruendung wie bei den
  Haltepunkten: Ein Hallenbad, das nur so getaggt ist, fehlte sonst unbemerkt,
  waehrend ein Gartenpool sichtbar in der Liste steht und durch die
  Flaechensortierung unten landet. Dass ein Bad mit mehreren Becken mehrfach
  auftaucht, ist harmlos -- es genuegt, *eines* anzuhaken.
- **Arztpraxis ist `amenity=doctors`**, nicht `amenity=hospital`: Ein
  Krankenhaus ist kein Hausarzt. `healthcare=doctor` wird mit abgefragt, war in
  der Referenzregion aber vollstaendig darin enthalten (die Vereinigung ergab
  exakt dieselben 148) -- es steht fuer Gegenden daneben, in denen nur der
  healthcare-Schluessel gesetzt ist, und kostet dank Overpass-Vereinigung
  nichts.
- Kita, Schule, Arztpraxis und Schwimmbad sind **keine Ketten**
  (`CHAIN_CATEGORIES`): Sie haengen wie der Bahnhof an ihrem Ort, und im
  `operator` steht der Traeger ("Stadt Oldenburg"), der sonst die halbe Liste
  in einer Zeile zusammenfasste.
- Die Auswahl kennt zwei Schluesselarten im selben Set: `place:<label>` waehlt
  die ganze Kette (traegt ueber Regionsgrenzen), `poi:<id>` genau einen Ort.
  Eine Kettenzeile laesst sich aufklappen; wird dort eine Filiale abgewaehlt,
  wird der Kettenschluessel in Einzelschluessel aufgeloest (`toggleMember`) --
  sonst verloere man ungewollt alle anderen Filialen.
- Hervorheben und Info-Box sind getrennt: Ein Klick auf die **Kettenzeile**
  hebt *alle* Filialen hervor und oeffnet **keine** Box (die gilt immer genau
  einem Ort); ein Klick auf eine **einzelne** Zeile oder auf einen Kartenpunkt
  oeffnet sie. Darum fuehrt die Karte eine Menge `focusedPoiIds` und daneben
  ein einzelnes `popupPoiId`.
- Eine geaenderte Auswahl entwertet die verengte Region sofort (Layer weg,
  Knopf wieder aktiv) — dieselbe Regel wie beim veralteten
  Analyse-Ergebnis.
- **Eine verschobene Region frischt Schritt 3 auf, sie loescht ihn nicht.**
  Die Treffer wurden im Puffer um die *alte* Region gesucht und taugen nicht
  mehr — sie deshalb wegzuwerfen war unnoetig hart: Eine um eine Minute
  geaenderte Fahrzeit kostete die ganze Bahnhofsliste, und der Nutzer musste
  erst analysieren und dann erneut suchen. Seit die Treffer aus dem
  Plattencache kommen, wird stattdessen nachgezogen, was zuletzt getan war
  (`stepThree`: welche Kategorien gesucht waren, ob uebernommen war). Ein Klick
  auf "Analysieren" loest die ganze Kette aus: `analyze -> pois -> pois/region`.
  Gemessen: 26 statt 25 Minuten ergaben 56 statt 53 Bahnhoefe — die Liste wird
  wirklich neu geholt, nicht nur stehen gelassen.
- **Es gibt genau einen Knopf: "Erreichbarkeit berechnen (n Orte)" unten im
  Dock.** Er heisst nicht "Uebernehmen": Das sagte nur, dass *etwas* passiert,
  nicht *was*. Benannt ist jetzt der Unterschied zum Schritt davor -- die
  Trefferliste kennt nur Luftlinie, hier wird zum ersten Mal wirklich
  gefahren. Die
  Trennlinie ist der Preis, nicht die Schrittzahl:
  - **Kostenlos laeuft von allein.** Die Schnittmenge rechnet sich, sobald alle
    Ziele stehen (55 ms Geometrie auf zwischengespeicherten Isochronen). Aendert
    sie sich, sucht *jede* Bedingung automatisch neu -- Suchbereich und
    Entfernungsangaben haengen an der Region, ein Knopf dafuer waere eine Frage,
    deren Antwort immer "ja" lautet.
  - **Kostenpflichtig fragt nach.** Nur dieser Knopf loest Isochronen um die
    angehakten Orte aus: eine je *neu* angehaktem Ort, bis zu 25, bei 500
    Anfragen am Tag. Wiederholungen sind dank Plattencache gratis, ein neuer Ort
    nicht. Die Zahl am Knopf sagt, wie viel gleich eingeloest wird.
- Dieselbe Logik erklaert, warum Enter im Zielformular sofort eine Isochrone
  holt: Dieser eine Aufruf *ist* der Zweck der Eingabe.
- **"Orte suchen" ist kein Pflichtschritt mehr.** Eine hinzugefuegte Bedingung
  sucht sofort (die Kategorie zu waehlen *ist* die Aufforderung), ein
  geaenderter Radius sucht sofort neu, und eine geaenderte Schnittmenge frischt
  **alle** Bedingungen auf -- nicht nur die schon einmal gesuchten, sonst stuende
  man beim ersten Durchlauf vor einer leeren Liste.
  Der Knopf bleibt nur fuer den Fall, dass Overpass gehakt hat -- was real
  vorkommt: Beim Test antwortete er einmal nach 46 s mit "ueberlastet".
- **Der untere Rand der Seitenleiste ist ein Dock** (`.dock`): darin der
  Knopf (`PoiApplyBar`) und darunter die Statusleiste (`StatusBar`). Beide
  beantworten "was kann ich jetzt tun" und "was passiert gerade" -- das darf
  nicht davon abhaengen, wie weit man gescrollt hat. Am Listenende lag der
  einzige Knopf der App bei drei Bedingungen mit je hundert Treffern gut
  tausend Pixel unterhalb des Fensters: anhaken oben, einloesen ganz unten.
  - Die Seitenleiste hat deshalb **unten kein Polster** (`padding: 20px 20px 0`),
    das liefert das Dock; und das Dock zieht sich mit `margin: 0 -20px` bis an
    beide Raender. Ohne das bleibt ein Streifen, durch den die Liste
    weiterscrollt und neben dem Knopf wieder auftaucht.
  - Fehlermeldungen stehen **ueber** dem Knopf, der erklaerende Satz darunter
    ist genau eine Zeile (`min-height`) -- sonst wandert der Knopf, sobald sich
    der Grund aendert, warum gerade nichts zu tun ist.
  - Auf dem Tab "Orte pruefen" und in Ruhe ist das Dock leer
    (`dock--empty`): kein Rahmen, kein Hintergrund, nur noch das Polster.
- **Was von allein laeuft, muss sichtbar laufen** (`StatusBar`, unten in der
  Seitenleiste). Automatik ohne Anzeige fuehlt sich wie eine haengende UI an --
  Overpass braucht real auch mal eine Minute. Die Leiste zeigt genau die
  laufenden Arbeiten, abgeleitet aus dem Zustand, nicht aus einem eigenen Flag:
  ladende Ziele, Schnittmengenrechnung, suchende Bedingungen, `pois/region`.
  Steht nichts an, ist sie weg -- kein dauerhaft belegter Platz.
  - Ein Text plus "+n weitere"; der vollstaendige Stapel steht im `title`
    (Hover) und die Leiste ist `role="status"` / `aria-live="polite"`.
  - Die Sekundenzahl erscheint erst nach 2 s, der Hinweis "Der Dienst antwortet
    gerade langsam" nach 8 s. Frueher waere es Zappeln: Der haeufige Fall ist
    ein Cache-Treffer in Millisekunden.
  - `prefers-reduced-motion` haelt den Ring an, statt ihn zu drehen.
- **In der Zielkarte bewegt sich nichts, weil man sie bedient.** Der Knopf, der
  eine geaenderte Reisezeit uebernimmt, ist immer da und wird nur unsichtbar
  (`card__apply--idle`), wenn es nichts zu uebernehmen gibt. Frueher erschien er
  erst beim Aendern: Die Kopfzeile wurde breiter, und weil darin nur der Name
  schrumpfen kann, rutschten Verkehrsmittel und Zahlenfeld nach links -- unter
  dem Zeiger weg, der gerade auf dem Pfeil des Zahlenfeldes stand, und an seine
  Stelle der Knopf. Der naechste Klick auf den Pfeil haette dann uebernommen.
  Aus demselben Grund traegt der Knopf einen Haken statt des Wortes
  "Uebernehmen": 24 px lassen sich in der engen Zeile dauerhaft freihalten,
  90 px haetten den Namen dauerhaft verdraengt.

- **Nichts verschwindet, waehrend nachgeladen wird.** Ein Radius von 7 auf 6
  Minuten warf frueher sofort die Trefferliste weg; die Seitenleiste fiel um
  ein paar hundert Pixel zusammen und sprang eine Sekunde spaeter zurueck --
  der Knopf, auf den man zielte, wanderte unter dem Zeiger weg. Stattdessen
  bleibt die alte Liste stehen und wird nur abgeblendet (`is-stale`:
  halbdurchsichtig, `pointer-events: none`), bis die neue da ist; die
  Kopfzeile sagt "sucht…". Dasselbe gilt, wenn die Suche **fehlschlaegt**:
  Liste stehen lassen, Fehler danebenstellen.
  - Die Zahlen gehoeren in diesem Moment noch zum alten Radius -- deshalb
    gesperrt statt nur blass. Sichtbar veraltet ist ehrlich, anklickbar
    veraltet waere eine Falle.
  - Der Analyse-Hinweis (`analysisNotice`) haelt dagegen **keinen** Platz
    frei. Die Vorgaengerzeile tat das (zwei Zeilen `min-height`), weil sie
    immer dastand und nur ihren Text wechselte. Seit sie im Erfolgs- und im
    Rechenfall schweigt, erscheint sie selten -- dauerhaft zwei Zeilen Luft
    dafuer freizuhalten hiesse, den Normalfall fuer den Ausnahmefall zu
    opfern. Wenn sie auftaucht, hat sich ohnehin gerade etwas geaendert.
  - Die Statusleiste selbst darf wachsen: Sie klebt ganz unten, ueber ihr
    verschiebt sich dadurch nichts.
- Solange die Analyse **veraltet** ist (Ziel geaendert, noch nicht analysiert),
  bleibt die Liste stehen. Die **verengte Flaeche** verschwindet trotzdem
  sofort: Sie gehoert zur alten Region, und eine falsche Flaeche stehen zu
  lassen waere still irrefuehrend.
- Die **Auswahl** (die Haekchen) bleibt ohnehin — sie ist ortsunabhaengig.
- Der Tab "Orte pruefen" ist eine **Liste von Kacheln**, kein einzelner Ort.
  Wohnungssuche heisst vergleichen: zwei Adressen nebeneinander beantworten die
  Frage, eine allein nur die halbe. Jede Kachel traegt zugeklappt den Namen und
  **zwei Haken** -- hell die gemeinsame Region, dunkel die zusaetzlich auf Orte
  verengte, in denselben Farben wie die Flaechen auf der Karte
  (`INTERSECTION_COLOR`, `POI_REGION_COLOR`). Aufgeklappt stehen darunter beide
  Urteile als Satz und die Fahrzeit zu jedem Ziel.
  - Zwei Zeichen statt zweier Saetze, weil bei acht Kacheln niemand acht
    Absaetze liest, aber jeder zwei Spalten sieht. Der Strich ist ein eigener
    Zustand neben Haken und Kreuz: "noch nicht entscheidbar" (keine Region
    berechnet, keine Orte uebernommen) ist etwas anderes als "nicht erfuellt".
  - Die Kacheln merken sich **den Ort, nicht das Urteil**. Ob einer in der
    Region liegt, haengt von der aktuellen Region ab und wird beim Laden neu
    bestimmt -- und folgt spaeteren Aenderungen an Analyse und Ortsauswahl,
    statt eine veraltete Antwort stehen zu lassen. Aufgeklappt oder nicht ist
    dagegen Eingabe und wird mitgespeichert.
  - Die Urteile laufen **von allein fuer alle Kacheln** (reine
    Punkt-in-Flaeche-Rechnung, kein Kontingent), die **Fahrzeiten erst beim
    Aufklappen** -- dieselbe Trennlinie wie im Dock: kostenlos laeuft von
    allein, kostenpflichtig fragt nach, und das Aufklappen *ist* die Frage.
    Einmal gemessen, bleibt das Ergebnis bis sich ein Zielpunkt oder ein
    Verkehrsmittel aendert; Zuklappen und wieder Aufklappen misst nicht erneut.
  - `/api/locations/check` nimmt **mehrere Koordinaten in einem Aufruf**. Die
    Flaechen liegen im Rumpf; sie je Ort erneut zu schicken waere bei fuenf
    Adressen fuenfmal dieselbe Geometrie.
  - Derselbe Ort wird nicht zweimal aufgenommen -- die zweite Kachel saehe
    genauso aus und ihr Marker laege unter dem ersten.
  - Auf der Karte traegt **jeder** geprueste Ort seinen eigenen Marker. Den
    Ausschnitt verschiebt nur ein *neu* hinzugekommener, und auch der nur, wenn
    er ausserhalb liegt -- sonst spraenge die Karte bei jedem Aufklappen.
- Die aufgeklappte Kachel nennt **die gemessene Fahrzeit und Strecke zu jedem Ziel**
  (`/api/locations/travel-times`, ORS-Matrix). "Drin oder draussen" allein sagt
  nicht, *wie knapp* es ist, und bei einem Ort ausserhalb nicht, welches Ziel
  daran schuld ist -- genau das steht jetzt daneben, rot mit "+n Min", sobald
  ein Ziel sein Limit reisst. Fuer die **Orte aus Schritt 3** (Studios,
  Bahnhoefe) gibt es das bewusst **nicht**: Bei achtzig Treffern waere das eine
  Tabelle statt einer Antwort, und 80 Messungen statt einer.
  - Eigene Route neben `/locations/check`, nicht dieselbe: Die
    Punkt-in-Flaeche-Pruefung ist reine Geometrie und darf nie daran scheitern,
    dass der Kartendienst klemmt. Faellt die Messung aus, steht das Urteil
    trotzdem, und der Fehler steht daneben. Sie misst je Kachel, nicht fuer
    alle -- eine Kachel, die niemand aufklappt, kostet auch nichts.
  - Gebuendelt wird **je Verkehrsmittel, nicht je Ziel**: Die Matrix misst in
    einem Aufruf zu beliebig vielen Punkten desselben Profils. Fuenf Ziele mit
    dem Auto kosten einen Aufruf, nicht fuenf.
  - Gemessen wird neu, wenn sich Ort, Zielpunkt oder Verkehrsmittel aendern --
    die **erlaubte Fahrzeit steht bewusst nicht im Schluessel**: Sie verschiebt
    nur die Grenze, ab der die Zahl rot wird, nicht die Zahl selbst. Ein
    geaenderter Regler kostet so kein Kontingent.
  - Rot wird die **angezeigte** Zahl verglichen, nicht die rohe: Sonst staende
    bei einer Grenze von 20 Minuten "20 Min" in Rot, weil es 20,4 waren.
  - Isochrone und Messung koennen direkt an der Grenze minimal auseinanderlaufen
    (Fahrzeitflaeche gegen konkrete Route). Die UI sagt das in einer Zeile,
    statt es zu verschweigen.
  - Waehrend nachgemessen wird, bleibt die alte Liste stehen und wird nur
    abgeblendet -- dieselbe Regel wie bei der Trefferliste.
- **Im `localStorage` liegt nur die Eingabe, nie etwas Gerechnetes.** Ziele,
  Zeiten, Verkehrsmittel, Sichtbarkeit, Bedingungen, Haekchen, gepruefte Orte
  und der Kartenausschnitt -- zusammen rund 1 KB. Der Ausschnitt ist Eingabe,
  kein Ergebnis: Wohin jemand geschaut hat, ist eine Entscheidung wie eine
  Reisezeit, und eine Koordinate altert nicht, wie eine Geometrie es tut. Er
  liegt in einem eigenen Schluessel, weil er im Sekundentakt geschrieben wird
  und nicht den ganzen Zustand mitschleppen soll. Isochronen, Schnittmenge, Trefferlisten und verengte
  Region werden beim Start neu geholt. Grund: Eine Geometrie im Browser hat
  kein Ablaufdatum; ein Stand von vor drei Monaten zeigte sonst still ein
  Strassennetz von vor drei Monaten. Der Plattencache im Backend macht das
  billig -- gemessen 0,5 s fuer die komplette Wiederherstellung, null
  Provider-Aufrufe.
- Die Wiederherstellung ist eine **Merkliste** (`pendingRestore`), die Schritt
  fuer Schritt abgearbeitet wird, sobald die Voraussetzung steht: Isochronen ->
  `analysisWasDone` -> je Bedingung `searched` -> `applied`. Jeder Schritt
  streicht sich selbst, sonst liefe er bei jedem Rendern erneut los.
- Gespeichert wird der **Auftrag, nicht das Ergebnis**: `searched` statt der
  Trefferliste, `applied` statt der Flaeche. Ein alter Stand mit eingebetteter
  Geometrie laedt weiter -- daraus wird der Auftrag abgeleitet, die Geometrie
  verworfen.
- Die Invalidierung haengt am *Wechsel* der Schnittmenge (Wertvergleich per
  Ref), nicht an einem "schon gelaufen"-Flag: StrictMode fuehrt Effekte im Dev
  doppelt aus, und ein Flag wuerde den wiederhergestellten Stand im zweiten
  Lauf wegwerfen.
- Die Liste ist nach Aussagekraft vorsortiert, nicht nach Entfernung: belegt
  grosse Grundflaeche (>= 600 m², gemessen an der Gruppe mit der groessten
  Filiale), dann Ketten, dann Unbekanntes, zuletzt belegt kleine Flaechen
  (< 300 m²). Das ist eine **Reihenfolge, kein Filter** — nichts verschwindet.
  Umschaltbar auf "Naechste zuerst".
- **"Grosse zuerst" gibt es nur, wo die Flaeche etwas aussagt**
  (`canSortByRelevance`, *ergaenzt am 14.09.2026 auf Wunsch des Nutzers*).
  `rankOf` baut ganz auf Grundflaeche und Kettenzugehoerigkeit auf. Bei einem
  Supermarkt traegt das -- 3200 m² sind ein Vollsortimenter, 200 m² ein Kiosk.
  Bei einem Bahnhof entscheidet die Flaeche dagegen nur darueber, ob in OSM
  zufaellig jemand ein Empfangsgebaeude eingezeichnet hat: Ein Haltepunkt mit
  getaggtem Haeuschen stand damit ueber dem Hauptbahnhof ohne. Das ist keine
  Reihenfolge, sondern eine Auskunft ueber den Fleiss der Kartierer.
  - Wo es die Wahl nicht gibt, **entfaellt auch das Menue** -- ein Menue mit
    einem Eintrag verspricht eine Entscheidung, die es nicht gibt -- und der
    erklaerende Satz darunter gleich mit; er beschreibt die Flaechenrangfolge.
    Voreingestellt ist dort "Naechste zuerst".
  - Die Menge deckt sich heute mit `CHAIN_CATEGORIES`, meint aber etwas
    anderes: dort geht es um die Austauschbarkeit einer Filiale, hier darum, ob
    ein Quadratmeterwert eine Aussage traegt. Ein Schwimmbad ist keine Kette und
    bleibt trotzdem draussen -- OSM misst dort das Becken, und das trifft auch
    Gartenpools.
  - Ein gespeicherter Stand von vor dieser Regel kann "Grosse zuerst" fuer eine
    Kategorie mitbringen, in der es das nicht mehr gibt; beim Laden wird das auf
    "Naechste zuerst" zurueckgesetzt.

Damit ist der Widerspruch der Spec aufgeloest: §10 (Live-Darstellung) gilt fuer
die **einzelnen Isochronen**, §2/§17/§20 (Button) gilt fuer die **Schnittmenge**.

Hinweis: Die Spec hat zweimal `# 11`. Gemeint sind API (§11) und
Fehlerbehandlung (§12).

## Glättung der Isochronen

*Festgelegt am 14.09.2026.* Anlass war der Einwand, die Fläche zeige Autobahnen
als bewohnbares Land.

Der Einwand trifft, und zwar schärfer als gedacht: Gerechnet wird Erreichbarkeit
auf dem Straßennetz, geliefert wird eine **Hülle** um die erreichbaren Knoten.
Entlang einer Autobahn liegen diese Knoten in einer langen Kette, und die Hülle
schiebt sich seitlich über Land, das real nur über die nächste Abfahrt zu
erreichen ist. Die Fläche behauptet dort also nicht bloß Bewohnbarkeit, sondern
**Erreichbarkeit**.

Wie weit sich die Hülle vom Netz lösen darf, ist bei ORS `smoothing` (0–100).
Gemessen an einem Ziel (Oldenburg, 25 Min. Auto):

| Stellung | Fläche | Stützpunkte |
| --- | --- | --- |
| Feld weggelassen | 1151 km² | 1613 |
| 0 | 1112 km² | 2482 |
| 50 | 1850 km² | 53 |
| 100 | 2414 km² | 22 |

Daraus folgt: **fest auf 0** (`SMOOTHING` im ORS-Adapter). Alles darüber ist
unbrauchbar -- bei 100 ist die Isochrone ein konvexer Klumpen mit 22 Ecken und
mehr als der doppelten Fläche, und die Ortssuche zieht mit (86 statt 81
Bahnhöfe „in der Region"). 0 ist die einzige Stellung, die nur behauptet, was
gerechnet wurde: lieber sichtbar zackig als unsichtbar zu großzügig, dieselbe
Regel wie beim Verzicht auf das Vorfiltern von POIs.

- **Das Feld wegzulassen ist nicht dasselbe wie 0.** ORS wählt dann seine eigene
  Vorgabe, und die liegt gemessen zwischen 0 und 50. Deshalb steht die Null
  ausdrücklich im Rumpf, statt sich auf die Vorgabe zu verlassen.
- **Der Namensraum des Caches trägt die Glättung** (`isochrones-s0`). Ohne das
  blieben die Schlüssel aus lat, lon, Verkehrsmittel und Minuten gleich, zeigten
  aber auf Flächen, die noch mit der Vorgabe gerechnet wurden -- eine Woche lang
  läge eine Mischung aus altem und neuem Umriss in derselben Schnittmenge.
- Es gab dafür kurzzeitig einen Schalter in der Kopfzeile. Er ist wieder
  entfernt: Die Messung oben ist das Ergebnis, das er liefern sollte, und eine
  Einstellung, deren richtiger Wert feststeht, ist keine Einstellung. Was bleibt,
  ist die Zahl im Adapter und diese Tabelle.

Was die Glättung **nicht** kann: die Region auf bewohntes Land beschränken. Das
ginge über Overpass (`landuse=residential`, Ortslagen), wäre aber ein
**Filter** -- und OSM-Landnutzung ist im ländlichen Raum lückenhaft. Ein
fehlendes Polygon löschte ein reales Dorf unsichtbar aus der Region, dieselbe
Gefahr wie beim Vorfiltern von POIs. Falls das je kommt, dann **additiv**:
Ortslagen als eigener Layer über der Region, die Region selbst unangetastet.

## Aussehen: „Kartenwerk"

*Eingeführt am 14.09.2026 auf Wunsch des Nutzers.* Vorher: Systemschrift,
Bootstrap-Blau, ein Radius für alles, sechs native `<select>`.

Leitsatz: **Die Seitenleiste ist das Messinstrument neben der Karte, nicht eine
weitere bunte App.** Daraus folgt der Rest -- papiergrüne Neutraltöne statt
kühlem Grau, Kartentinten-Grün (`#16554a`) als einziger Akzent, 4px-Radien und
Haarlinien statt Kacheln mit Schlagschatten. Zahlen laufen in IBM Plex Mono:
Minuten, Entfernungen und Flächen stehen dann in Spalten untereinander, statt
bei jeder Ziffernänderung die Breite zu wechseln.

### Nichts vom Betriebssystem

Das war die eigentliche Vorgabe, und sie reicht weiter als die Comboboxen. Ein
Widget, das der Rechner zeichnet, hat eine andere Schrift, andere Farben, eine
eigene Verzögerung und einen eigenen Dunkelmodus -- **genau daran** war die
Oberfläche als unfertig zu erkennen, noch bevor jemand die Farben bewertete.
Ersetzt sind darum:

| Vorher | Jetzt |
| --- | --- |
| 6× `<select>` | `components/Select.tsx` (ARIA "Select-Only Combobox") |
| `input type=number` mit System-Pfeilchen | `components/NumberField.tsx` |
| `input type=checkbox` | `appearance: none` plus gezeichneter Haken/Strich |
| `×`, `▼`, `►` als Glyphen | `components/icons.tsx` |
| 🇩🇪 / 🇬🇧 als Emoji | `components/flags.tsx` (gezeichnet) |
| `title=` (System-Tooltip) | `data-tip=` plus `components/TooltipLayer.tsx` |
| `system-ui` | IBM Plex Sans/Mono, per npm mitgeliefert |
| System-Scrollbalken | `::-webkit-scrollbar` / `scrollbar-color` |

Daraus folgt:

- **Die Schriften kommen über npm, nicht über Google Fonts.** Die Mac-App
  startet auch ohne Netz, und ein Schriftabruf bei jedem Start spräche eine
  fremde Adresse an. Die `unicode-range`-Angaben der Pakete sorgen dafür, dass
  nur der lateinische Schnitt geladen wird.
- **Das Menü der Combobox hängt an `document.body`**, nicht an seinem Feld: Die
  Seitenleiste scrollt, und ihre Kante schnitte es sonst ab. Weil es dann nicht
  mitscrollt, schliesst es beim Scrollen -- ehrlicher, als es neben seinem Feld
  stehen zu lassen.
- **Die Pfeile am Zahlenfeld stehen immer da**, nicht erst beim Überfahren --
  derselbe Grund wie beim Haken zum Übernehmen: Ein Feld, das unter dem Zeiger
  die Breite wechselt, schiebt in der Kopfzeile alles daneben zur Seite.
- **Der Sprachumschalter zeigt weiter Flaggen**, aber gezeichnete. Damit
  entfällt der Windows-Rückfall „DE"/„GB" -- Windows liefert für Flaggen-Emoji
  bewusst keine Glyphen. Der Einwand von damals bleibt trotzdem richtig und
  steht oben: Eine Flagge ist ein Land, keine Sprache; der Name trägt weiter
  den zugänglichen Namen.
- **Der Tooltip ist *eine* Schicht am Dokument**, kein Wrapper je Element. Sie
  greift dadurch auch für Knöpfe, die nicht aus React kommen -- etwa
  MapLibres „Alles einpassen". Solange eine Blase steht, verweist ihr Element
  über `aria-describedby` darauf; sonst ginge beim Umstieg von `title` genau
  die Zusatzangabe verloren, für die es den Tooltip gibt.

### Dunkelmodus

Drei Stellungen, nicht zwei: „wie das System", hell, dunkel. „Wie das System"
ist keine dritte Farbe, sondern die Ansage, nicht wählen zu wollen -- es folgt
dem Rechner, wenn der abends umschaltet. Gespeichert wird deshalb die **Wahl**,
nicht das Ergebnis; sonst fröre der erste Besuch die gerade geltende
Einstellung für immer ein. Die Wahl gewinnt in beide Richtungen, dieselbe Regel
wie bei Sprache und Kartenausschnitt.

- **Die Basiskarte schaltet mit** (`MAP_STYLE_URL_DARK`, Vorgabe
  `openfreemap.org/styles/dark`). Eine helle Karte neben einer dunklen
  Seitenleiste ist der hellste Fleck im Bild und blendet genau dort, wo man
  hinsieht. MapView baut die Karte beim Stilwechsel ohnehin neu auf, und der
  Ausschnitt kommt aus `loadViewport()` zurück -- es kostet nichts.
- **Die Kartenfarben drehen sich nicht mit.** Ziel-, Region- und
  Kategoriefarben stehen in `colors.ts` und bedeuten dort etwas. Darum bleibt
  auch `--map-ink` (der Haken im farbigen Abzeichen) in beiden Themen weiss.
- MapLibres Bedienzeichen sind Hintergrundbilder mit eingebauter Strichfarbe.
  Umfärben geht nicht, umkehren schon -- `--icon-invert` steht als Token im
  Themenblock, damit die Regel nur einmal dasteht.

### Die Bedingungskarte

*Überarbeitet am 14.09.2026 auf Wunsch des Nutzers* („sieht irgendwie doof
aus"). Der Grund war nicht die Farbe, sondern die Schachtelung und die
Gewichtung:

- **Ein Kasten, nicht drei.** Die Trefferliste hatte einen eigenen Rahmen
  innerhalb des Kartenrahmens innerhalb der Seitenleiste. Jetzt läuft sie über
  die ganze Breite der Karte (negative Ränder gegen das Polster des Rumpfes),
  getrennt nur durch Haarlinien. Nebeneffekt: Die halb abgeschnittene Zeile am
  unteren Rand sah im umrandeten Kasten wie ein Fehler aus; ohne Rahmen liest
  sie sich als „da kommt noch mehr", und genau das stimmt.
- **Die aufgeklappte Kopfzeile sitzt auf `--sunk`.** Sie ist dann eine
  Überschrift über einem Inhalt und keine Zeile für sich.
- **„Orte suchen" ist ein stiller Knopf** (`.ghost`). Gesucht wird von allein;
  er ist der Rückfall für den Fall, dass Overpass hakt. Als gefüllter Knopf war
  er die lauteste Fläche der Karte und stand damit in Konkurrenz zum einzigen
  echten Knopf der App unten im Dock -- der Trennlinie nach Preis, die den
  ganzen Bedienablauf traegt.
- **Zählzeile und Sortierung sind leiser als die Suchzeile darüber.** Die eine
  berichtet („25 gefunden"), die andere stellt ein. Die Sortierung ist dabei
  eine Ansichtsoption und trägt darum keinen Rahmen (`select--quiet`), wie die
  Schalter in der Kopfzeile.
- **Der Satz zur Reihenfolge ist eine Fussnote** (11px). Vorher hatte die
  leiseste Aussage der Karte dieselbe Schriftgrösse wie der Fliesstext und war
  damit die grösste Textfläche darin.

### Regeln fürs Stylesheet

- **Alle Farben, Radien und Schriften stehen im Tokenblock ganz oben.** Keine
  Regel weiter unten schreibt einen Farbwert hin. Vorher standen neun `#fff`,
  zwei `#fca5a5` und vier verschiedene Radien verstreut in der Datei -- der
  Dunkelmodus hätte genau die Stellen übersehen, die niemand prüft.
- **Eine Bedienzeile, eine Höhe** (`--control-h`, vererbt). Der Behälter setzt
  sie einmal, Auswahlfeld, Zahlenfeld und Knopf darin richten sich danach.
  Vorher rechnete jedes seine Höhe aus Schriftgrösse und Polster selbst aus --
  in der Bedienzeile der Bedingungskarte standen 26,5, 23 und 33 Pixel
  nebeneinander. Gemessen, nicht geschätzt: Solche Zeilen gehören im Browser
  nachgemessen, weil sie einzeln jeweils richtig aussehen.
- **`>` statt Nachfahren, wo die Zeile gemeint ist und nicht ihr Inhalt.**
  `.poi-cond__body .poi-controls button` sollte den Suchknopf treffen und traf
  auch die Pfeilchen tief im Zahlenfeld: Sie erbten dessen `padding-inline:
  11px`, wurden dadurch 22px breit in einer 17px schmalen Spalte und wurden von
  `overflow: hidden` rechts abgeschnitten -- auf dem Schirm ein Schraegstrich
  statt zweier Pfeile. Mit `>` trifft die Regel nur die direkten Kinder der
  Zeile. Zusaetzlich setzt sich das Pfeilchen selbst zurueck (`padding: 0`),
  statt sich auf die Selektoren ringsum zu verlassen.
- **Kein Selektor `.bereich element`, wo genau ein Element gemeint ist.**
  `.poi-cond__body button` meinte den Suchknopf, traf aber jeden Knopf im
  Rumpf -- auch die Trefferzeilen, deren eigenes `padding: 0` mit nur einer
  Klasse dagegen nicht ankam (0,1,0 gegen 0,1,1). Jede Zeile trug dadurch 7px
  Höhe und 11px Einzug, die niemand gesetzt hatte, und die Liste war 14px je
  Zeile zu hoch. Die Regel heisst jetzt `.poi-cond__body .poi-controls button`,
  also das, was gemeint war. Dieselbe Falle bei `.card__minutes button`.
  Wo eine Komponente doch gegenhalten muss, trägt sie zwei Klassen
  (`.select .select__trigger`, `.numfield .numfield__step`).
- **`box-sizing: border-box` macht eine Box nie kleiner als ihr Polster.** Das
  Ankreuzfeld stand auf `width/height: 14px`, erbte aber `padding: 8px 10px`
  von der allgemeinen `input`-Regel -- und war damit 18x22 gross, obwohl die
  Höhe danebenstand. Wer `appearance: none` setzt, muss auch das Polster
  zurücksetzen.
- **Fehlt ein Token, verschwindet die ganze Deklaration.** `var(--pad)` war an
  drei Stellen benutzt und nirgends definiert; CSS lässt ungültige Werte still
  fallen. Das Ergebnis sah nicht kaputt aus, sondern nur unverändert -- die
  Trefferliste lief eben *nicht* bis an die Kanten. Ein Abgleich lohnt:
  `grep -o 'var(--[a-z-]*' styles.css` gegen die Definitionen.
- **Der Fokusring gehört der App.** Ohne eigene Regel zeichnet ihn der Browser
  -- in der Testumgebung orange, anderswo blau, im Dunkelmodus in jedem Fall
  falsch. Für Textfelder gab es die Regel schon, für Knöpfe und Auswahlfelder
  nicht. Jetzt für alles, was den Fokus annimmt, über `:where()` mit
  Spezifität null.

## Texte und Sprachen

Alle Nutzertexte der Oberfläche liegen in `src/frontend/i18n/`, nicht im Code.
Deutsch (`de.ts`) ist die Urfassung, Englisch (`en.ts`) die Übersetzung.

- **Der Typ erzwingt Vollständigkeit.** `Texts` wird aus `de.ts` abgeleitet,
  `en.ts` muss ihn erfüllen. Ein vergessener Schlüssel ist ein Typfehler, kein
  stiller deutscher Rest in einer englischen Oberfläche.
- **Platzhalter sind Funktionen**, keine Vorlagen mit `{0}`: `removeLabel: (name)
  => ...`. Das prüft Anzahl und Typ der Werte beim Übersetzen mit. Die
  Ergänzung dazu ist `tests/i18n.test.ts` -- der Typ sieht weder leere Texte
  noch eine Funktion mit zu wenigen Parametern noch einen fehlenden Eintrag in
  `errors.byCode` (ein `Record`, das jede Menge annimmt).
- **Zugriff als Objektbaum**, nicht per Schlüsselzeichenkette:
  `texts.tabs.addresses` statt `t('tabs.addresses')`. Ein Tippfehler ist damit
  ein Typfehler, und beim Lesen einer Komponente sieht man am Pfad, worum es
  geht.
- **Die Sprache kommt aus der gespeicherten Wahl, sonst aus dem Browser, sonst
  Deutsch.** Die gespeicherte Wahl gewinnt, weil sie eine Entscheidung ist --
  dieselbe Regel wie beim Kartenausschnitt.
- `lang` am Dokument und der Fenstertitel folgen der Sprache. `lang` ist kein
  Beiwerk: Vorleseprogramme wählen danach die Aussprache.
- **Fehlermeldungen des Backends werden über den Code übersetzt**
  (`i18n/errors.ts`), nicht über den Text. Das Backend liefert Code *und*
  deutsche Meldung; es kann die Sprache des Browsers nicht kennen, und
  Übersetzungen gehören nicht in die Domäne. Gibt es zu einem Code keine
  Übersetzung, bleibt die Meldung des Servers stehen -- eine deutsche
  Detailmeldung ist besser als ein englisches "Something went wrong".
- Zahlenformate hängen über `texts.app.locale` an der Sprache (2,3 km gegen
  2.3 km).
- **Der Umschalter zeigt Flaggen** (*geändert am 14.09.2026 auf Wunsch des
  Nutzers*; vorher standen dort die Sprachnamen). Der Einwand bleibt richtig und
  steht hier, damit ihn niemand neu entdecken muss: Eine Flagge ist ein Land,
  keine Sprache -- Deutsch wird in vier Ländern gesprochen, Englisch in weit
  mehr, und wer eine Oberfläche vor sich hat, die er gerade *nicht* versteht,
  sucht das Wort in seiner Sprache. Gewählt ist jeweils das Land der
  Schreibweise des Katalogs (`en` ist `en-GB`, also 🇬🇧).
  - Der Name verschwindet nur aus dem **Bild**, nicht aus der Bedienung:
    `LANGUAGE_NAMES` bleibt der zugängliche Name jeder Auswahl, steht im
    Tooltip, und das Auswahlfeld heisst "Sprache: Deutsch". Ohne das sagte ein
    Vorleseprogramm "Flagge Deutschland" und benennte damit keine Sprache.
  - **Windows hat für Flaggen bewusst keine Glyphen.** Dort stehen statt der
    Flagge die beiden Regionalbuchstaben "DE" bzw. "GB" -- lesbar, aber ein
    anderes Bild als auf dem Mac. Deshalb bleibt die `color`-Regel im CSS
    stehen: Sie wirkt nicht auf ein Emoji, wohl aber auf diesen Rückfall.
  - Die Schriftliste im CSS nennt die Emoji-Schriften **ausdrücklich**; sonst
    greift die Textschrift zuerst und zeigt auch auf dem Mac zwei Buchstaben.
- Die Swift-Hülle bleibt davon unberührt und deutsch: sechs Zeichenketten, ein
  eigener Übersetzungsmechanismus wäre mehr Aufbau als Nutzen.

## Namen gegen Schlüssel

Die App heisst **Wohnzone**. Umbenannt wurde ausschliesslich, was Menschen
lesen. **Nicht** angefasst wurden:

| Schlüssel | Was ein Umbenennen kostete |
| --- | --- |
| `location-optimizer:state:v1` u. a. (`storage.ts`) | Alle gespeicherten Ziele wären weg, in Browser *und* App. |
| `TAG = 'location-optimizer-cache'` (`file-store.ts`) | Der komplette Plattencache wäre unerreichbar -- alles neu beim Anbieter. |
| `de.louiskrause.location-optimizer` (`build-app.sh`) | macOS hielte die App für ein anderes Programm: neuer Speicher, Ziele weg. |

Ein sichtbarer Name darf sich ändern, weil ihn nur Menschen lesen. Ein Schlüssel
ist die Adresse, unter der Daten liegen -- ihn zu ändern heisst nicht
"umbenennen", sondern "woanders nachsehen und nichts finden". Dass beide einmal
gleich hiessen, ist kein Grund, sie gemeinsam zu ändern.

Die Spec behält den alten Namen: Ein rückwirkend umbenannter Auftrag wäre nicht
mehr das historische Dokument, als das er gekennzeichnet ist.

## Caching (Plattenspeicher, nicht Browser)

Provider-Antworten liegen in `.cache/` (gitignored, `CACHE_DIR`), davor ein
LRU im Arbeitsspeicher. Kette: **Speicher -> Platte -> Provider**.

- Der Speicher-Cache allein reicht nicht: Er stirbt mit dem Prozess, im
  Dev-Betrieb also bei jedem Dateispeichern. Gemessen: erster Aufruf 1,12 s,
  nach einem Backend-Neustart 0,06 s statt eines erneuten ORS-Calls.
- Der Browser ist der falsche Ort dafuer. Er cacht pro Geraet, kennt kein
  Ablaufdatum, und zwei Rechner zahlen dasselbe Tageskontingent doppelt.
- **Haltedauer je Typ** (`cache/namespaces.ts`), begruendet aus dem Alterungs-
  tempo der Wirklichkeit, nicht aus Geschmack:
  Isochronen 7 Tage (Strassennetze aendern sich in Monaten, ORS baut seinen
  Graphen periodisch neu), Orte 24 Stunden (Studios und Maerkte machen auf und
  zu), Adressen 30 Tage (ein Ort bleibt, wo er ist), Fahrzeiten 7 Tage
  (derselbe Routing-Graph wie die Isochronen, also derselbe Takt; die Tageszeit
  steckt nicht im Schluessel, weil ORS ohne Verkehrslage rechnet). Alle per
  `.env` aenderbar.
- Ein TTL ist hier **Pflicht**, kein Komfort: Ohne Ablauf lebt ein Eintrag
  ewig weiter und die Region waere *unsichtbar* falsch -- dieselbe Gefahr wie
  beim Vorfiltern von POIs.
- Abgelaufene und beschaedigte Dateien werden geloescht statt uebergangen,
  sonst waechst der Cache mit Daten, die nie wieder jemand liest. Geschrieben
  wird ueber eine Temporaerdatei plus `rename`, damit ein Absturz keine halbe
  Datei hinterlaesst, die wie ein Treffer aussieht.
- Der Cache haelt **keine Nutzerdaten**. Er darf jederzeit geloescht werden;
  das widerspricht nicht "Persistenz ist nicht im MVP", sondern bedient
  Spec 10 (keine unnoetigen API-Aufrufe).

## Mac-App (lokaler Betrieb)

`npm run app` baut `Wohnzone.app` — ein Fenster (`WKWebView`), das die
Oberfläche anzeigt, und dahinter der Node-Server als Kindprozess. Quelle:
`desktop/LocationOptimizer.swift`, zusammengesetzt von `desktop/build-app.sh`.

- **Fenster zu heißt Server aus** (`applicationShouldTerminateAfterLastWindowClosed`).
  Auf dem Mac unüblich — ein Editor bleibt stehen, wenn man das letzte Dokument
  schließt, weil danach ein anderes kommt. Hier kommt keins: Das ist ein Gerät,
  das man an- und ausschaltet. Ein An-/Ausschalter wäre nur nötig, wenn es kein
  Fenster gäbe; das Fenster **ist** der Schalter.
- **Die App benutzt einen festen Port (3456).** Ein zufälliger wäre naheliegend
  (`PORT=0`, Betriebssystem sucht) und war zuerst auch so gebaut -- er ist
  falsch: Der `localStorage` der Oberfläche hängt am Origin, und dazu gehört der
  Port. Ein wechselnder Port heisst bei *jedem* Start ein leerer Speicher, also
  keine Ziele, keine Zeiten, keine Haken. 3456 kollidiert mit nichts im Projekt
  (3001 Backend, 5173 Vite). `PORT=0` bleibt im Server möglich und meldet dann
  den vergebenen Port -- nur die App nutzt es nicht.
- **Der Server meldet seine Bereitschaft als `location-optimizer:ready <port>`**
  auf `stdout`; die App liest diese Zeile und lädt erst dann. Sie wird
  ausgegeben, **nachdem `server.address()` geprüft ist**: Express 5 ruft den
  `listen`-Rückruf auch dann auf, wenn der Bind gescheitert ist, und liefert
  dann `null` -- der `EADDRINUSE` folgt erst danach. Ohne die Prüfung meldete
  der Server Bereitschaft auf einem Port, auf dem ein *fremder* Prozess lauscht,
  und die App zeigte dessen Oberfläche.
- Fehler der Seite (`console.error`, `error`, `unhandledrejection`) werden über
  eine `WKScriptMessageHandler`-Brücke nach `stderr` gereicht, und
  `isInspectable` erlaubt Safaris Entwicklerwerkzeuge. Ohne das ist ein kaputtes
  Bundle unsichtbar -- das Fenster bleibt einfach leer. Genau so ist die
  fehlende Worker-Datei von MapLibre durchgerutscht.
- **Das Kind beendet sich selbst, wenn die App stirbt.** Es bekommt `stdin` als
  Pipe; stirbt die App, schließt der Kernel die Pipe, Node sieht `end` und geht
  (`LOCATION_OPTIMIZER_PARENT_PIPE`). Entscheidend ist, dass **nicht die App
  handeln muss**: Bei "Sofort beenden" bekommt sie SIGKILL und könnte nichts mehr
  aufräumen. Getestet mit `kill -9` — auch über den Zwischenprozess von `tsx`
  hinweg bleibt nichts zurück. Die PID-Datei unter `~/Library/Application
  Support/LocationOptimizer/` ist nur die zweite Sicherung und prüft vor dem
  Töten die Kommandozeile: PIDs werden wiederverwendet.
- **Projektordner und Node-Pfad stehen in der `Info.plist`**, eingetragen beim
  Bauen. Eine aus dem Finder gestartete App erbt die Shell-Umgebung **nicht** —
  kein Homebrew, kein `nvm`, kein PATH. Wer das übersieht, baut eine App, die im
  Terminal läuft und per Doppelklick wortlos nichts tut. Folge: Wird das Projekt
  verschoben, muss die App neu gebaut werden.
- **`NSAllowsLocalNetworking` in der `Info.plist`**, sonst blockiert macOS das
  unverschlüsselte HTTP zu `localhost` und das Fenster bleibt weiß.
- Scheitert der Start, zeigt die App einen **Dialog mit dem `stderr` des Kindes**
  statt eines leeren Fensters. Der häufigste Fall ist der fehlende
  `OPENROUTESERVICE_API_KEY`, bei dem `loadConfig` mit Code 1 abbricht.
- **Die App führt einen eigenen `localStorage`**, getrennt von Safari und Chrome.
  Ziele, die im Browser stehen, tauchen in der App nicht auf — einmal neu
  eingeben. Kontingent kostet das nicht: Der Plattencache liegt beim Backend und
  gilt weiter.
- Der Server liefert `dist/frontend` selbst aus, wenn ein Build existiert — ein
  Prozess statt Vite-Proxy plus Backend. Im Entwicklungsbetrieb ändert sich
  nichts, dort kommt die Oberfläche weiter von Vite.

## Provider-Fakten (verifiziert 13.09.2026)

- Basis-URLs sind `https://api.heigit.org/openrouteservice` (Isochronen) und
  `https://api.heigit.org/pelias/v1` (Geocoding). `api.openrouteservice.org`
  ist abgekündigt (Abschaltung war 24.08.2026) — nicht mehr verwenden.
- Der API-Key geht **nur** über den `Authorization`-Header, nie als
  `api_key`-Query-Parameter (sonst landet er in URLs und Logs).
- Verfuegbare Profile: `driving-car`, `driving-hgv`, `cycling-regular`,
  `cycling-road`, `cycling-mountain`, `cycling-electric`, `foot-walking`,
  `foot-hiking`, `wheelchair`. Angeboten werden davon vier (`TRAVEL_MODES`):
  Auto, Fahrrad, E-Bike (`cycling-electric`), zu Fuss. Rennrad und Mountainbike
  trennen fuer die Wohnortfrage nichts Sinnvolles.
- Das Zeitlimit von 60 Minuten gilt fuer **alle** Profile gleich; zu Fuss sind
  das rund 5 km, mit dem Auto ein halbes Bundesland.
- Die **Matrix** liegt unter derselben Basis-URL wie die Isochronen
  (`/v2/matrix/{profil}`, `metrics: ['duration','distance']`, `units: 'km'`),
  ist aber ein eigener Dienst mit eigenem Tageskontingent -- Fahrzeiten kosten
  nichts vom Kontingent der Isochronen. Kein Eintrag heisst dort keine Route
  (`null`), kein Fehler.
- ORS begrenzt Isochronen auf 3600 s = **60 Minuten**. Das Limit gehoert in den
  Adapter (`IsochroneProvider.maxTravelTimeMinutes`), nicht in die Domain, und
  wird über `/api/config` bis in die UI durchgereicht.

## Fallstricke

- **MapLibre muss aus Vites Dependency-Optimizer ausgenommen bleiben**
  (`optimizeDeps: { exclude: ['maplibre-gl'] }`). MapLibre parst Vektorkacheln
  *und* GeoJSON in einem Web Worker; der Optimizer zerlegt diesen Worker. Folge:
  Kacheln werden geladen, aber nie gerendert — leere Karte, keine Isochronen,
  `map.loaded()` und `isStyleLoaded()` bleiben dauerhaft `false`, `load` feuert
  nie. Die Symptome sehen nach einem Kartenfehler aus, sind aber ein Build-Thema.
  Warnzeichen im Vite-Log: `maplibre-gl-worker.mjs ... does not exist`.

- **Im Produktionsbuild fehlt der MapLibre-Worker, wenn man nichts tut.**
  MapLibre bestimmt dessen Adresse erst zur Laufzeit
  (`new URL('./maplibre-gl-worker.mjs', import.meta.url)`, Dateiname aus einer
  Variablen). Der Bundler sieht die Referenz nicht und legt die Datei nicht ins
  Build. `maplibreWorkerAssets()` in `vite.config.ts` kopiert sie und
  `maplibre-gl-shared.mjs` (der Worker importiert sie relativ zu sich selbst)
  unter ihren Originalnamen nach `assets/`.
  Das Symptom führt in die Irre: Der Einzelseiten-Rückfall beantwortet die
  fehlende Datei mit `index.html`, und der Browser meldet
  `non-JavaScript MIME type of "text/html"` -- das sieht nach einem
  Server-Konfigurationsfehler aus, ist aber eine fehlende Datei.
  Betrifft nur `vite build`; `optimizeDeps.exclude` oben wirkt allein im
  Dev-Betrieb.

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
npm run dev        # Frontend + Backend parallel (Entwicklung)
npm run app        # LocationOptimizer.app bauen
npm start          # Server allein, liefert dist/frontend mit aus
npm test           # Vitest
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
```

## Arbeitsweise

- Nach jeder Phase muss die App lauffähig bleiben (siehe Spec §19).
- Domain-Logik bekommt Tests, bevor UI poliert wird (Spec §21 Prioritäten).
- Bei ungeeignetem Provider: nicht eigenmächtig den Stack wechseln, sondern
  kurz begründen und den Nutzer entscheiden lassen.
