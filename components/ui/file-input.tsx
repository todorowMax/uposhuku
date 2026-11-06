// components/ui/file-input.tsx
//
// Прихований вибір файлу за кнопкою (DS-2 це дозволяє): кнопка викликає `ref.current.click()`, сам елемент
// не видно й у порядок Tab він не потрапляє. Єдине місце в застосунку для такого поля у фічах.

import type * as React from "react";

export const FileInput = (props: Omit<React.ComponentProps<"input">, "type" | "hidden">) => <input type="file" data-slot="file-input" hidden {...props} />;
