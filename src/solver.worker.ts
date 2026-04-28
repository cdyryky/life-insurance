import { calculateLadder } from "./model";
import type { CalculatorInputs } from "./types";

self.onmessage = (event: MessageEvent<CalculatorInputs>) => {
  const result = calculateLadder(event.data);
  self.postMessage(result);
};
