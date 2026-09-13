import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { INTERSECTION_COLOR } from '../colors.js';
import type { AreaFeature, BoundingBox, Target } from '../types.js';

type MapViewProps = {
  styleUrl: string;
  targets: Target[];
  intersection: AreaFeature | null;
  bounds: BoundingBox | null;
};

const INITIAL_CENTER: [number, number] = [10.45, 51.16];
const INITIAL_ZOOM = 5;

const ISOCHRONE_PREFIX = 'isochrone-src-';
const INTERSECTION_SOURCE = 'intersection-src';

const removeLayerIfPresent = (map: maplibregl.Map, id: string): void => {
  if (map.getLayer(id) !== undefined) map.removeLayer(id);
};

/**
 * Reine Darstellungsschicht: rendert ausschließlich vom Backend geliefertes
 * GeoJSON und berechnet selbst keine Geometrie (Spec 9).
 */
export const MapView = ({ styleUrl, targets, intersection, bounds }: MapViewProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef(new Map<string, maplibregl.Marker>());
  const [styleReady, setStyleReady] = useState(false);

  useEffect(() => {
    if (containerRef.current === null) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.on('load', () => setStyleReady(true));
    mapRef.current = map;

    const markers = markersRef.current;

    return () => {
      for (const marker of markers.values()) marker.remove();
      markers.clear();
      map.remove();
      mapRef.current = null;
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
    }

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
  }, [intersection, styleReady]);

  // Karte auf die relevanten Geometrien fitten.
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !styleReady || bounds === null) return;

    map.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      { padding: 60, duration: 600, maxZoom: 13 },
    );
  }, [bounds, styleReady]);

  return <div ref={containerRef} className="map" />;
};
