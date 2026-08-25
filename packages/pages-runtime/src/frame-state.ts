import type { PositionedState } from "./frame-shell.js";
import type { Container } from "./frame-sandbox/types.js";

export interface FrameState extends PositionedState {
  readonly key: string;
  frameEl: HTMLElement;
  tabContentEl: HTMLElement;
  rootContainer: Container;
}
