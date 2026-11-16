import type { Page } from '@playwright/test';

/**
 * WCAG 4.1.2 / 1.3.1, the part axe's `label` rule cannot hold.
 *
 * AXE ACCEPTS A PLACEHOLDER AS AN ACCESSIBLE NAME. Its `label` rule runs a
 * chain of checks and the last link in that chain is `placeholder`: a control
 * carrying `placeholder="Search papers"` and nothing else passes `label`
 * outright. That is not a theoretical gap. A sibling lab's `aria-label` was
 * deleted from a search box as a deliberate negative control and its gate
 * stayed GREEN, because the placeholder underneath it satisfied axe.
 *
 * A placeholder is not a label:
 *   - it disappears the moment the field has a value, so it is gone exactly
 *     when a user returning to a long form needs to know what the field is;
 *   - it is not reliably announced as a name, and several screen-reader and
 *     browser combinations treat it as a hint or ignore it entirely;
 *   - it carries no `for` relationship, so clicking it does not focus the
 *     control and it gives no larger hit target.
 * `title` is accepted by axe in the same last-resort position and has the same
 * problem: it is a tooltip, keyboard- and touch-hostile, and announced
 * inconsistently.
 *
 * So this module asserts the stricter rule the fleet actually wants: every
 * rendered form control takes its accessible name from one of the four real
 * mechanisms —
 *   1. `aria-labelledby` pointing at an element with non-empty text,
 *   2. a non-empty `aria-label`,
 *   3. a `label[for]` whose own text is non-empty,
 *   4. an ancestor `<label>` whose own text is non-empty.
 * A placeholder alone FAILS. A title alone FAILS. Either one ALONGSIDE a real
 * label passes, because then the real label is doing the naming and the
 * placeholder is just a hint — which is what a placeholder is for.
 *
 * WHAT IS OUT OF SCOPE, AND WHY. `input` types `hidden`, `submit`, `button`,
 * `reset` and `image` are skipped: they are not fields a user fills, and they
 * take their name legitimately from `value` or `alt`, which axe's
 * `input-button-name` and `input-image-alt` rules already hold. Controls that
 * are not rendered are skipped, because an unrendered control is not exposed
 * and the gate drives the lab to the states where its controls appear rather
 * than reasoning about them while hidden.
 *
 * KNOWN LIMIT: this walks the light DOM. A control inside a closed shadow root
 * would not be seen. No lab in this fleet ships one; if one ever does, this
 * check will silently skip it rather than report it.
 */

export interface ControlNameFailure {
  /** A selector-ish description, enough to find the element in the source. */
  control: string;
  /** The attributes it *does* carry, so the fix is obvious from the failure. */
  has: string[];
}

export async function auditControlNames(page: Page): Promise<ControlNameFailure[]> {
  return page.evaluate(() => {
    const SKIP_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image']);
    const SELECTOR =
      'input, select, textarea, [role="searchbox"], [role="combobox"], [role="textbox"]';

    /**
     * A label's OWN text, with any nested form control removed first.
     * `<label><select><option>Binary</option></select></label>` has
     * `textContent` "Binary" while naming nothing: the text belongs to the
     * control, not to the label.
     */
    const ownText = (label: Element): string => {
      const clone = label.cloneNode(true) as Element;
      clone.querySelectorAll('input, select, textarea, option, optgroup').forEach((n) => n.remove());
      return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
    };

    const rendered = (el: Element): boolean => {
      const withCheck = el as Element & { checkVisibility?: () => boolean };
      if (typeof withCheck.checkVisibility === 'function') return withCheck.checkVisibility();
      const r = el.getBoundingClientRect();
      return r.width > 0 || r.height > 0;
    };

    const describe = (el: Element): string => {
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute('role');
      const type = el.getAttribute('type');
      const id = el.id ? `#${el.id}` : '';
      const name = el.getAttribute('name');
      return [
        tag,
        id,
        type ? `[type=${type}]` : '',
        name ? `[name=${name}]` : '',
        role && !id ? `[role=${role}]` : '',
      ].join('');
    };

    const failures: ControlNameFailure[] = [];

    for (const el of Array.from(document.querySelectorAll(SELECTOR))) {
      if (el instanceof HTMLInputElement && SKIP_INPUT_TYPES.has(el.type)) continue;
      if (!rendered(el)) continue;

      let named = false;

      const labelledby = el.getAttribute('aria-labelledby');
      if (labelledby) {
        named = labelledby
          .split(/\s+/)
          .filter(Boolean)
          .some((id) => {
            const target = document.getElementById(id);
            return !!target && (target.textContent ?? '').trim() !== '';
          });
      }

      if (!named) {
        const aria = el.getAttribute('aria-label');
        named = !!aria && aria.trim() !== '';
      }

      if (!named && el.id) {
        const escaped = window.CSS && CSS.escape ? CSS.escape(el.id) : el.id;
        for (const label of Array.from(document.querySelectorAll(`label[for="${escaped}"]`))) {
          if (ownText(label) !== '') {
            named = true;
            break;
          }
        }
      }

      if (!named) {
        const wrapping = el.closest('label');
        named = !!wrapping && ownText(wrapping) !== '';
      }

      if (named) continue;

      const has: string[] = [];
      for (const attr of ['placeholder', 'title', 'aria-label', 'aria-labelledby', 'name']) {
        const v = el.getAttribute(attr);
        if (v !== null && v.trim() !== '') has.push(`${attr}="${v}"`);
      }
      failures.push({ control: describe(el), has });
    }

    return failures;
  });
}

export function formatControlNameFailures(failures: ControlNameFailure[]): string[] {
  return failures.map((f) =>
    f.has.length === 0
      ? `${f.control} has no accessible name at all`
      : `${f.control} is named only by ${f.has.join(', ')} — needs label[for], a wrapping <label>, aria-label or aria-labelledby`
  );
}
