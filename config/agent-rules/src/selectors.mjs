// agent-rules lint 1.0.0: vendored copy, do not edit; update with agent-rules/scripts/sync.mjs --apply
// no-restricted-syntax selector groups. Rule IDs in the messages refer to agent-rules/rules.
import { ARBITRARY_PROPERTY, ARBITRARY_VALUE, CUBIC_BEZIER, LAYOUT_TRANSITION, TAILWIND_PALETTE } from "./patterns.mjs";

const ARBITRARY_MESSAGE =
  "TW-3, CSS-10: no arbitrary values. Use a theme token, or add one to @theme / @utility in the token CSS.";

export const nativeControls = [
  { selector: "JSXOpeningElement[name.name='button']", message: "DS-2: use <Button> from components/ui." },
  {
    selector: "JSXOpeningElement[name.name=/^(input|select|textarea)$/]",
    message: "DS-2: use the primitive from components/ui (Input, Select, Textarea).",
  },
  {
    selector: "JSXAttribute[name.name='role'][value.value='dialog']",
    message: "DS-5: use the shared Dialog or Drawer primitive (focus trap, Escape and scroll lock come with it).",
  },
];

export const inlineStyle = [
  {
    selector: "JSXAttribute[name.name='style'] > JSXExpressionContainer > ObjectExpression > Property[value.type='Literal']",
    message: "CSS-4: a static inline style belongs in a class or @utility. Inline style is for runtime values only.",
  },
];

export const tailwindClasses = [
  {
    selector: `Literal[value=/${TAILWIND_PALETTE}/]`,
    message: "CSS-2, FORM-2: use token classes (text-foreground, bg-surface, text-danger ...), not the Tailwind palette.",
  },
  {
    selector: `TemplateElement[value.raw=/${TAILWIND_PALETTE}/]`,
    message: "CSS-2, FORM-2: use token classes (text-foreground, bg-surface, text-danger ...), not the Tailwind palette.",
  },
  { selector: `Literal[value=/${ARBITRARY_VALUE}/]`, message: ARBITRARY_MESSAGE },
  { selector: `TemplateElement[value.raw=/${ARBITRARY_VALUE}/]`, message: ARBITRARY_MESSAGE },
  { selector: `Literal[value=/${ARBITRARY_PROPERTY}/]`, message: ARBITRARY_MESSAGE },
  { selector: `TemplateElement[value.raw=/${ARBITRARY_PROPERTY}/]`, message: ARBITRARY_MESSAGE },
];

// ARCH-5: presentational components do not call fetch; a use-*.ts hook does, through lib/.
export const fetchInComponents = [
  {
    selector: "CallExpression[callee.name='fetch']",
    message: "ARCH-5: call data access from a use-*.ts hook (through lib/), not from a component.",
  },
];

// ARCH-9: composition over inheritance. Custom Error subclasses (any name ending in Error) and the
// Cloudflare base classes the platform requires are excepted.
const ALLOWED_BASES = String.raw`Error$|^(WorkflowEntrypoint|DurableObject|WorkerEntrypoint|RpcTarget)$`;
export const classInheritance = [
  {
    selector: `ClassDeclaration[superClass]:not([superClass.name=/${ALLOWED_BASES}/])`,
    message: "ARCH-9: compose with children, slots and hooks instead of inheritance (only Error subclasses and Cloudflare entrypoint classes may extend).",
  },
];

// TEST-1: e2e tests locate by role, label or test id, never by CSS class or id.
export const e2eLocators = [
  {
    selector: "CallExpression[callee.property.name='locator'] > Literal[value=/^\\s*([.#]|\\[class)/]",
    message: "TEST-1: use getByRole, getByLabel or getByTestId, not a CSS class or id.",
  },
];

// MOT-2, MOT-1: easing curves are tokens; transitions stay on transform and opacity.
const BEZIER_MESSAGE = "MOT-2: no hand-written cubic-bezier(); use an easing token (--ease-out) or add one to the token CSS.";
const LAYOUT_MESSAGE = "MOT-1: do not transition width, height, top or left; animate transform and opacity.";
export const motionTokens = [
  { selector: `Literal[value=/${CUBIC_BEZIER}/]`, message: BEZIER_MESSAGE },
  { selector: `TemplateElement[value.raw=/${CUBIC_BEZIER}/]`, message: BEZIER_MESSAGE },
  { selector: `Literal[value=/${LAYOUT_TRANSITION}/]`, message: LAYOUT_MESSAGE },
  { selector: `TemplateElement[value.raw=/${LAYOUT_TRANSITION}/]`, message: LAYOUT_MESSAGE },
];

export const presentational = [...inlineStyle, ...tailwindClasses, ...motionTokens];
