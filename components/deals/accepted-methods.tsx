// components/deals/accepted-methods.tsx
//
// Рядок у формі умов прямого переказу: якими способами виконавець приймає оплату. Лише назви, без значень.
// Жодного способу: угода можлива, сторони домовляються в чаті.

import { METHOD_LABEL, type PaymentMethod } from "@/lib/deals/requisites";

export const AcceptedMethods = ({ methods }: { methods: PaymentMethod[] | undefined }) => {
  if (!methods) return null;
  return (
    <p className="pe-hint" role="status">
      {methods.length > 0
        ? `Виконавець приймає: ${methods.map((method) => METHOD_LABEL[method]).join(", ")}.`
        : "Виконавець ще не вказав способи оплати. Угоду можна виставити, а спосіб оплати домовтеся з ним у чаті."}
    </p>
  );
};
