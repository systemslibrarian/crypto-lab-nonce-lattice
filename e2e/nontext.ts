import type { Page } from '@playwright/test';

/**
 * WCAG 1.4.11 (Non-text Contrast) and 1.4.3 for GENERATED CONTENT.
 *
 * These are the two failure classes this fleet's gates could not see at all.
 * `axe` has no rule for either. The arithmetic contrast walk in `contrast.ts`
 * measures *text nodes*, so it cannot reach a control's boundary and cannot
 * reach a `::before`/`::after` glyph, because a pseudo-element is not an
 * element and owns no text node. Between them they accounted for most of the
 * hand-measured findings in this sweep — button boundaries at 1.09:1 against
 * their own panel, and a duplicate-block marker at 1.00:1 that was the entire
 * non-colour cue its exhibit existed to provide.
 *
 * TWO SEPARATE CHECKS LIVE HERE.
 *
 * 1. CONTROL BOUNDARIES, 3:1. A control has to be distinguishable from what
 *    surrounds it. The rule is deliberately narrow to stay useful: an element
 *    is only judged if it is *trying* to draw itself as a control — it has an
 *    own background, or a border, or an outline. A plain text link carries its
 *    own identification and is not flagged.
 *
 *    Then either delineator will do, because either is enough for a sighted
 *    reader to find the edge:
 *      - the FILL against the surface just outside the element, or
 *      - the BORDER against that outside surface (a border is only a boundary
 *        if you can see it against what is beyond it).
 *    An element passes if either clears 3:1. It fails only when neither does,
 *    which is the case where the control genuinely dissolves into its panel.
 *
 * 2. GENERATED CONTENT, 4.5:1 (3:1 for large). `getComputedStyle(el, '::before')`
 *    reports the pseudo's `content`, `color`, `background` and font, so the ink
 *    is knowable; what is not knowable is its box, because a pseudo-element has
 *    no `getBoundingClientRect`. It is measured against its host's composited
 *    backdrop, which is right for the overwhelmingly common case of a glyph
 *    painted inside its host. That approximation is stated rather than hidden:
 *    an absolutely-positioned pseudo that escapes its host is measured against
 *    the wrong surface, and `escaped` is reported so triage can see it.
 *
 * Both checks reuse the composite model from `contrast.ts` — translucent
 * colours over a geometry-aware ancestor walk, with the root's canvas
 * background beneath — because a control's fill is usually an `rgba()` or a
 * `color-mix()` over a panel that is itself translucent, and reading the
 * declared value would measure something the page never paints.
 */

export interface NonTextFailure {
  kind: 'control-boundary' | 'generated-content';
  selector: string;
  detail: string;
  ratio: number;
  required: number;
}

export async function auditNonText(page: Page, within = 'body *'): Promise<NonTextFailure[]> {
  return page.evaluate((rootSelector) => {
    interface RGBA {
      r: number;
      g: number;
      b: number;
      a: number;
    }
    interface Point {
      x: number;
      y: number;
    }

    const TRANSPARENT: RGBA = { r: 0, g: 0, b: 0, a: 0 };
    const WHITE: RGBA = { r: 255, g: 255, b: 255, a: 1 };

    // ── colour core (same model as contrast.ts) ─────────────────────────────
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const colorCache = new Map<string, RGBA | null>();
    const resolve = (c: string): RGBA | null => {
      if (!c) return null;
      const cached = colorCache.get(c);
      if (cached !== undefined) return cached;
      let rgba: RGBA | null = null;
      ctx.fillStyle = '#000';
      ctx.fillStyle = c;
      const fromBlack = ctx.fillStyle;
      ctx.fillStyle = '#fff';
      ctx.fillStyle = c;
      if (fromBlack === ctx.fillStyle) {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = c;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        rgba = { r: d[0]!, g: d[1]!, b: d[2]!, a: d[3]! / 255 };
      }
      colorCache.set(c, rgba);
      return rgba;
    };

    // `over`, `fade`, `lum` and `ratio` come from the ported paint core below,
    // which is the version `contrast.ts` has been exercised against all sweep.

    const styleOf = (el: Element, pseudo?: string): CSSStyleDeclaration => {
      const key = pseudo ?? '';
      const cached = (el as unknown as { __sc?: Map<string, CSSStyleDeclaration> }).__sc?.get(key);
      if (cached) return cached;
      const cs = getComputedStyle(el, pseudo);
      const holder = (el as unknown as { __sc?: Map<string, CSSStyleDeclaration> });
      if (!holder.__sc) holder.__sc = new Map();
      holder.__sc.set(key, cs);
      return cs;
    };
    const rectCache = new Map<Element, DOMRect>();
    const rectOf = (el: Element): DOMRect => {
      let r = rectCache.get(el);
      if (!r) {
        r = el.getBoundingClientRect();
        rectCache.set(el, r);
      }
      return r;
    };

    const splitTopLevel = (str: string, sep: string): string[] => {
      const out: string[] = [];
      let depth = 0;
      let cur = '';
      for (const ch of str) {
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        if (ch === sep && depth === 0) {
          out.push(cur);
          cur = '';
        } else {
          cur += ch;
        }
      }
      if (cur.trim()) out.push(cur);
      return out;
    };

    /** Standard source-over compositing of a (possibly translucent) src on dst. */
    const over = (src: RGBA, dst: RGBA): RGBA => {
      const a = src.a + dst.a * (1 - src.a);
      if (a === 0) return TRANSPARENT;
      return {
        r: (src.r * src.a + dst.r * dst.a * (1 - src.a)) / a,
        g: (src.g * src.a + dst.g * dst.a * (1 - src.a)) / a,
        b: (src.b * src.a + dst.b * dst.a * (1 - src.a)) / a,
        a,
      };
    };

    const fade = (c: RGBA, o: number): RGBA => (o >= 1 ? c : { ...c, a: c.a * o });

    const luminance = (c: RGBA): number => {
      const f = (v: number): number => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };

    const ratio = (a: RGBA, b: RGBA): number => {
      const l1 = luminance(a);
      const l2 = luminance(b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };

    interface Point {
      x: number;
      y: number;
    }
    interface Stop {
      color: RGBA;
      pos: number;
    }

    const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

    /**
     * Interpolate a gradient's stop list at fraction `t`, in premultiplied
     * straight-alpha, the way the compositor blends a fade-to-`transparent`.
     */
    const colorAt = (stops: Stop[], t: number): RGBA => {
      if (!stops.length) return TRANSPARENT;
      if (t <= stops[0].pos) return stops[0].color;
      const last = stops[stops.length - 1];
      if (t >= last.pos) return last.color;
      let i = 0;
      while (i < stops.length - 1 && stops[i + 1].pos < t) i++;
      const a = stops[i];
      const b = stops[i + 1];
      const span = b.pos - a.pos;
      const f = span <= 0 ? 0 : (t - a.pos) / span;
      const al = a.color.a + (b.color.a - a.color.a) * f;
      const pr = a.color.r * a.color.a + (b.color.r * b.color.a - a.color.r * a.color.a) * f;
      const pg = a.color.g * a.color.a + (b.color.g * b.color.a - a.color.g * a.color.a) * f;
      const pb = a.color.b * a.color.a + (b.color.b * b.color.a - a.color.b * a.color.a) * f;
      return al === 0 ? TRANSPARENT : { r: pr / al, g: pg / al, b: pb / al, a: al };
    };

    /** Parse the colour-stop list of a gradient, normalising positions to 0..1. */
    const parseStops = (parts: string[]): Stop[] => {
      const raw: { color: RGBA; pos: number | null }[] = [];
      for (const part of parts) {
        const tokens = splitTopLevel(part.trim(), ' ').filter(Boolean);
        let color: RGBA | null = null;
        const positions: number[] = [];
        for (const tok of tokens) {
          const c = resolve(tok);
          if (c && !color) color = c;
          else if (tok.endsWith('%')) positions.push(parseFloat(tok) / 100);
        }
        if (!color) continue;
        // A stop may carry two positions (a hard band); emit one per position.
        if (positions.length === 0) raw.push({ color, pos: null });
        else for (const p of positions) raw.push({ color, pos: p });
      }
      if (!raw.length) return [];
      if (raw[0].pos === null) raw[0].pos = 0;
      if (raw[raw.length - 1].pos === null) raw[raw.length - 1].pos = 1;
      for (let i = 1; i < raw.length - 1; i++) {
        if (raw[i].pos !== null) continue;
        let j = i;
        while (j < raw.length && raw[j].pos === null) j++;
        const lo = raw[i - 1].pos as number;
        const hi = (raw[j]?.pos as number) ?? 1;
        for (let k = i; k < j; k++) raw[k].pos = lo + ((hi - lo) * (k - i + 1)) / (j - i + 1);
      }
      // CSS clamps positions to be non-decreasing.
      let run = 0;
      return raw.map((s) => {
        run = Math.max(run, s.pos as number);
        return { color: s.color, pos: run };
      });
    };

    const axisValue = (tok: string, origin: number, extent: number): number => {
      if (tok === 'left' || tok === 'top') return origin;
      if (tok === 'right' || tok === 'bottom') return origin + extent;
      if (tok === 'center') return origin + extent / 2;
      if (tok.endsWith('%')) return origin + (parseFloat(tok) / 100) * extent;
      if (tok.endsWith('px')) return origin + parseFloat(tok);
      return origin + extent / 2;
    };

    const VERT = new Set(['top', 'bottom']);
    const HORZ = new Set(['left', 'right']);

    /**
     * Evaluate one background-image layer at a document point.
     *
     * The previous gate judged every gradient at its worst *stop*, assuming that
     * stop covered the text wherever the text sat. That is right for a gradient
     * that spans its element, but this page's `:root` paints two low-alpha
     * radial washes that fade to `transparent` by ~30% — decorative glows in the
     * top corners. Judging the footer, a full page-height below, by the corner
     * colour invented backdrops the footer text never sits on (accent links read
     * 3.56:1 where they actually render ~4.9:1). So each gradient is *sampled* at
     * the text's real location instead: linear by projecting onto the gradient
     * line, radial by distance from the centre over the farthest-corner radius.
     * A non-gradient layer (`url()`, `none`) is unmeasurable and paints nothing.
     */
    const sampleLayer = (layer: string, rect: DOMRect, p: Point): RGBA => {
      if (!/gradient/.test(layer)) return TRANSPARENT;
      const inner = layer.slice(layer.indexOf('(') + 1, layer.lastIndexOf(')'));
      const parts = splitTopLevel(inner, ',').map((s) => s.trim());
      const radial = /radial-gradient/.test(layer);
      // The first part is configuration (angle / shape / position) exactly when
      // it holds no resolvable colour.
      const firstColour = parts[0]
        ? splitTopLevel(parts[0], ' ').some((t) => resolve(t.trim()))
        : false;
      const config = firstColour ? '' : parts[0] ?? '';
      const stops = parseStops(firstColour ? parts : parts.slice(1));
      if (!stops.length) return TRANSPARENT;

      if (radial) {
        // Centre: `... at X Y`. Default centre of the box.
        let cx = rect.left + rect.width / 2;
        let cy = rect.top + rect.height / 2;
        const at = config.split(/\s+at\s+/)[1];
        if (at) {
          const toks = at.split(/\s+/).filter(Boolean);
          const kw = toks.filter((t) => VERT.has(t) || HORZ.has(t) || t === 'center');
          const vals = toks.filter((t) => !kw.includes(t));
          for (const t of toks) {
            if (HORZ.has(t)) cx = axisValue(t, rect.left, rect.width);
            else if (VERT.has(t)) cy = axisValue(t, rect.top, rect.height);
          }
          if (vals[0]) cx = axisValue(vals[0], rect.left, rect.width);
          if (vals[1]) cy = axisValue(vals[1], rect.top, rect.height);
        }
        // Default ending shape is farthest-corner.
        const corners = [
          [rect.left, rect.top],
          [rect.right, rect.top],
          [rect.left, rect.bottom],
          [rect.right, rect.bottom],
        ];
        const radius = Math.max(...corners.map(([x, y]) => Math.hypot(x - cx, y - cy)));
        const t = radius <= 0 ? 0 : Math.hypot(p.x - cx, p.y - cy) / radius;
        return colorAt(stops, clamp01(t));
      }

      // Linear. Default direction is `to bottom` (180deg).
      let angle = 180;
      if (/deg/.test(config)) angle = parseFloat(config);
      else if (/to\s+top/.test(config)) angle = 0;
      else if (/to\s+right/.test(config)) angle = 90;
      else if (/to\s+left/.test(config)) angle = 270;
      const rad = (angle * Math.PI) / 180;
      const dir = { x: Math.sin(rad), y: -Math.cos(rad) };
      const len = Math.abs(rect.width * Math.sin(rad)) + Math.abs(rect.height * Math.cos(rad));
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const d = (p.x - cx) * dir.x + (p.y - cy) * dir.y;
      const t = len <= 0 ? 0.5 : 0.5 + d / len;
      return colorAt(stops, clamp01(t));
    };

    /**
     * The colour this element's own box paints at the text point: its
     * background-color with every background-image layer sampled and composited
     * in paint order (first-listed layer on top).
     */
    const paintAt = (cs: CSSStyleDeclaration, rect: DOMRect, p: Point): RGBA => {
      let result = resolve(cs.backgroundColor) ?? TRANSPARENT;
      const bi = cs.backgroundImage;
      if (!bi || bi === 'none') return result;
      const layers = splitTopLevel(bi, ',').map((s) => s.trim());
      // Composite bottom (last-listed) up to top (first-listed).
      for (let i = layers.length - 1; i >= 0; i--) {
        result = over(sampleLayer(layers[i], rect, p), result);
      }
      return result;
    };

    /** Do two border boxes share any painted area at all? */
    const intersects = (a: DOMRect, b: DOMRect): boolean =>
      Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) > 0 &&
      Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) > 0;

    /** Does `a` sit entirely inside `b`? */
    const contains = (outer: DOMRect, inner: DOMRect): boolean =>
      inner.left >= outer.left - 0.5 &&
      inner.right <= outer.right + 0.5 &&
      inner.top >= outer.top - 0.5 &&
      inner.bottom <= outer.bottom + 0.5;

    /**
     * Style and geometry are memoised per element for one pass.
     *
     * This page renders 512 bit-grid cells plus a text node per crib/component
     * card and every one of them walks the same handful of ancestors. Without
     * the caches the pass re-reads the same computed styles and rects tens of
     * thousands of times. Nothing mutates the DOM during the pass, so the cached
     * values cannot go stale.
     */
    const styleCache = new Map<Element, CSSStyleDeclaration>();

    // Declared by the spliced paint core; see mknontext.py.
    void splitTopLevel;
    void over;
    void fade;
    void luminance;
    void ratio;
    void clamp01;
    void colorAt;
    void parseStops;
    void axisValue;
    void VERT;
    void HORZ;
    void sampleLayer;
    void paintAt;
    void intersects;
    void contains;
    void styleCache;

    /**
     * An element's own painted background AT A POINT — gradients included.
     *
     * The first version of this read `background-color` alone, and that is not
     * what a page paints. `pq-rotation` reports `rgba(0,0,0,0)` for both `html`
     * and `body` because its dark canvas is two radial gradients; the walk
     * therefore found nothing opaque, fell through to WHITE, and reported a
     * bright cyan disclosure triangle at 3.95:1 against a page that is actually
     * near-black. The tell was that the number came out IDENTICAL in both
     * themes — a ratio that cannot depend on the theme is not measuring the
     * theme. This is the same class of mistake as the canvas-background bug in
     * `contrast.ts`, so it borrows that file's gradient-aware sampler wholesale
     * rather than approximating it a second time.
     */
    const ownPaint = (cs: CSSStyleDeclaration, rect: DOMRect, p: Point): RGBA =>
      paintAt(cs, rect, p);

    /** The canvas background, which paints beyond the root's own box. */
    const canvasBackground = ((): RGBA => {
      const rootRect = rectOf(document.documentElement);
      const mid: Point = { x: rootRect.left + rootRect.width / 2, y: rootRect.top + rootRect.height / 2 };
      const rootPaint = ownPaint(styleOf(document.documentElement), rootRect, mid);
      if (rootPaint.a > 0) return rootPaint;
      if (!document.body) return TRANSPARENT;
      const bodyRect = rectOf(document.body);
      return ownPaint(styleOf(document.body), bodyRect, {
        x: bodyRect.left + bodyRect.width / 2,
        y: bodyRect.top + bodyRect.height / 2,
      });
    })();

    /**
     * Composite what is painted behind `el`, starting from `from`.
     *
     * Geometry-aware for the same reason `contrast.ts` is: an ancestor whose
     * border box does not contain the sample point paints nothing there.
     */
    const backdropFrom = (from: Element | null, p: Point): RGBA => {
      let acc: RGBA = TRANSPARENT;
      let node: Element | null = from;
      while (node) {
        const r = rectOf(node);
        const covers = p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
        if (covers) acc = over(acc, ownPaint(styleOf(node), r, p));
        if (acc.a >= 1) break;
        node = node.parentElement;
      }
      return over(over(acc, canvasBackground), WHITE);
    };

    const sel = (el: Element): string => {
      const id = el.id ? `#${el.id}` : '';
      const cls = (el.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean).join('.');
      return `${el.tagName.toLowerCase()}${id}${cls ? '.' + cls : ''}`;
    };

    const failures: NonTextFailure[] = [];

    // ── 1. control boundaries ───────────────────────────────────────────────
    const CONTROL = [
      'button',
      'input:not([type=hidden])',
      'select',
      'textarea',
      '[role=button]',
      '[role=switch]',
      '[role=tab]',
      '[role=checkbox]',
      '[role=radio]',
      '[role=slider]',
      // A LINK STYLED AS A BUTTON is a UI component under 1.4.11 and was being
      // missed entirely: the shared header's Menu and GitHub controls are
      // `<a class="cl-btn">`, and with no `a` in this list nothing ever judged
      // them. Restricted to link-shaped BUTTONS — prose links identify
      // themselves by their text and are not 1.4.11 cases — and anything that
      // slips through still has to pass the "is it trying to draw itself as a
      // control?" test below.
      'a[role=button]',
      'a[class*=btn]',
      'a[class*=button]',
    ].join(',');

    for (const el of Array.from(document.querySelectorAll(CONTROL))) {
      if (!(el as HTMLElement).checkVisibility?.()) continue;
      // WCAG 1.4.11 exempts inactive components.
      if ((el as HTMLInputElement).disabled) continue;
      const r = rectOf(el);
      if (r.width <= 0 || r.height <= 0) continue;
      // Off-screen (the visually-hidden idiom, a parked skip link).
      if (r.right + window.scrollX <= 0 || r.bottom + window.scrollY <= 0) continue;

      const cs = styleOf(el);
      const fillOwn = ownPaint(cs, r, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
      const bw = ['Top', 'Right', 'Bottom', 'Left'].map((s) =>
        parseFloat(cs.getPropertyValue(`border-${s.toLowerCase()}-width`) || '0')
      );
      const hasBorder = bw.some((w) => w > 0) && cs.borderTopStyle !== 'none';
      const outlineW = parseFloat(cs.outlineWidth || '0');
      const hasOutline = outlineW > 0 && cs.outlineStyle !== 'none';

      // Only judge elements that are TRYING to draw themselves as a control.
      // A control identified purely by its text is not a 1.4.11 case.
      if (fillOwn.a <= 0 && !hasBorder && !hasOutline) continue;

      // WCAG 1.4.11 exempts a component "whose appearance is determined by the
      // user agent and not modified by the author". A native checkbox, radio or
      // range still reports a `background-color` and a border to
      // `getComputedStyle` — the UA's own — so without this test the oracle
      // judges the browser's widget and reports 1.06:1 for a control the author
      // never painted. `appearance: auto` is exactly the signal that the author
      // has NOT taken the painting over; `appearance: none` says they have, and
      // then every pixel is theirs to answer for.
      const appearance = cs.appearance || (cs as unknown as { webkitAppearance?: string }).webkitAppearance || 'none';
      const nativeWidget = ['checkbox', 'radio', 'range', 'color', 'file'].includes(
        (el as HTMLInputElement).type ?? ''
      );
      if (appearance !== 'none' && nativeWidget) continue;

      // Sample just outside the element's box, and just inside it.
      const outsideP: Point = { x: r.left - 2, y: r.top + r.height / 2 };
      const insideP: Point = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      const surround = backdropFrom(el.parentElement, outsideP);
      const fill = over(over(fillOwn, backdropFrom(el.parentElement, insideP)), WHITE);

      const fillRatio = ratio(fill, surround);
      let best = fillRatio;
      let how = `fill ${fillRatio.toFixed(2)}:1 vs surround`;

      if (hasBorder) {
        const bc = resolve(cs.borderTopColor) ?? TRANSPARENT;
        // Over the element's OWN FILL, not the surround: `background-clip`
        // defaults to `border-box`, so the background really is painted
        // underneath the border. It matters wherever one translucent edge token
        // delineates several differently-coloured buttons by taking each one's
        // fill as its backdrop — composited over the surround instead, a gold
        // button's `rgba(0,0,0,.55)` edge reads rgb(115,115,115) rather than the
        // rgb(115,97,0) a screenshot of the page actually contains.
        const border = over(over(bc, fill), WHITE);
        const borderRatio = ratio(border, surround);
        if (borderRatio > best) {
          best = borderRatio;
          how = `border ${borderRatio.toFixed(2)}:1 vs surround`;
        }
      }
      if (hasOutline) {
        // An outline paints OUTSIDE the border box, so its backdrop IS the
        // surround — the opposite of the border above.
        const oc = resolve(cs.outlineColor) ?? TRANSPARENT;
        const outline = over(over(oc, surround), WHITE);
        const outlineRatio = ratio(outline, surround);
        if (outlineRatio > best) {
          best = outlineRatio;
          how = `outline ${outlineRatio.toFixed(2)}:1 vs surround`;
        }
      }

      const rounded = Math.round(best * 100) / 100;
      if (rounded < 3) {
        failures.push({
          kind: 'control-boundary',
          selector: sel(el),
          detail:
            `${how} — best delineator of a control that has ` +
            `${fillOwn.a > 0 ? 'a fill' : 'no fill'}${hasBorder ? ' and a border' : ''}` +
            `${hasOutline ? ' and an outline' : ''}`,
          ratio: rounded,
          required: 3,
        });
      }
    }

    // ── 2. generated content ────────────────────────────────────────────────
    const EMPTY = new Set(['none', 'normal', '""', "''", 'counter', 'attr']);
    for (const el of Array.from(document.querySelectorAll(rootSelector))) {
      if (!(el as HTMLElement).checkVisibility?.()) continue;
      const r = rectOf(el);
      if (r.width <= 0 || r.height <= 0) continue;
      if (r.right + window.scrollX <= 0 || r.bottom + window.scrollY <= 0) continue;

      for (const pseudo of ['::before', '::after']) {
        const pcs = styleOf(el, pseudo);
        const content = (pcs.content || 'none').trim();
        if (EMPTY.has(content)) continue;
        // Only a literal string glyph carries ink we can attribute; `url(...)`
        // is an image and `counter(...)`/`attr(...)` still render text but their
        // value is not knowable here — those are reported as text all the same,
        // since the ink is what matters, not the string.
        if (content.startsWith('url(')) continue;

        const ink = resolve(pcs.color);
        if (!ink || ink.a <= 0) continue;
        const pseudoBg = ownPaint(pcs, r, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
        const hostBackdrop = backdropFrom(el, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
        const bg = over(over(pseudoBg, hostBackdrop), WHITE);
        const fg = over(ink, bg);

        const size = parseFloat(pcs.fontSize || '16');
        const weight = parseInt(pcs.fontWeight || '400', 10) || 400;
        const large = size >= 24 || (size >= 18.66 && weight >= 700);
        const required = large ? 3 : 4.5;

        const rr = Math.round(ratio(fg, bg) * 100) / 100;
        if (rr < required) {
          // Is the host absolutely positioned, or the pseudo likely escaping?
          const escaped = pcs.position === 'absolute' || pcs.position === 'fixed';
          failures.push({
            kind: 'generated-content',
            selector: `${sel(el)}${pseudo}`,
            detail:
              `content ${content} at ${size}px/${weight}` +
              (escaped ? ' — POSITIONED, backdrop is the host and may be wrong' : '') +
              (el.closest('[aria-hidden="true"]') ? ' — host is aria-hidden' : ''),
            ratio: rr,
            required,
          });
        }
      }
    }

    return failures;
  }, within);
}

export function formatNonTextFailures(failures: NonTextFailure[]): string[] {
  return failures.map(
    (f) => `${f.ratio}:1 (needs ${f.required}:1) [${f.kind}] ${f.selector} — ${f.detail}`
  );
}
