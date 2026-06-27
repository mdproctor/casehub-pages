import { use, registerMap, getMap } from "echarts/core";
import { MapChart, ScatterChart } from "echarts/charts";
import {
  GeoComponent,
  VisualMapComponent,
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
} from "echarts/components";
import { CasehubChartElement } from "../base/CasehubChartElement.js";
import type { MapProps } from "@casehubio/pages-component";
import type { TypedDataSet } from "@casehubio/pages-data/dist/dataset/types.js";
import { datasetToSource, applyChartSettings } from "./option-pipeline.js";
import { deepMerge } from "../base/deep-merge.js";

// Register required ECharts components
use([MapChart, ScatterChart, GeoComponent, VisualMapComponent, TooltipComponent, LegendComponent, DatasetComponent]);

const GEO_CDN = "https://cdn.jsdelivr.net/npm/echarts@4.9.0/map/json/world.json";

const mapLoadCache = new Map<string, Promise<void>>();

function ensureMapRegistered(mapName: string): Promise<void> {
  if (getMap(mapName)) return Promise.resolve();

  const existing = mapLoadCache.get(mapName);
  if (existing) return existing;

  const url = mapName === "world" ? GEO_CDN : GEO_CDN;
  const promise = fetch(url)
    .then(res => {
      if (!res.ok) throw new Error(`Failed to load map data: ${String(res.status)}`);
      return res.json() as Promise<Record<string, unknown>>;
    })
    .then(geoJson => {
      registerMap(mapName, geoJson as unknown as Parameters<typeof registerMap>[1]);
    })
    .catch((err: unknown) => {
      mapLoadCache.delete(mapName);
      throw err;
    });

  mapLoadCache.set(mapName, promise);
  return promise;
}

export class CasehubMap extends CasehubChartElement<MapProps> {
  protected override render(
    container: HTMLDivElement,
    props: MapProps,
    dataset: TypedDataSet,
  ): void {
    const mapName = props.mapName ?? "world";
    if (!getMap(mapName)) {
      this.renderLoading(container);
      ensureMapRegistered(mapName)
        .then(() => { super.render(container, props, dataset); })
        .catch((err: unknown) => { this.error = err instanceof Error ? err.message : String(err); });
      return;
    }
    super.render(container, props, dataset);
  }

  override buildOption(
    props: MapProps,
    dataSet: TypedDataSet,
  ): Record<string, unknown> {
    // Stage 1: Convert dataset to source
    const source = datasetToSource(dataSet, props.columns);

    // Stage 2: Build base option based on subtype
    const subtype = props.subtype || "regions";
    const mapName = props.mapName ?? "world";

    let option: Record<string, unknown>;

    if (subtype === "markers") {
      // Scatter on geo coordinate system
      const data = source.slice(1).map(row => ({
        name: row[0] as string,
        value: [row[1], row[2], row[3]],  // [lng, lat, value?]
      }));

      const series: Record<string, unknown> = {
        type: "scatter",
        coordinateSystem: "geo",
        data,
      };

      // If 4th column exists (value), add symbolSize callback
      if (dataSet.columns.length > 3) {
        series.symbolSize = (val: number[]) => {
          const value = val[2];
          return value ? Math.sqrt(value) / 100 : 10;
        };
      }

      option = {
        geo: {
          map: mapName,
          roam: true,
        },
        series: [series],
        tooltip: { trigger: "item" },
      };
    } else {
      // Regions (choropleth) — default
      const data = source.slice(1).map(row => ({
        name: row[0] as string,
        value: row[1] as number,
      }));

      const values = data.map(d => d.value);
      const minValue = values.length === 0 ? 0 : Math.min(...values);
      const maxValue = values.length === 0 ? 0 : Math.max(...values);

      // Parse colorScheme if provided
      const colorScheme = props.colorScheme
        ? props.colorScheme.split(",").map(c => c.trim())
        : ["#e0f3f8", "#abd9e9", "#74add1", "#4575b4", "#313695"];

      option = {
        series: [{
          type: "map",
          map: mapName,
          data,
        }],
        visualMap: {
          min: minValue,
          max: maxValue,
          calculable: true,
          inRange: {
            color: colorScheme,
          },
        },
        tooltip: { trigger: "item" },
      };
    }

    // Stage 3: Apply ChartSettings (skip xAxis/yAxis — map has no axes)
    option = applyChartSettings(option, props, { cartesianAxes: false });

    // Stage 4: Deep merge extra
    if (props.extra) {
      option = deepMerge(option, props.extra);
    }

    return option;
  }
}

customElements.define("casehub-map", CasehubMap);
