/**
 * Touch and Click Event Utilities
 * 
 * Provides unified touch/click handling for mobile and desktop compatibility.
 * Prevents ghost clicks on mobile while ensuring desktop click events work.
 */

/**
 * Creates unified touch/click event handlers that work on both mobile and desktop.
 * Automatically prevents ghost clicks on mobile devices.
 * 
 * @param handler - The function to call when the element is tapped/clicked
 * @returns An object with both onClick and onTouchStart handlers
 * 
 * @example
 * ```tsx
 * const handlePress = () => console.log('Pressed!');
 * <button {...createTouchHandler(handlePress)}>Click Me</button>
 * ```
 */
export function createTouchHandler<T = void>(
  handler: (event?: React.TouchEvent | React.MouseEvent) => T
) {
  let touchStarted = false;
  let touchMoved = false;

  return {
    onTouchStart: (e: React.TouchEvent) => {
      console.log('[TouchUtils] Touch started');
      touchStarted = true;
      touchMoved = false;
      e.currentTarget; // Use e to avoid unused var warning
    },
    
    onTouchMove: (e: React.TouchEvent) => {
      touchMoved = true;
      e.currentTarget; // Use e to avoid unused var warning
    },
    
    onTouchEnd: (e: React.TouchEvent) => {
      console.log('[TouchUtils] Touch ended', { touchStarted, touchMoved });
      if (touchStarted && !touchMoved) {
        e.preventDefault(); // Prevent ghost click
        console.log('[TouchUtils] Executing handler from touch');
        handler(e);
      }
      touchStarted = false;
      touchMoved = false;
    },
    
    onClick: (e: React.MouseEvent) => {
      // Only execute onClick if it wasn't a touch event
      // Touch events set touchStarted, so we skip onClick in that case
      if (!touchStarted) {
        console.log('[TouchUtils] Executing handler from click');
        handler(e);
      }
    },
  };
}

/**
 * Alternative: Simple unified handler that works for most cases
 * Use this for simple button clicks where you don't need fine-grained control
 */
export function createSimpleTouchHandler<T = void>(
  handler: () => T
) {
  return {
    onPointerDown: (e: React.PointerEvent) => {
      console.log('[TouchUtils] Pointer down', e.pointerType);
      // Prevent default to avoid ghost clicks on mobile
      if (e.pointerType === 'touch') {
        e.preventDefault();
      }
      handler();
    },
  };
}

/**
 * Debug logging utility for troubleshooting touch/click issues
 */
export function logTouchEvent(eventName: string, event: React.TouchEvent | React.MouseEvent) {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[TouchDebug] ${eventName}:`, {
      type: event.type,
      target: (event.target as HTMLElement).className,
      timestamp: Date.now(),
    });
  }
}
