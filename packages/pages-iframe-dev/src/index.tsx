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
import * as ReactDOM from "react-dom";
import { ComponentDevPane } from "./ComponentDevPane";
import type {
  DataSet,
  ComponentMessage,
  FunctionResponse,
  FunctionCallRequest,
} from "@casehubio/pages-iframe-api";
import {
  MessageProperty,
  MessageType,
  FunctionResultType,
} from "@casehubio/pages-iframe-api";

const DEV_FILE = "/manifest.dev.json";
const COMP_ID = 42;
let initMessage: ComponentMessage;
let dataSetMessage: ComponentMessage;
let functions: FunctionDef[];

interface Prop {
  key: string;
  value: string;
}

interface FunctionDef {
  name: string;
  response: string;
  params: Prop[];
}

interface ComponentDevConfiguration {
  init: Prop[];
  functions: FunctionDef[];
  dataSet: DataSet;
}

function handleDevConf(text: string) {
  const devConf = JSON.parse(text) as ComponentDevConfiguration;
  const devPane = document.createElement("div");
  document.body.prepend(devPane);

  ReactDOM.render(
    <ComponentDevPane sendDataSet={() => { sendMessage(dataSetMessage); }} sendInit={() => { sendMessage(initMessage); }} />,
    devPane
  );

  window.addEventListener("message", (e) => {
    const allowedOrigin = window.location.origin;

    if (e.origin !== allowedOrigin) {
      return;
    }

    const message = e.data as ComponentMessage;
    if (message.type === MessageType.FUNCTION_CALL) {
      respondFunctionCall(message);
    }
  });

  functions = devConf.functions;
  createInit(devConf);
  createDataSet(devConf);

  setTimeout(() => {
    sendMessage(initMessage);
    setTimeout(() => {
      sendMessage(dataSetMessage);
    }, 100);
  }, 100);
}

function respondFunctionCall(message: ComponentMessage) {
  const functionCall = message.properties[MessageProperty.FUNCTION_CALL] as FunctionCallRequest;
  const functionName = functionCall.functionName;

  const confResponse = functions.filter((f) => f.name === functionName).filter((f) => paramsMatch(functionCall.parameters, f.params))[0];
  console.debug("[COMPONENT DEV] Function response: ");
  console.debug(confResponse);
  let functionResponse: FunctionResponse;
  if (confResponse === undefined) {
    functionResponse = {
      message: "Function not found",
      request: functionCall,
      resultType: FunctionResultType.NOT_FOUND,
      result: undefined,
    };
  } else if (confResponse.response === "ERROR") {
    functionResponse = {
      message: "Function Error!",
      request: functionCall,
      resultType: FunctionResultType.ERROR,
      result: undefined,
    };
  } else {
    functionResponse = {
      message: "Success!",
      request: functionCall,
      resultType: FunctionResultType.SUCCESS,
      result: confResponse.response,
    };
  }

  sendMessage({
    type: MessageType.FUNCTION_RESPONSE,
    properties: { [MessageProperty.FUNCTION_RESPONSE]: functionResponse },
  });
}

function createInit(devConf: ComponentDevConfiguration) {
  const props: Record<string, unknown> = {};
  devConf.init.forEach((prop) => { props[prop.key] = prop.value; });
  initMessage = {
    type: MessageType.INIT,
    properties: props,
  };
}

function createDataSet(devConf: ComponentDevConfiguration) {
  const props: Record<string, unknown> = {};
  devConf.init.forEach((prop) => { props[prop.key] = prop.value; });
  props[MessageProperty.DATASET] = devConf.dataSet;
  dataSetMessage = {
    type: MessageType.DATASET,
    properties: props,
  };
}

function paramsMatch(requestParams: Record<string, unknown>, devParams: Prop[]): boolean {
  const devParamsEmpty = devParams.length === 0;
  const requestParamsEmpty = Object.keys(requestParams).length === 0;
  const allMatch = !devParamsEmpty && devParams.every((p) => requestParams[p.key] === p.value);
  return (devParamsEmpty && requestParamsEmpty) || allMatch;
}

function sendMessage(message: ComponentMessage) {
  console.debug("[COMPONENT DEV] Sending Message");
  console.debug(message);
  message.properties[MessageProperty.COMPONENT_ID] = COMP_ID;
  window.postMessage(message, window.location.href);
}

export class ComponentDev {
  public start() {
    fetch(DEV_FILE)
      .then((r) => r.text())
      .then((text) => { handleDevConf(text); })
      .catch((e: unknown) => { console.log("Not able to load manifest DEV file: " + String(e)); });
  }
}
