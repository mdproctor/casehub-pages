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

import type { DataSet, FilterRequest } from "../dataset";
import type { FunctionCallRequest, FunctionResponse } from "../function";
import { FunctionResultType } from "../function";
import { MessageType } from "../message";
import { MessageProperty } from "../message/MessageProperty";
import type { ComponentBus } from "./ComponentBus";
import type { ComponentController } from "./ComponentController";

interface FunctionCallbacks {
  onSucess: (result: unknown) => void;

  onError: (message: string) => void;
}

export class PagesComponentController implements ComponentController {
  private callbacks: Map<string, FunctionCallbacks> = new Map();

  constructor(private bus: ComponentBus, private componentId?: string) {
    // no op
  }

  public onInit: (params: Record<string, unknown>) => void = (p) => {
    console.debug("Received INIT.");
    console.debug(p);
  };

  public onDataSet: (dataSet: DataSet, params?: Record<string, unknown>) => void = (ds) => {
    console.debug("Received DataSet.");
    console.debug(ds);
  };

  public init(params: Record<string, unknown>) {
    const id = params[MessageProperty.COMPONENT_ID];
    if (typeof id === "string") {
      this.componentId = id;
    }
    this.onInit(params);
  }

  public setOnDataSet(onDataSet: (dataSet: DataSet, params?: Record<string, unknown>) => void) {
    this.onDataSet = onDataSet;
  }

  public setOnInit(onInit: (params: Record<string, unknown>) => void) {
    this.onInit = onInit;
  }

  public ready(): void {
    // do nothing because it is not support ATM
  }

  public requireConfigurationFix(message: string): void {
    this.bus.send(this.getComponentId(), {
      type: MessageType.FIX_CONFIGURATION,
      properties: { [MessageProperty.CONFIGURATION_ISSUE]: message },
    });
  }
  public configurationOk(): void {
    this.bus.send(this.getComponentId(), {
      type: MessageType.CONFIGURATION_OK,
      properties: {},
    });
  }

  public filter(filterRequest: FilterRequest): void {
    this.bus.send(this.getComponentId(), {
      type: MessageType.FILTER,
      properties: { [MessageProperty.FILTER]: filterRequest },
    });
  }
  public callFunction(functionCallRequest: FunctionCallRequest): Promise<unknown> {
    this.bus.send(this.getComponentId(), {
      type: MessageType.FUNCTION_CALL,
      properties: { [MessageProperty.FUNCTION_CALL]: functionCallRequest },
    });
    return new Promise((resolve, error) => {
      const key = this.buildFunctionKey(functionCallRequest);
      this.callbacks.set(key, {
        onSucess: resolve,
        onError: error,
      });
    });
  }

  public receiveFunctionResponse(functionResponse: FunctionResponse): void {
    const key = this.buildFunctionKey(functionResponse.request);
    const functionCallbacks = this.callbacks.get(key);
    if (functionCallbacks) {
      if (
        functionResponse.resultType === FunctionResultType.ERROR ||
        functionResponse.resultType === FunctionResultType.NOT_FOUND
      ) {
        functionCallbacks.onError(functionResponse.message);
      } else {
        functionCallbacks.onSucess(functionResponse.result);
      }
    } else {
      console.warn("Callbacks for function call not found. Key: " + key);
    }
    this.callbacks.delete(key);
  }

  public setComponentBus(bus: ComponentBus) {
    this.bus = bus;
  }

  private getComponentId(): string {
    if (this.componentId == null) {
      throw new Error("Component ID is not set. Was init() called?");
    }
    return this.componentId;
  }

  private buildFunctionKey(functionRequest: FunctionCallRequest): string {
    return functionRequest.functionName;
  }
}
