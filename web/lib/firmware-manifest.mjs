// The ESP32 compares three decimal components, each in the range 0..999.
export const firmwareVersion = /^(?:0|[1-9][0-9]{0,2})(?:\.(?:0|[1-9][0-9]{0,2})){2}$/;

/** @param {string} url */
export function validImageUrl(url) {
  if (!url.startsWith("https://") || url.length > 400 || /[^\x21-\x7e]|["\\#@]/.test(url) || !URL.canParse(url)) return false;
  return new URL(url).hostname.length > 0 && url[8] !== "/";
}
