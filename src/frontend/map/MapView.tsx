import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { INTERSECTION_COLOR, POI_REGION_COLOR } from '../colors.js';
import type {
  AreaFeature,
  BoundingBox,
  CheckedPlace,
  FoundPoi,
  Target,
} from '../types.js';
import { ZoomControls } from './ZoomControls.js';
import { loadViewport, saveViewport } from '../storage.js';
import { isPoiSelected } from '../poi/selection.js';
import { CATEGORY_COLORS, poiIconId, poiIconSvg } from '../poi/icons.js';
import { useTexts } from '../i18n/index.js';

type MapViewProps = {
  styleUrl: string;
  targets: Target[];
  intersection: AreaFeature | null;
  /** Auf die gewählten Orte verengte Region; liegt über der Schnittmenge. */
  poiRegion: AreaFeature | null;
  /** Die im Tab „Orte prüfen“ gesammelten Adressen. */
  checkedPlaces: CheckedPlace[];
  bounds: BoundingBox | null;
  pois: FoundPoi[];
  selectedKeys: Set<string>;
  /** Klick auf einen Punkt -- die Liste hebt die zugehörige Zeile hervor. */
  onPoiClick: (poi: FoundPoi) => void;
  /** Die Info-Box wurde geschlossen (Klick ins Leere oder auf das ×). */
  onPoiClose: () => void;
  /** Häkchen in der Info-Box -- wählt genau diesen Ort aus oder ab. */
  onPoiToggle: (poi: FoundPoi) => void;
  /**
   * Punkte, die hervorgehoben werden. Eine Menge, weil der Klick auf eine
   * Kettenzeile *alle* Filialen dieser Kette meint, nicht nur die nächste.
   */
  focusedPoiIds: ReadonlySet<string>;
  /** Ort, dessen Info-Box offen ist -- immer höchstens einer. */
  popupPoiId: string | null;
};

const INITIAL_CENTER: [number, number] = [10.45, 51.16];
const INITIAL_ZOOM = 5;

const ISOCHRONE_PREFIX = 'isochrone-src-';
const INTERSECTION_SOURCE = 'intersection-src';
const POI_REGION_SOURCE = 'poi-region-src';
const POI_SOURCE = 'poi-src';
const POI_LAYER = 'poi-src-circles';
const POI_ICON_LAYER = 'poi-src-icons';

/**
 * Überlappen sich der aktuelle Ausschnitt und die einzupassende Box? Reine
 * Rechteck-Arithmetik -- es geht nur darum, ob überhaupt etwas zu sehen ist.
 */
const showsSomethingOf = (
  view: maplibregl.LngLatBounds,
  box: BoundingBox,
): boolean =>
  view.getWest() <= box[2] &&
  view.getEast() >= box[0] &&
  view.getSouth() <= box[3] &&
  view.getNorth() >= box[1];

/**
 * Erweitert die Zielboxen um die geprüften Orte. Die dürfen ausserhalb der
 * Region liegen -- gerade dann will man sie beim Einpassen sehen, sonst passt
 * der Knopf „alles ein“ und lässt genau die Adresse weg, um die es geht.
 * Die gefundenen Orte aus Schritt 3 bleiben bewusst draussen: Ihr Suchradius
 * reicht absichtlich über die Region hinaus und würde den Ausschnitt aufblähen.
 */
const withPlaces = (
  bounds: BoundingBox | null,
  places: CheckedPlace[],
): BoundingBox | null => {
  if (places.length === 0) return bounds;

  let box: BoundingBox | null = bounds;
  for (const place of places) {
    const { longitude, latitude } = place.coordinate;
    box =
      box === null
        ? [longitude, latitude, longitude, latitude]
        : [
            Math.min(box[0], longitude),
            Math.min(box[1], latitude),
            Math.max(box[2], longitude),
            Math.max(box[3], latitude),
          ];
  }

  return box;
};

/**
 * Die Punkte gehören immer nach ganz oben. MapLibre hängt einen neuen Layer
 * sonst über alles Bestehende -- wer erst Orte sucht und danach analysiert,
 * bekäme die Schnittmenge über die Punkte gelegt. Statt jede Fläche einzeln
 * einzusortieren, wird die Regel nach jeder Änderung wiederhergestellt.
 */
const raisePoiLayers = (map: maplibregl.Map): void => {
  for (const layer of [POI_LAYER, POI_ICON_LAYER]) {
    if (map.getLayer(layer) !== undefined) map.moveLayer(layer);
  }
};

const POI_CATEGORIES = Object.keys(CATEGORY_COLORS) as Array<
  keyof typeof CATEGORY_COLORS
>;

/**
 * Farbe je Kategorie, direkt aus dem Feature gelesen. Aus CATEGORY_COLORS
 * erzeugt statt von Hand aufgezaehlt: Eine dort ergaenzte Kategorie waere hier
 * sonst still auf Grau gefallen -- ein Fehler, den kein Compiler findet.
 */
// Die Typdefinition von 'match' verlangt eine Tupelform, die ein Spread nicht
// mehr hergibt -- der Ausdruck selbst ist zur Laufzeit derselbe.
const categoryColor = [
  'match',
  ['get', 'category'],
  ...POI_CATEGORIES.flatMap((category) => [category, CATEGORY_COLORS[category]]),
  '#6b7280',
] as unknown as maplibregl.ExpressionSpecification;

/**
 * Registriert die Kategoriesymbole im Style. MapLibre kennt nur fertige Bilder,
 * also werden die SVGs einmalig gerastert. Nach einem Stylewechsel sind die
 * Bilder weg -- deshalb vor jedem Layerbau pruefen.
 */
const ensurePoiIcons = async (map: maplibregl.Map): Promise<void> => {
  await Promise.all(
    POI_CATEGORIES.map(async (category) => {
      const id = poiIconId(category);
      if (map.hasImage(id)) return;

      const image = new Image(44, 44);
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(poiIconSvg(category))}`;
      await image.decode();

      // Zwischen await und hier kann ein anderer Lauf dasselbe Bild gesetzt haben.
      if (!map.hasImage(id)) map.addImage(id, image, { pixelRatio: 2 });
    }),
  );
};

const removeLayerIfPresent = (map: maplibregl.Map, id: string): void => {
  if (map.getLayer(id) !== undefined) map.removeLayer(id);
};

/**
 * Reine Darstellungsschicht: rendert ausschließlich vom Backend geliefertes
 * GeoJSON und berechnet selbst keine Geometrie (Spec 9).
 */
export const MapView = ({
  styleUrl,
  targets,
  intersection,
  poiRegion,
  checkedPlaces,
  bounds,
  pois,
  selectedKeys,
  onPoiClick,
  onPoiClose,
  onPoiToggle,
  focusedPoiIds,
  popupPoiId,
}: MapViewProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef(new Map<string, maplibregl.Marker>());
  /** Ein Marker je geprüftem Ort, nach dessen ID. */
  const checkedMarkersRef = useRef(new Map<string, maplibregl.Marker>());
  const poiPopupRef = useRef<maplibregl.Popup | null>(null);
  const onPoiClickRef = useRef(onPoiClick);
  onPoiClickRef.current = onPoiClick;
  const onPoiCloseRef = useRef(onPoiClose);
  onPoiCloseRef.current = onPoiClose;
  const onPoiToggleRef = useRef(onPoiToggle);
  onPoiToggleRef.current = onPoiToggle;
  // Der Klick-Handler wird nur einmal registriert und würde sonst dauerhaft
  // die POI-Liste des ersten Rendervorgangs festhalten.
  const poisRef = useRef(pois);
  poisRef.current = pois;
  const texts = useTexts();
  /**
   * Der Karten-Effekt läuft genau einmal beim Einhängen. Über eine Ref liest
   * der Einpassen-Knopf die *aktuelle* Beschriftung, nicht die vom Zeitpunkt
   * seiner Erzeugung -- dieselbe Begründung wie bei der Box, die er einpasst.
   */
  const textsRef = useRef(texts);
  textsRef.current = texts;
  const [styleReady, setStyleReady] = useState(false);
  /**
   * Was der Einpassen-Knopf zeigen soll: die Boxen aller Ziele plus die
   * geprüften Orte, die ausserhalb liegen dürfen. Als Ref, weil der Knopf
   * ausserhalb von React lebt und beim Klick den *aktuellen* Stand braucht.
   */
  const fitTargetRef = useRef<BoundingBox | null>(null);
  fitTargetRef.current = withPlaces(bounds, checkedPlaces);
  const fitControlRef = useRef<ZoomControls | null>(null);
  /**
   * Einmal automatisch einpassen, sobald das erste Ziel steht -- sonst bliebe
   * die Deutschlandübersicht stehen und die erste Isochrone wäre ein Fleck.
   * Danach nie wieder von allein: Der Ausschnitt gehört dem Nutzer.
   */
  const didInitialFitRef = useRef(false);
  /** Ob der Ausschnitt aus dem letzten Besuch stammt -- der gehört ihm auch. */
  const restoredViewportRef = useRef(false);

  useEffect(() => {
    if (containerRef.current === null) return;

    // Der zuletzt betrachtete Ausschnitt, falls es einen gibt. Ohne ihn faengt
    // jeder Reload wieder bei der Deutschlanduebersicht an -- im Dev-Betrieb
    // also bei jedem Dateispeichern.
    const stored = loadViewport();
    restoredViewportRef.current = stored !== null;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: stored?.center ?? INITIAL_CENTER,
      zoom: stored?.zoom ?? INITIAL_ZOOM,
      bearing: stored?.bearing ?? 0,
      pitch: stored?.pitch ?? 0,
    });

    // 'moveend' deckt Schieben, Zoomen, Drehen und Neigen gleichermassen ab und
    // feuert einmal am Ende einer Bewegung, nicht bei jedem Bild.
    const rememberViewport = () => {
      const center = map.getCenter();
      saveViewport({
        center: [center.lng, center.lat],
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      });
    };
    map.on('moveend', rememberViewport);

    // Zoom, Norden und „alles einpassen“ in einer Gruppe -- siehe ZoomControls.
    const controls = new ZoomControls(() => fitTargetRef.current, textsRef.current.map.fitAll);
    map.addControl(controls, 'top-right');
    fitControlRef.current = controls;

    // Erst nach 'load' stehen Style und Worker bereit, um Sources und Layer
    // aufzunehmen. Feuert das Event nie, ist der MapLibre-Worker kaputt --
    // siehe optimizeDeps.exclude in vite.config.ts.
    const markReady = () => setStyleReady(true);
    map.on('load', markReady);
    mapRef.current = map;

    const markers = markersRef.current;
    const checkedMarkers = checkedMarkersRef.current;

    return () => {
      map.off('load', markReady);
      map.off('moveend', rememberViewport);
      for (const marker of markers.values()) marker.remove();
      markers.clear();
      for (const marker of checkedMarkers.values()) marker.remove();
      checkedMarkers.clear();
      map.remove();
      mapRef.current = null;
      fitControlRef.current = null;
      setStyleReady(false);
    };
  }, [styleUrl]);

  // Isochronen-Layer und Zielmarker synchronisieren.
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !styleReady) return;

    const withGeometry = targets.filter(
      (target): target is Target & { isochrone: AreaFeature } =>
        target.isochrone !== null,
    );
    const activeIds = new Set(withGeometry.map((target) => target.id));

    // Quellen entfernter Ziele aufräumen.
    for (const sourceId of Object.keys(map.getStyle().sources ?? {})) {
      if (!sourceId.startsWith(ISOCHRONE_PREFIX)) continue;
      if (activeIds.has(sourceId.slice(ISOCHRONE_PREFIX.length))) continue;

      removeLayerIfPresent(map, `${sourceId}-fill`);
      removeLayerIfPresent(map, `${sourceId}-line`);
      map.removeSource(sourceId);
    }

    for (const target of withGeometry) {
      const sourceId = `${ISOCHRONE_PREFIX}${target.id}`;
      const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;

      if (source === undefined) {
        map.addSource(sourceId, { type: 'geojson', data: target.isochrone });
        map.addLayer({
          id: `${sourceId}-fill`,
          type: 'fill',
          source: sourceId,
          paint: { 'fill-color': target.color, 'fill-opacity': 0.18 },
        });
        map.addLayer({
          id: `${sourceId}-line`,
          type: 'line',
          source: sourceId,
          paint: { 'line-color': target.color, 'line-width': 2 },
        });
      } else {
        source.setData(target.isochrone);
      }

      // Ausblenden heisst verstecken, nicht entfernen: Die Quelle bleibt
      // liegen, damit das Wiedereinblenden nichts neu laden muss.
      const visibility = target.visible ? 'visible' : 'none';
      map.setLayoutProperty(`${sourceId}-fill`, 'visibility', visibility);
      map.setLayoutProperty(`${sourceId}-line`, 'visibility', visibility);
    }

    raisePoiLayers(map);

    const markers = markersRef.current;

    for (const [id, marker] of markers) {
      const stillPlaced = targets.some(
        (target) => target.id === id && target.coordinate !== null,
      );
      if (stillPlaced) continue;
      marker.remove();
      markers.delete(id);
    }

    for (const target of targets) {
      if (target.coordinate === null) continue;

      const position: [number, number] = [
        target.coordinate.longitude,
        target.coordinate.latitude,
      ];
      const existing = markers.get(target.id);

      if (existing === undefined) {
        markers.set(
          target.id,
          new maplibregl.Marker({ color: target.color })
            .setLngLat(position)
            .setPopup(new maplibregl.Popup().setText(target.name))
            .addTo(map),
        );
      } else {
        existing.setLngLat(position);
      }
    }
  }, [targets, styleReady]);

  /**
   * Die geprüften Orte sind eigenständige Marker: Sie dürfen weder mit
   * Zielmarkern noch mit den zahlreichen POI-Punkten verwechselt werden.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !styleReady) return;

    const markers = checkedMarkersRef.current;
    const vorhanden = new Set(checkedPlaces.map((place) => place.id));

    for (const [id, marker] of markers) {
      if (!vorhanden.has(id)) {
        marker.remove();
        markers.delete(id);
      }
    }

    let neuerMarker: [number, number] | null = null;

    for (const place of checkedPlaces) {
      const position: [number, number] = [
        place.coordinate.longitude,
        place.coordinate.latitude,
      ];
      const existing = markers.get(place.id);

      if (existing === undefined) {
        const element = document.createElement('div');
        element.className = 'checked-location-marker';
        element.setAttribute('aria-label', texts.map.markerLabel);
        element.textContent = '🏠';

        markers.set(
          place.id,
          new maplibregl.Marker({ element })
            .setLngLat(position)
            .setPopup(new maplibregl.Popup().setText(texts.map.markerPopup(place.label)))
            .addTo(map),
        );
        neuerMarker = position;
      } else {
        existing.setLngLat(position);
        existing.getPopup()?.setText(texts.map.markerPopup(place.label));
      }
    }

    // Nur ein *neu* hinzugekommener Ort verschiebt den Ausschnitt, und auch der
    // nur, wenn er ausserhalb liegt -- sonst spränge die Karte bei jedem
    // Aufklappen einer Kachel.
    if (neuerMarker !== null && !map.getBounds().contains(neuerMarker)) {
      map.easeTo({ center: neuerMarker, zoom: Math.max(map.getZoom(), 10) });
    }
  }, [checkedPlaces, styleReady]);

  // Schnittmenge als eigener, hervorgehobener Layer (Spec 10).
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !styleReady) return;

    const source = map.getSource(INTERSECTION_SOURCE) as
      maplibregl.GeoJSONSource | undefined;

    if (intersection === null) {
      removeLayerIfPresent(map, `${INTERSECTION_SOURCE}-fill`);
      removeLayerIfPresent(map, `${INTERSECTION_SOURCE}-line`);
      if (source !== undefined) map.removeSource(INTERSECTION_SOURCE);
      return;
    }

    if (source === undefined) {
      map.addSource(INTERSECTION_SOURCE, { type: 'geojson', data: intersection });
      map.addLayer({
        id: `${INTERSECTION_SOURCE}-fill`,
        type: 'fill',
        source: INTERSECTION_SOURCE,
        paint: { 'fill-color': INTERSECTION_COLOR, 'fill-opacity': 0.5 },
      });
      map.addLayer({
        id: `${INTERSECTION_SOURCE}-line`,
        type: 'line',
        source: INTERSECTION_SOURCE,
        paint: { 'line-color': INTERSECTION_COLOR, 'line-width': 3 },
      });
    } else {
      source.setData(intersection);
    }

    raisePoiLayers(map);
  }, [intersection, styleReady]);

  /**
   * Verengte Region über der Schnittmenge. Eigene Quelle statt Ersatz, damit
   * sichtbar bleibt, wie viel die POI-Bedingung von der Familienregion abzieht.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !styleReady) return;

    const source = map.getSource(POI_REGION_SOURCE) as
      maplibregl.GeoJSONSource | undefined;

    if (poiRegion === null) {
      removeLayerIfPresent(map, `${POI_REGION_SOURCE}-fill`);
      removeLayerIfPresent(map, `${POI_REGION_SOURCE}-line`);
      if (source !== undefined) map.removeSource(POI_REGION_SOURCE);
      return;
    }

    if (source === undefined) {
      // Unter die Punkte einhaengen -- sonst verdeckt die Flaeche sie.
      const below = map.getLayer(POI_LAYER) !== undefined ? POI_LAYER : undefined;

      map.addSource(POI_REGION_SOURCE, { type: 'geojson', data: poiRegion });
      map.addLayer(
        {
          id: `${POI_REGION_SOURCE}-fill`,
          type: 'fill',
          source: POI_REGION_SOURCE,
          paint: { 'fill-color': POI_REGION_COLOR, 'fill-opacity': 0.55 },
        },
        below,
      );
      map.addLayer(
        {
          id: `${POI_REGION_SOURCE}-line`,
          type: 'line',
          source: POI_REGION_SOURCE,
          paint: { 'line-color': POI_REGION_COLOR, 'line-width': 3 },
        },
        below,
      );
    } else {
      source.setData(poiRegion);
    }

    raisePoiLayers(map);
  }, [poiRegion, styleReady]);

  /**
   * POIs als kleine Kreise, nicht als Nadeln: Bei über hundert Treffern würde
   * ein Nadelwald die Region verdecken. Die Farbe trennt die Kategorien,
   * damit Studio und Supermarkt auch nebeneinander unterscheidbar bleiben.
   * Angehakte Orte bekommen stattdessen ihr Symbol -- sie sind wenige und
   * bestimmen das Ergebnis, also dürfen sie auffallen.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !styleReady) return;

    const collection: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: pois.map((poi) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [poi.coordinate.longitude, poi.coordinate.latitude],
        },
        properties: {
          id: poi.id,
          category: poi.category,
          selected: isPoiSelected(poi, selectedKeys),
          focused: focusedPoiIds.has(poi.id),
        },
      })),
    };

    let cancelled = false;

    const sync = async (): Promise<void> => {
      await ensurePoiIcons(map);
      // Die Karte kann waehrend des Rasterns neu aufgebaut worden sein.
      if (cancelled || mapRef.current !== map) return;

      const source = map.getSource(POI_SOURCE) as maplibregl.GeoJSONSource | undefined;

      if (source !== undefined) {
        source.setData(collection);
        return;
      }

      map.addSource(POI_SOURCE, { type: 'geojson', data: collection });

      map.addLayer({
        id: POI_LAYER,
        type: 'circle',
        source: POI_SOURCE,
        filter: ['!', ['get', 'selected']],
        paint: {
          'circle-radius': ['case', ['get', 'focused'], 7, 4.5],
          'circle-color': categoryColor,
          'circle-opacity': ['case', ['get', 'focused'], 1, 0.7],
          'circle-stroke-width': ['case', ['get', 'focused'], 2.5, 1],
          'circle-stroke-color': ['case', ['get', 'focused'], '#111827', '#ffffff'],
        },
      });

      map.addLayer({
        id: POI_ICON_LAYER,
        type: 'symbol',
        source: POI_SOURCE,
        filter: ['get', 'selected'],
        layout: {
          'icon-image': ['concat', 'poi-icon-', ['get', 'category']],
          // 44px-Bild bei pixelRatio 2 entspricht 22 CSS-Pixeln bei Groesse 1.
          // Darunter ist der Glyph nicht mehr zu erkennen. Vertretbar, weil nur
          // die wenigen angehakten Orte ein Symbol tragen.
          'icon-size': ['case', ['get', 'focused'], 1.2, 1],
          // Symbole duerfen sich ueberlappen -- zwei Filialen liegen in einer
          // Innenstadt schnell so dicht, dass MapLibre sonst eine weglaesst.
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      });

      for (const layer of [POI_LAYER, POI_ICON_LAYER]) {
        map.on('click', layer, (event) => {
          const id = event.features?.[0]?.properties?.['id'] as string | undefined;
          const hit = poisRef.current.find((p) => p.id === id);
          if (hit !== undefined) onPoiClickRef.current(hit);
        });
        map.on('mouseenter', layer, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layer, () => {
          map.getCanvas().style.cursor = '';
        });
      }
    };

    void sync();

    return () => {
      cancelled = true;
    };
  }, [pois, selectedKeys, focusedPoiIds, styleReady]);

  // Info-Box am hervorgehobenen Punkt -- ausgelöst per Klick auf Karte ODER Liste.
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !styleReady) return;

    poiPopupRef.current?.remove();
    poiPopupRef.current = null;

    const poi = pois.find((item) => item.id === popupPoiId);
    if (poi === undefined) return;

    const box = document.createElement('div');
    box.className = 'poi-popup';

    const title = document.createElement('strong');
    title.textContent = poi.name ?? texts.poi.unnamed;
    box.append(title);

    const facts: string[] = [];
    if (poi.brand !== null) facts.push(poi.brand);
    if (poi.sport !== null) facts.push(poi.sport);
    if (poi.areaSquareMeters !== null) {
      facts.push(texts.map.floorArea(Math.round(poi.areaSquareMeters)));
    }
    facts.push(
      poi.distanceToRegionKm === 0
        ? texts.map.insideRegion
        : texts.map.outsideRegion(poi.distanceToRegionKm.toFixed(1)),
    );

    const meta = document.createElement('div');
    meta.className = 'poi-popup__meta';
    meta.textContent = facts.join(' · ');
    box.append(meta);

    // Auswahl direkt an der Karte -- sonst muesste man den Ort erst in der
    // Liste wiederfinden, was bei hunderten Treffern die Haelfte der Arbeit ist.
    const pick = document.createElement('label');
    pick.className = 'poi-popup__pick';

    const box2 = document.createElement('input');
    box2.type = 'checkbox';
    box2.checked = isPoiSelected(poi, selectedKeys);
    box2.addEventListener('change', () => onPoiToggleRef.current(poi));

    pick.append(box2, document.createTextNode(texts.map.select));
    box.append(pick);

    if (poi.website !== null) {
      const link = document.createElement('a');
      link.href = poi.website;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = texts.map.openWebsite;
      box.append(link);
    }

    const popup = new maplibregl.Popup({ offset: 10, closeButton: true })
      .setLngLat([poi.coordinate.longitude, poi.coordinate.latitude])
      .setDOMContent(box)
      .addTo(map);

    // MapLibre schliesst die Box selbst -- beim Klick ins Leere und beim ×.
    // Ohne diese Rueckmeldung bliebe focusedPoiId gesetzt, und derselbe Punkt
    // liesse sich nicht erneut oeffnen (der State aendert sich dann nicht).
    let replacing = false;
    popup.on('close', () => {
      if (!replacing) onPoiCloseRef.current();
    });

    poiPopupRef.current = popup;

    return () => {
      replacing = true;
      popup.remove();
      poiPopupRef.current = null;
    };
    // selectedKeys gehoert in die Abhaengigkeiten, damit das Haekchen auch
    // stimmt, wenn die Auswahl ueber die Liste geaendert wird.
  }, [popupPoiId, pois, selectedKeys, styleReady]);

  // Karte einpassen -- genau einmal, beim ersten Ziel. Jede spätere Änderung
  // (Reisezeit, Verkehrsmittel, weiteres Ziel) lässt den Ausschnitt in Ruhe;
  // dafür gibt es den Knopf rechts oben.
  useEffect(() => {
    const map = mapRef.current;
    const target = fitTargetRef.current;
    fitControlRef.current?.update();
    if (map === null || !styleReady || target === null) return;
    if (didInitialFitRef.current) return;

    // Ab hier gehört der Ausschnitt dem Nutzer -- die Prüfung darunter läuft
    // genau einmal, sonst zöge sie die Karte bei jeder Änderung zurück.
    didInitialFitRef.current = true;

    // Ein wiederhergestellter Ausschnitt bleibt stehen. Nur wenn er von den
    // Zielen gar nichts zeigt, wird trotzdem eingepasst: Sonst stünde man vor
    // einer leeren Karte und müsste raten, wo die Isochronen liegen.
    if (restoredViewportRef.current && showsSomethingOf(map.getBounds(), target)) {
      return;
    }
    map.fitBounds(
      [
        [target[0], target[1]],
        [target[2], target[3]],
      ],
      { padding: 60, duration: 600, maxZoom: 13 },
    );
  }, [bounds, checkedPlaces, styleReady]);

  return <div ref={containerRef} className="map" />;
};
