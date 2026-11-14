#!/usr/bin/env bash
# scripts/monobank-secrets.sh
#
# Кладе ключі Monobank у секрети воркера. Значення вводиться в прихованому запиті wrangler і ніде не друкується:
# не в чат, не в git, не в історію shell.
#
#   bash scripts/monobank-secrets.sh production      # прод (findlyfy.com)
#   bash scripts/monobank-secrets.sh development     # dev (dev.findlyfy.com)
#
# Які секрети:
#   MONOBANK_TOKEN                 звичайний термінал: оплата комісії за фактом і розміщення на карті
#   MONOBANK_SPLIT_TOKEN           термінал розщеплення: безпечна угода (коли банк увімкне розщеплення)
#   MONOBANK_PLATFORM_RECEIVER_ID  id отримувача-платформи в розщепленні (з кабінету, разом зі split-терміналом)
#
# Кожен можна пропустити: Enter на питання «Оновити?» без «y» лишає секрет як є.

set -euo pipefail

ENV_NAME="${1:-}"
if [[ "$ENV_NAME" != "production" && "$ENV_NAME" != "development" ]]; then
  echo "Вкажіть середовище: production або development." >&2
  echo "Приклад: bash scripts/monobank-secrets.sh production" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

if [[ "$ENV_NAME" == "production" ]]; then
  read -r -p "Це ПРОД (findlyfy.com). Продовжити? [y/N] " sure
  [[ "$sure" == "y" || "$sure" == "Y" ]] || { echo "Скасовано."; exit 0; }
fi

ask_and_put() {
  local name="$1" hint="$2" answer
  echo
  echo "$name — $hint"
  read -r -p "Оновити $name на $ENV_NAME? [y/N] " answer
  if [[ "$answer" == "y" || "$answer" == "Y" ]]; then
    # wrangler сам питає значення з прихованим вводом.
    npx wrangler secret put "$name" --env "$ENV_NAME"
  else
    echo "Пропущено."
  fi
}

ask_and_put MONOBANK_TOKEN "звичайний термінал Findlyfy (комісія за фактом, розміщення)"
ask_and_put MONOBANK_SPLIT_TOKEN "термінал розщеплення (безпечна угода)"
ask_and_put MONOBANK_PLATFORM_RECEIVER_ID "id отримувача-платформи в розщепленні"

echo
echo "Секрети Monobank на $ENV_NAME зараз (лише назви):"
npx wrangler secret list --env "$ENV_NAME" | grep -o '"MONOBANK[A-Z_]*"' || echo "(жодного)"
echo
echo "Готово. Секрет діє одразу, окремий деплой не потрібен."
