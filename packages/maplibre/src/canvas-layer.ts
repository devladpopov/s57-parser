/**
 * MapLibre GL JS custom Canvas layer for S-52 symbology rendering.
 *
 * Uses the full S-52 renderer for high-fidelity chart display,
 * rendered as a Canvas overlay on the WebGL map.
 */

import type { Map as MaplibreMap, CustomLayerInterface } from 'maplibre-gl';
import type { GeoJSONFeatureCollection } from '@s57-parser/s57';
import type { DisplayMode } from '@s57-parser/s52-render';
import { renderChart } from '@s57-parser/s52-render';
import { parseS57, toGeoJSON as toGeoJSON57 } from '@s57-parser/s57';
import { parseS101, isS101, toGeoJSON as toGeoJSON101 } from '@s57-parser/s101';

export interface S57CanvasLayerOptions {
  /** S-52 display mode (default: DAY_BRIGHT) */
  mode?: DisplayMode;
  /** Whether to show text labels (default: true) */
  showLabels?: boolean;
}

/**
 * A MapLibre custom layer that renders S-57/S-101 charts with S-52 symbology
 * using a Canvas2D overlay.
 *
 * @example
 * ```ts
 * const layer = new S57CanvasLayer('chart', buffer, { mode: 'DAY_BRIGHT' });
 * map.addLayer(layer);
 * ```
 */
export class S57CanvasLayer implements CustomLayerInterface {
  readonly id: string;
  readonly type = 'custom' as const;
  readonly renderingMode = '2d' as const;

  private _geojson: GeoJSONFeatureCollection;
  private _canvas: HTMLCanvasElement | null = null;
  private _ctx: CanvasRenderingContext2D | null = null;
  private _map: MaplibreMap | null = null;
  private _options: Required<S57CanvasLayerOptions>;

  constructor(
    id: string,
    data: ArrayBuffer | GeoJSONFeatureCollection,
    options: S57CanvasLayerOptions = {}
  ) {
    this.id = id;
    this._options = {
      mode: options.mode ?? 'DAY_BRIGHT',
      showLabels: options.showLabels ?? true,
    };

    if (data instanceof ArrayBuffer) {
      this._geojson = this._parseBuffer(data);
    } else {
      this._geojson = data;
    }
  }

  /** Get the parsed GeoJSON data */
  get geojson(): GeoJSONFeatureCollection { return this._geojson; }

  /** Update the display mode and trigger re-render */
  setMode(mode: DisplayMode): void {
    this._options.mode = mode;
    if (this._map) this._map.triggerRepaint();
  }

  onAdd(map: MaplibreMap): void {
    this._map = map;

    this._canvas = document.createElement('canvas');
    this._canvas.style.position = 'absolute';
    this._canvas.style.top = '0';
    this._canvas.style.left = '0';
    this._canvas.style.pointerEvents = 'none';

    const container = map.getCanvasContainer();
    container.appendChild(this._canvas);

    this._ctx = this._canvas.getContext('2d');
    this._resize();
  }

  onRemove(): void {
    if (this._canvas && this._canvas.parentNode) {
      this._canvas.parentNode.removeChild(this._canvas);
    }
    this._canvas = null;
    this._ctx = null;
    this._map = null;
  }

  render(): void {
    if (!this._ctx || !this._canvas || !this._map) return;

    const map = this._map;
    const canvas = map.getCanvas();
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    if (this._canvas.width !== Math.round(w * dpr) ||
        this._canvas.height !== Math.round(h * dpr)) {
      this._resize();
    }

    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const toPixelX = (lon: number): number => {
      const p = map.project({ lng: lon, lat: 0 });
      return p.x;
    };
    const toPixelY = (lat: number): number => {
      const p = map.project({ lng: 0, lat });
      return p.y;
    };

    renderChart(this._ctx, this._geojson, { toPixelX, toPixelY }, w, h, {
      mode: this._options.mode,
      showLabels: this._options.showLabels,
    });
  }

  private _resize(): void {
    if (!this._canvas || !this._map) return;
    const canvas = this._map.getCanvas();
    const dpr = window.devicePixelRatio || 1;
    this._canvas.width = Math.round(canvas.clientWidth * dpr);
    this._canvas.height = Math.round(canvas.clientHeight * dpr);
    this._canvas.style.width = `${canvas.clientWidth}px`;
    this._canvas.style.height = `${canvas.clientHeight}px`;
  }

  private _parseBuffer(buffer: ArrayBuffer): GeoJSONFeatureCollection {
    if (isS101(buffer)) {
      const dataset = parseS101(buffer);
      const geojson = toGeoJSON101(dataset) as GeoJSONFeatureCollection;
      for (const f of geojson.features) {
        const feat = dataset.features.find(df => df.rcid === f.properties.RCID);
        if (feat) f.properties._attributes = feat.attributes;
      }
      return geojson;
    }

    const dataset = parseS57(buffer);
    const geojson = toGeoJSON57(dataset);
    for (const f of geojson.features) {
      const feat = dataset.features.find(df => df.rcid === f.properties.RCID);
      if (feat) f.properties._attributes = feat.attributes;
    }
    return geojson;
  }
}
