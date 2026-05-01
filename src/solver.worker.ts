import { calculateLadder } from "./model";
import type { CalculatorInputs, CalculatorResult } from "./types";

type CalculationRequest = {
  requestId: number;
  inputs: CalculatorInputs;
};

type CalculationResponse = {
  requestId: number;
  result: CalculatorResult;
};

self.onmessage = (event: MessageEvent<CalculationRequest>) => {
  const result = calculateLadder(event.data.inputs);
  self.postMessage({
    requestId: event.data.requestId,
    result
  } satisfies CalculationResponse);
};
