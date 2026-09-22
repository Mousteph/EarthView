export function readDesignColor(token: string) {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim();

  if (!value) throw new Error(`Missing design color token: ${token}`);
  return value;
}
