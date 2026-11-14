// For the few places that build markup as a string. Astro templates escape on
// their own; these do it for the rich-text renderer.

const ESCAPES: Record<string, string> = {
  '"': "&quot;",
  "&": "&amp;",
  "'": "&#39;",
  "<": "&lt;",
  ">": "&gt;",
};

export function escapeHtml(value: string): string {
  return value.replace(/["'&<>]/g, (ch) => ESCAPES[ch]);
}

export type AttributeValue = string | number | boolean | null | undefined;

/** Escaped ` name="value"` pairs. True is a bare attribute; false, null and
 *  undefined are left out. */
export function attributes(values: Record<string, AttributeValue>): string {
  return Object.entries(values)
    .map(([name, value]) => {
      if (value === false || value == null) return "";
      if (value === true) return ` ${name}`;
      return ` ${name}="${escapeHtml(String(value))}"`;
    })
    .join("");
}
