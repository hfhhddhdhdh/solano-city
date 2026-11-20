// Keyboard and mouse, read once per frame. Keys are stored by their `code`
// (KeyW, ShiftLeft, ...) so layouts do not matter; the mouse position is kept
// in screen pixels and converted to world pixels by the renderer.

export const ACTION_CONFIRM = 'Enter';
export const ACTION_PAUSE = 'Escape';

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set(); // keys that went down since the last poll
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let clicked = false;
  let wheel = 0;

  function onKeyDown(event) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(event.code)) event.preventDefault();
    if (!keys.has(event.code)) pressed.add(event.code);
    keys.add(event.code);
  }
  function onKeyUp(event) { keys.delete(event.code); }
  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  }
  function onMouseDown(event) {
    if (event.button === 0) { mouseDown = true; clicked = true; }
  }
  function onMouseUp(event) {
    if (event.button === 0) mouseDown = false;
  }
  function onWheel(event) { wheel += event.deltaY; }
  function onBlur() { keys.clear(); mouseDown = false; }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('wheel', onWheel, { passive: true });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    keys,
    get mouseX() { return mouseX; },
    get mouseY() { return mouseY; },
    get mouseDown() { return mouseDown; },
    get wheel() { const w = wheel; wheel = 0; return w; },
    down(code) { return keys.has(code); },
    /** True once for the frame after the key went down. */
    wasPressed(code) { return pressed.has(code); },
    /** True once for the frame after a left click. */
    wasClicked() { const c = clicked; clicked = false; return c; },
    /** Any of the movement keys, as -1/0/1 on each axis. */
    moveVector() {
      const x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      const y = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
      return { x, y };
    },
    endFrame() { pressed.clear(); },
  };
}
