const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape text before inserting it into one of the app's HTML template strings. */
export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]);
}
