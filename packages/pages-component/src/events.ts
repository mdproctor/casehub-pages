import { matchesTopic } from '@casehubio/pages-data';

export interface PagesEventDetail<T = unknown> {
  readonly topic: string;
  readonly payload: T;
}

export function emitPagesEvent<T>(target: EventTarget, topic: string, payload: T): void {
  target.dispatchEvent(new CustomEvent('pages-event', {
    bubbles: true,
    composed: true,
    detail: { topic, payload } satisfies PagesEventDetail<T>,
  }));
}

export function onPagesEvent<T>(
  target: EventTarget,
  topicOrPattern: string,
  handler: (payload: T) => void,
): () => void {
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<PagesEventDetail<T>>).detail;
    if (matchesTopic(topicOrPattern, detail.topic)) {
      handler(detail.payload);
    }
  };
  target.addEventListener('pages-event', listener);
  return () => { target.removeEventListener('pages-event', listener); };
}
