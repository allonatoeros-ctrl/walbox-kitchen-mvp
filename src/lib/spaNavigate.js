// Navigazione SPA condivisa (stesso pattern di CustomerKitchenMenu/CustomerOrderStatus: pushState + popstate sintetico).
export function spaNavigate(path, { replace = false } = {}) {
  if (typeof window === 'undefined') return;
  if (replace) window.history.replaceState({}, '', path);
  else window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo?.(0, 0);
}
