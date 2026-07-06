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
import {
  ColumnType,
  FunctionResultType,
  MessageType,
  MessageProperty,
  ComponentApi,
} from "../src/index";
import type {
  DataSet,
  FilterRequest,
  FunctionCallRequest,
  FunctionResponse,
  ComponentMessage,
  ComponentBus,
} from "../src/index";

import { PagesComponentController } from "../src/controller/PagesComponentController";

const controller = new ComponentApi().getComponentController() as PagesComponentController;

const sampleDataSet: DataSet = {
  columns: [
    {
      name: "Name",
      type: ColumnType.LABEL,
      settings: {
        columnId: "name",
        columnName: "Name",
        valueExpression: "value",
        emptyTemplate: "---",
      },
    },
    {
      name: "Age",
      type: ColumnType.NUMBER,
      settings: {
        columnId: "age",
        columnName: "age",
        valueExpression: "value",
        emptyTemplate: "---",
        valuePattern: "#,##0.00",
      },
    },
  ],
  data: [["John", "32"]],
};

describe("[Controller API] Callbacks", () => {
  it("INIT Callback without params", async () => {
    const handleInit = jest.fn();
    controller.setOnInit(handleInit);
    await postInitMessage({});
    expect(handleInit).toHaveBeenCalledTimes(1);
  });

  it("INIT Callback with params", async () => {
    const handleInit = jest.fn();
    const params: Record<string, unknown> = { hello: "world" };
    controller.setOnInit(handleInit);
    await postInitMessage(params);
    expect(handleInit).toHaveBeenCalledWith(params);
  });

  it("DataSet Callback", async () => {
    const handleDataSet = jest.fn();
    controller.setOnDataSet(handleDataSet);
    await postDataSetMessage();
    expect(handleDataSet).toHaveBeenCalledWith(sampleDataSet, expect.objectContaining({}));
  });
});

describe("[Controller API] Sending Requests", () => {
  const bus = mockBus();
  const sendSpy = bus.send;
  const componentId = "42";
  beforeAll(() => {
    controller.init({ [MessageProperty.COMPONENT_ID]: componentId });
    controller.setComponentBus(bus);
  });

  it("Configuration Issues", async () => {
    const configIssue = "some configuration issue.";
    const expected: ComponentMessage = {
      type: MessageType.FIX_CONFIGURATION,
      properties: { [MessageProperty.CONFIGURATION_ISSUE]: configIssue },
    };

    controller.requireConfigurationFix(configIssue);
    await delay(0);

    expect(sendSpy).toHaveBeenCalledWith(componentId, expected);
  });

  it("Configuration Fixed", async () => {
    const message: ComponentMessage = {
      type: MessageType.CONFIGURATION_OK,
      properties: {},
    };
    controller.configurationOk();
    await delay(0);

    expect(sendSpy).toHaveBeenCalledWith(componentId, message);
  });

  it("Filter", () => {
    const filterRequest: FilterRequest = {
      column: 1,
      reset: false,
      row: 1,
    };
    const message: ComponentMessage = {
      type: MessageType.FILTER,
      properties: { [MessageProperty.FILTER]: filterRequest },
    };
    controller.filter(filterRequest);
    expect(sendSpy).toHaveBeenCalledWith(componentId, message);
  });
});

describe("[Controller API] Function Calls", () => {
  it("Function Success", async () => {
    const functionCall = buildFunctionCallRequest();

    const callPromise = controller.callFunction(functionCall);
    await delay(0);

    const result = "SUCCESS RESULT";
    const response = buildFunctionResponse(functionCall, result, FunctionResultType.SUCCESS);

    window.postMessage(response, window.location.origin);
    return expect(callPromise).resolves.toBe(result);
  });

  it("Function Success", async () => {
    const functionCall = buildFunctionCallRequest();

    const callPromise = controller.callFunction(functionCall);
    await delay(0);

    const result = "SUCCESS RESULT";
    const response = buildFunctionResponse(functionCall, result, FunctionResultType.SUCCESS);

    window.postMessage(response, window.location.origin);
    return expect(callPromise).resolves.toBe(result);
  });

  it("Function Not Found", async () => {
    const functionCall = buildFunctionCallRequest();

    const callPromise = controller.callFunction(functionCall);
    await delay(0);

    const message = "NOT FOUND RESULT";
    const response = buildFunctionResponse(functionCall, "", FunctionResultType.NOT_FOUND, message);

    window.postMessage(response, window.location.origin);
    return expect(callPromise).rejects.toBe(message);
  });

  it("Function Execution Error", async () => {
    const functionCall = buildFunctionCallRequest();
    const callPromise = controller.callFunction(functionCall);
    await delay(0);

    const message = "ERROR RESULT";
    const response = buildFunctionResponse(functionCall, "", FunctionResultType.ERROR, message);

    window.postMessage(response, window.location.origin);
    return expect(callPromise).rejects.toBe(message);
  });
});

function buildFunctionCallRequest(): FunctionCallRequest {
  return {
    functionName: "test function name",
    parameters: { test: "test" },
  };
}

const delay = (ms: number) => {
  return new Promise((res) => setTimeout(res, ms));
};

async function postDataSetMessage() {
  const datasetMsg: ComponentMessage = {
    type: MessageType.DATASET,
    properties: { dataSet: sampleDataSet },
  };
  await postMessage(datasetMsg);
}

async function postInitMessage(params: Record<string, unknown>) {
  const init: ComponentMessage = {
    type: MessageType.INIT,
    properties: params,
  };
  await postMessage(init);
}

async function postMessage(message: ComponentMessage) {
  window.postMessage(message, window.location.origin);
  await delay(0);
}

function mockBus(): ComponentBus {
  return {
    destroy: jest.fn(),
    start: jest.fn(),
    send: jest.fn(),
    setListener: jest.fn(),
  };
}

function buildFunctionResponse(
  _request: FunctionCallRequest,
  _result: string,
  _type: FunctionResultType,
  _message?: string
) {
  // sends the response here
  const functionResponse: FunctionResponse = {
    message: _message || "success",
    resultType: _type,
    result: _result,
    request: _request,
  };
  const functionResponseMessage: ComponentMessage = {
    type: MessageType.FUNCTION_RESPONSE,
    properties: { [MessageProperty.FUNCTION_RESPONSE]: functionResponse },
  };

  return functionResponseMessage;
}
