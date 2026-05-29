export function createLongPressHelper(options = {}) {
  const thresholdMs = Number.isFinite(options.thresholdMs) ? options.thresholdMs : 360;

  let timerId = null;
  let activePointerId = null;
  let target = null;
  let longPressed = false;

  const clearTimer = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  };

  const reset = () => {
    clearTimer();
    activePointerId = null;
    target = null;
    longPressed = false;
  };

  return {
    handlePointerDown(event) {
      if (activePointerId !== null) {
        return;
      }

      activePointerId = event.pointerId;
      target = event.target;
      longPressed = false;
      clearTimer();

      timerId = setTimeout(() => {
        longPressed = true;
        options.onLongPress?.({ event, target });
      }, thresholdMs);
    },

    handlePointerUp(event) {
      if (event.pointerId !== activePointerId) {
        return false;
      }

      const wasLongPress = longPressed;
      reset();
      return wasLongPress;
    },

    handlePointerCancel(event) {
      if (event.pointerId !== activePointerId) {
        return;
      }
      reset();
    },

    cancel() {
      reset();
    },
  };
}
