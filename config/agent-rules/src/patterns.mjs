// agent-rules lint 1.0.0: vendored copy, do not edit; update with agent-rules/scripts/sync.mjs --apply
// Regex sources used inside esquery selectors. esquery regexes cannot contain "/", hence \x2F.

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";

// TW-3: a utility with an arbitrary value (`text-[15px]`, `rounded-[22px]`) ends the class token,
// optionally followed by `!` or an opacity (`/50`). Variant selectors (`data-[state=open]:`,
// `has-[>svg]:`, `group-data-[x=y]/tabs:`) are followed by ":" or a group name and stay allowed.
export const ARBITRARY_VALUE = String.raw`-\[[^\]\s]+\](?=\s|$|!|\x2F[0-9]+(\s|$|!))`;

// TW-3: an arbitrary property (`[mask-type:luminance]`) is a whole class token in brackets.
export const ARBITRARY_PROPERTY = String.raw`(^|\s)([a-z-]+:)*\[[a-z-]+:[^\]\s]+\](?=\s|$)`;

// CSS-2, FORM-2: the Tailwind colour palette (`text-slate-500`, `bg-red-600/50`) instead of tokens.
export const TAILWIND_PALETTE = String.raw`(^|\s)([a-z-]+:)*(text|bg|border|ring|fill|stroke|from|via|to|outline|decoration|divide|accent|caret|placeholder|shadow)-(${PALETTE})-[0-9]{2,3}(\x2F[0-9]+)?(\s|$)`;

// MOT-2: a hand-written easing curve in a string (inline style, class name, arbitrary value).
export const CUBIC_BEZIER = String.raw`cubic-bezier\(`;

// MOT-1: a Tailwind transition list that names width, height, top or left (`transition-[width]`,
// `md:transition-[opacity,height]`). Whole words only, so `border-left-color` passes.
export const LAYOUT_TRANSITION = String.raw`(^|\s)([a-z-]+:)*transition-\[([^\]\s]*[,_])?((min-|max-)?(width|height)|top|left)([,_][^\]\s]*)?\]`;
