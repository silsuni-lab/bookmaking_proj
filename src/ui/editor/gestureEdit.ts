import { useBookStore } from '../../state/bookStore';

let pointerDown = false;
let paused = false;

/** Call from a slider's onPointerDown: edits until the pointer is released become one undo step. */
export function beginGesture(): void {
  pointerDown = true;
  window.addEventListener(
    'pointerup',
    () => {
      pointerDown = false;
      if (paused) useBookStore.temporal.getState().resume();
      paused = false;
    },
    { once: true },
  );
}

/** Applies a store edit; during a gesture only the first edit is recorded for undo. */
export function gestureEdit(apply: () => void): void {
  apply();
  if (pointerDown && !paused) {
    useBookStore.temporal.getState().pause();
    paused = true;
  }
}
