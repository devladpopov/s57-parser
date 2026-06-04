/**
 * Leaflet Canvas layer for S-57/S-101 chart rendering with S-52 symbology.
 *
 * Extends L.Layer and renders the chart on a Canvas overlay that
 * syncs with Leaflet's map panning and zooming.
 */

import type * as L from 'leaflet';
import type { GeoJSONFeatureCollection } from '@s57-parser/s57';
import type { DisplayMode } from '@s57-parser/s52-render';
import { renderChart } from '@s57-parser/s52-render';
import { loadFile } from './loader.js';

export interface S57LayerOptions {
  /** S-52 display mode (default: DAY_BRIGHT) */
  mode?: DisplayMode;
  /** Opacity 0..1 (default: 1) */
  opacity?: number;
  /** Z-index for the layer pane */
  zIndex?: number;
  /** Whether to show text labels (default: true) */
  showLabels?: boolean;
}

/**
 * A Leaflet layer that renders S-57/S-101 chart data using S-52 symbology.
 *
 * @example
 * ```ts
 * import L from 'leaflet';
 * import { S57Layer } from '@s57-parser/leaflet';
 *
 * const response = await fetch('/chart/US5MA19M.000');
 * const buffer = await response.arrayBuffer();
 * const layer = new S57Layer(buffer, { mode: 'DAY_BRIGHT' });
 * layer.addTo(map);
 * ```
 */
export class S57Layer {
  private _geojson: GeoJSONFeatureCollection | null = null;
  private _canvas: HTMLCanvasElement | null = null;
  private _ctx: CanvasRenderingContext2D | null = null;
  private _map: L.Map | null = null;
  private _options: S57LayerOptions;
  private _format: string = '';
  private _name: string = '';

  constructor(data: ArrayBuffer | GeoJSONFeatureCollection, options: S57LayerOptions = {}) {
    this._options = {
      mode: 'DAY_BRIGHT',
      opacity: 1,
      zIndex: 200,
      showLabels: true,
      ...options,
    };

    if (data instanceof ArrayBuffer) {
      const result = loadFile(data);
      this._geojson = result.geojson;
      this._format = result.format;
      this._name = result.name;
    } else {
      this._geojson = data;
      this._format = 'GeoJSON';
      this._name = 'Custom';
    }
  }

  /** Get the parsed GeoJSON data */
  get geojson(): GeoJSONFeatureCollection | null { return this._geojson; }

  /** Get the detected format */
  get format(): string { return this._format; }

  /** Get the dataset name */
  get name(): string { return this._name; }

  /** Update the display mode and re-render */
  setMode(mode: DisplayMode): void {
    this._options.mode = mode;
    this._render();
  }

  /** Toggle text labels */
  setShowLabels(show: boolean): void {
    this._options.showLabels = show;
    this._render();
  }

  /**
   * Called by Leaflet when the layer is added to a map.
   * Creates the canvas overlay and sets up event listeners.
   */
  onAdd(map: L.Map): this {
    this._map = map;

    this._canvas = document.createElement('canvas');
    this._canvas.style.position = 'absolute';
    this._canvas.style.top = '0';
    this._canvas.style.left = '0';
    this._canvas.style.pointerEvents = 'none';
    this._canvas.style.zIndex = String(this._options.zIndex ?? 200);
    this._canvas.style.opacity = String(this._options.opacity ?? 1);

    const pane = map.getPane('overlayPane');
    if (pane) pane.appendChild(this._canvas);

    this._ctx = this._canvas.getContext('2d');

    map.on('moveend', this._onMoveEnd, this);
    map.on('zoomend', this._onMoveEnd, this);
    map.on('resize', this._onResize, this);

    this._resize();
    this._render();
    return this;
  }

  /**
   * Called by Leaflet when the layer is removed from a map.
   */
  onRemove(map: L.Map): this {
    map.off('moveend', this._onMoveEnd, this);
    map.off('zoomend', this._onMoveEnd, this);
    map.off('resize', this._onResize, this);

    if (this._canvas && this._canvas.parentNode) {
      this._canvas.parentNode.removeChild(this._canvas);
    }
    this._canvas = null;
    this._ctx = null;
    this._map = null;
    return this;
  }

  /**
   * Add this layer to a Leaflet map.
   * Can be used as `layer.addTo(map)` for Leaflet compatibility.
   */
  addTo(map: L.Map): this {
    map.addLayer(this as unknown as L.Layer);
    return this;
  }

  private _onMoveEnd(): void { this._render(); }
  private _onResize(): void { this._resize(); this._render(); }

  private _resize(): void {
    if (!this._canvas || !this._map) return;
    const size = this._map.getSize();
    const dpr = window.devicePixelRatio || 1;
    this._canvas.width = Math.round(size.x * dpr);
    this._canvas.height = Math.round(size.y * dpr);
    this._canvas.style.width = `${size.x}px`;
    this._canvas.style.height = `${size.y}px`;
  }

  private _render(): void {
    if (!this._ctx || !this._canvas || !this._map || !this._geojson) return;

    const map = this._map;
    const size = map.getSize();
    const dpr = window.devicePixelRatio || 1;

    // Ensure canvas size matches
    if (this._canvas.width !== Math.round(size.x * dpr) ||
        this._canvas.height !== Math.round(size.y * dpr)) {
      this._resize();
    }

    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Build view transform: lon/lat → pixel using Leaflet's projection
    const toPixelX = (lon: number): number => {
      const point = map.latLngToContainerPoint([0, lon]);
      return point.x;
    };
    const toPixelY = (lat: number): number => {
      const point = map.latLngToContainerPoint([lat, 0]);
      return point.y;
    };

    // Position canvas relative to map container
    const topLeft = map.containerPointToLayerPoint([0, 0]);
    if (this._canvas.style.transform !== undefined) {
      this._canvas.style.transform = `translate(${topLeft.x}px, ${topLeft.y}px)`;
    }

    renderChart(this._ctx, this._geojson, { toPixelX, toPixelY }, size.x, size.y, {
      mode: this._options.mode,
      showLabels: this._options.showLabels,
    });
  }
}
