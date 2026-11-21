/** Browsers embedded in a console have a much tighter graphics/JS memory budget than desktop Chrome. */
export function isPlayStationBrowser(userAgent = navigator.userAgent): boolean {
  return /PlayStation\s*[45]/i.test(userAgent);
}

/** `?compat=1` lets another constrained browser use the same conservative boot path. */
export function compatibilityMode(): boolean {
  return isPlayStationBrowser() || new URLSearchParams(window.location.search).get('compat') === '1';
}
