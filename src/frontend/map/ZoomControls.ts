import * as maplibregl from 'maplibre-gl';
import type { BoundingBox } from '../types.js';

/**
 * Die Knopfleiste rechts oben: rein, raus, Norden, alles einpassen.
 *
 * Der Einpassen-Knopf ersetzt das automatische Fitten bei jeder Änderung -- wer
 * eine Reisezeit um eine Minute korrigiert, verlor sonst seinen Ausschnitt. Er
 * gehört aber in *dieselbe* Gruppe wie die Zoomknöpfe: Ein eigener Kasten
 * darunter sähe aus wie ein fremdes Werkzeug, obwohl er dasselbe tut wie „+“
 * und „−“ -- den Ausschnitt setzen. Darum wird hier die NavigationControl
 * gekapselt und ihr Container um einen Knopf ergänzt; MapLibre zieht die
 * Trennlinie zwischen den Knöpfen dann von allein.
 *
 * Die Box kommt über eine Funktion statt als Wert, damit der Knopf immer den
 * aktuellen Stand einpasst und nicht den vom Zeitpunkt seiner Erzeugung.
 */
export class ZoomControls implements maplibregl.IControl {
  private readonly getBounds: () => BoundingBox | null;
  private readonly navigation = new maplibregl.NavigationControl();
  private button: HTMLButtonElement | null = null;
  private map: maplibregl.Map | null = null;

  private readonly label: string;

  /**
   * Die Beschriftung kommt von aussen: Diese Klasse lebt ausserhalb von React
   * und kann die Sprache nicht selbst erfragen.
   */
  constructor(getBounds: () => BoundingBox | null, label: string) {
    this.getBounds = getBounds;
    this.label = label;
  }

  onAdd(map: maplibregl.Map): HTMLElement {
    this.map = map;

    const container = this.navigation.onAdd(map);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'maplibregl-ctrl-fit';
    button.dataset.tip = this.label;
    button.setAttribute('aria-label', this.label);
    // Leerer Span mit MapLibres eigener Icon-Klasse: Das Zeichen kommt als
    // background-image aus dem Stylesheet, genau wie bei „+“, „−“ und Kompass.
    // Ein <svg> im Knopf sass stattdessen oben statt mittig -- MapLibres
    // `.maplibregl-ctrl button .maplibregl-ctrl-icon { display: block }` ist
    // spezifischer als jede Klassenregel von uns und gewinnt gegen `flex`.
    const icon = document.createElement('span');
    icon.className = 'maplibregl-ctrl-icon';
    icon.setAttribute('aria-hidden', 'true');
    button.append(icon);
    button.addEventListener('click', () => this.fit());

    container.append(button);
    this.button = button;
    this.update();

    return container;
  }

  onRemove(): void {
    this.navigation.onRemove();
    this.button = null;
    this.map = null;
  }

  /** Ohne Ziele gibt es nichts einzupassen -- der Knopf sagt das, statt zu klicken und nichts zu tun. */
  update(): void {
    if (this.button === null) return;
    this.button.disabled = this.getBounds() === null;
  }

  private fit(): void {
    const bounds = this.getBounds();
    if (this.map === null || bounds === null) return;

    this.map.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      { padding: 60, duration: 600, maxZoom: 13 },
    );
  }
}
