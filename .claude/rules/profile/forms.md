---
paths: ["**/*.tsx", "**/validation/**/*.ts"]
trigger: building or editing a form, a field or a validation schema
---
# Forms

- FORM-1. Every form uses React Hook Form + Yup through the controlled wrappers, with no exceptions: a chat composer or search field is a form too, and a native input never sits in a form (checkout and login emails go through the wrapper). Why: one stack gives every field the same errors, labels and submit behaviour; Demo had React Hook Form in 2 of 7 forms. Check: review. Example: Demo/DemoWorkSpace/components/controlled/InputControl.tsx
- FORM-2. Error, hint and label styles in the wrappers use tokens (`--danger`), not the Tailwind palette; fixing the wrapper fixes every form. Why: all 7 Demo wrappers painted errors `text-red-600`. Check: ESLint `no-restricted-syntax` (palette regex).
- FORM-3. Yup schemas live in `validation/`, one file per form, with no inline schemas in components; types come from `yup.InferType`. Why: inline schemas get duplicated and drift from the types. Check: ESLint `no-restricted-imports` on `yup` outside `validation/**` and tests (type-only imports allowed): error for new code, warning for legacy under the ratchet (RULES-3); one file per form is review.
- FORM-4. Labels are visible, errors sit next to their field, and submit is disabled or loading while submitting. Why: users miss errors far from the field and double-submit. Check: ESLint `jsx-a11y` rules (eslint-plugin-jsx-a11y through the shared config), review.
- FORM-5. The server validates with the same Yup schema imported from `validation/`; client validation is only convenience. Why: any direct request bypasses client checks, and two schemas drift. Check: review.
