const CONTROL_SELECTOR = 'input, select, textarea, button';

function sameControl(candidate, signature) {
  if (candidate.tagName !== signature.tagName || candidate.type !== signature.type) return false;
  if (signature.id && candidate.id !== signature.id) return false;
  if (signature.name && candidate.name !== signature.name) return false;
  if (signature.value && candidate.value !== signature.value) return false;
  return signature.data.every(([key, value]) => candidate.dataset[key] === value);
}

function usableControl(control) {
  return control && !control.disabled && control.getClientRects().length > 0;
}

export function captureActiveControl(root, changed) {
  if (changed) return null;
  const active = document.activeElement;
  if (!active || !root.contains(active) || !active.matches(CONTROL_SELECTOR)) return null;
  const controls = [...root.querySelectorAll(CONTROL_SELECTOR)];
  const index = controls.indexOf(active);
  const signature = {
    tagName: active.tagName,
    type: active.type ?? '',
    id: active.id,
    name: active.name ?? '',
    value: active.value ?? '',
    data: Object.entries(active.dataset),
  };
  const selection = typeof active.selectionStart === 'number'
    ? { start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection }
    : null;

  return () => {
    const replacements = [...root.querySelectorAll(CONTROL_SELECTOR)];
    let target = replacements.find((control) => usableControl(control) && sameControl(control, signature));
    if (!target && signature.name) {
      target = replacements.find((control) => usableControl(control) && control.tagName === signature.tagName && control.name === signature.name);
    }
    if (!target && index >= 0) {
      target = replacements.slice(Math.min(index, replacements.length - 1)).find(usableControl)
        ?? [...replacements.slice(0, index)].reverse().find(usableControl);
    }
    if (!target) return false;
    target.focus({ preventScroll: true });
    if (selection && typeof target.setSelectionRange === 'function') {
      const end = Math.min(selection.end, target.value.length);
      target.setSelectionRange(Math.min(selection.start, end), end, selection.direction ?? 'none');
    }
    return document.activeElement === target;
  };
}

export function focusChangedScreen(root, changed) {
  if (!changed) return;
  const target = root.querySelector('.ending h1')
    ?? root.querySelector('.ending-stage h1')
    ?? root.querySelector('.reward-screen h1')
    ?? root.querySelector('.caseboard h1')
    ?? root.querySelector('h1')
    ?? root.querySelector('[tabindex="-1"]');
  if (!target) return;
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' });
  const hud = root.querySelector('.hud');
  const hudStyle = hud ? getComputedStyle(hud) : null;
  const offset = hud && ['sticky', 'fixed'].includes(hudStyle?.position)
    ? hud.getBoundingClientRect().height + 12
    : 12;
  window.scrollBy({ top: -offset, left: 0, behavior: 'auto' });
}
