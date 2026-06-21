/*
 
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *        http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as React from "react";
import { useEffect, useState } from "react";

import type { SvgNodeValue } from "./SvgHeatmap";
import { SvgHeatmap } from "./SvgHeatmap";
import type { DataSet, ComponentController } from "@casehub/pages-iframe-api";
import { ColumnType } from "@casehub/pages-iframe-api";

const SVG_PARAM = "svg";
const BLUR_PARAM = "blur";
const OPACITY_PARAM = "opacity";
const SIZE_PARAM = "size";
const CONTAINS_ID_PARAM = "containsId";

const NOT_ENOUGH_COLUMNS_MSG = "Heatmap expects 2 columns: Node ID (TEXT or Label) and value (NUMBER)";
const INVALID_COLUMNS_TYPE_MSG = "Wrong columns type. First column should be TEXT or LABEL and second column NUMBER.";
const MISSING_PARAM_MSG = "You must provide either a SVG URL or the SVG Content using the parameter 'svg'.";
const INVALID_SVG_PARAM = "SVG parameter is not valid. It should be either a URL or a SVG content";

const validateDataSet = (ds: DataSet): string | undefined => {
  if (ds.columns.length < 2) {
    return NOT_ENOUGH_COLUMNS_MSG;
  }
  const col0 = ds.columns[0];
  const col1 = ds.columns[1];
  if (
    !col0 || !col1 ||
    (col0.type !== ColumnType.TEXT && col0.type !== ColumnType.LABEL) ||
    col1.type !== ColumnType.NUMBER
  ) {
    return INVALID_COLUMNS_TYPE_MSG;
  }
  return undefined;
};

const isUrl = (param: string) => {
  return param && (param.trim().startsWith("http") || param.trim().startsWith("file:"));
};

const isSvg = (param: string) => {
  return param && param.trim().startsWith("<svg");
};

const validateParams = (params: Map<string, string>): string | undefined => {
  const svg = params.get(SVG_PARAM);
  if (!svg) {
    return MISSING_PARAM_MSG;
  }

  if (!(isUrl(svg) || isSvg(svg))) {
    return INVALID_SVG_PARAM;
  }
  return undefined;
};
const extractNodeInfo = (dataset: string[][]): SvgNodeValue[] =>
  dataset.map((row) => ({
    nodeId: row[0]!,
    value: +(row[1]!),
  }));

interface AppState {
  svgContent: string;
  svgNodesValues: SvgNodeValue[];
  containsId?: boolean;
  errorMessage?: string;
  blur?: number;
  sizeFactor?: number;
  opacity?: number;
}

interface Props {
  controller: ComponentController;
}

export function SVGHeatmapComponent(props: Props) {
  const [appState, setAppState] = useState<AppState>({ svgNodesValues: [], svgContent: "" });

  const onDataset = (ds: DataSet, params?: Map<string, any>) => {
    if (!params) return;
    const validationMessage = validateDataSet(ds) || validateParams(params);
    if (validationMessage) {
      props.controller.requireConfigurationFix(validationMessage);
      setAppState((previousState) => ({
        ...previousState,
        errorMessage: validationMessage,
      }));
      return;
    }
    props.controller.configurationOk();

    const blurParam = params.get(BLUR_PARAM);
    const opacityParam = params.get(OPACITY_PARAM);
    const htParams: Record<string, any> = {
      svg: params.get(SVG_PARAM),
      sizeFactor: +params.get(SIZE_PARAM) || 1.0,
      containsId: params.get(CONTAINS_ID_PARAM) === "true",
    };
    if (blurParam) htParams.blur = +blurParam;
    if (opacityParam) htParams.opacity = +opacityParam;

    if (isSvg(htParams.svg)) {
      setAppState((previousState) => ({
        ...previousState,
        svgContent: htParams.svg,
        svgNodesValues: extractNodeInfo(ds.data),
        ...htParams,
      }));
    } else if (isUrl(htParams.svg)) {
      fetch(htParams.svg)
        .then((r) => r.text())
        .then((urlSvgContent) =>
          { setAppState((previousState) => ({
            ...previousState,
            ...htParams,
            svgNodesValues: extractNodeInfo(ds.data),
            svgContent: urlSvgContent,
          })); }
        )
        .catch((e) =>
          { setAppState((previousState) => ({
            ...previousState,
            svgNodesValues: [],
            svgContent: "",
            errorMessage: e,
          })); }
        );
    }
  };

  useEffect(() => { props.controller.setOnDataSet(onDataset); }, [appState.svgNodesValues]);

  return <>{appState?.errorMessage ? <em>{appState.errorMessage}</em> : <SvgHeatmap {...appState} />};</>;
}
