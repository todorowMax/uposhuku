// Підпис автора відгуку: перше слово імені з профілю, інакше «Замовник». Частину адреси пошти в підпис не беремо.
export const reviewAuthor = (name: string | null | undefined): string => (name?.trim().split(/\s+/)[0] || "Замовник").slice(0, 30);
