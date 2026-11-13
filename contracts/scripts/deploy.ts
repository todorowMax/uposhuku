// Розгортає FeeRouter і EscrowFactory. Параметри лише з оточення, ключів у скрипті немає.
//
//   TOKEN_ADDRESS     адреса USDT у цій мережі (звірити зі сторінкою Tether; пам'яті не вірити)
//   FEE_RECIPIENT     отримувач комісії
//   ARBITER           адреса арбітра (мультипідпис Safe)
//   FEE_BPS           ставка комісії в базисних пунктах, не більше 1000. За замовчуванням 0 (комісії немає): рішення про комісію
//                     й отримувача ухвалює власник з бухгалтером (docs/tasks/2026-11-13-legal-hardening/risk-register.md, ризик 7).
//                     Ненульова ставка задається лише явно, скрипт попередить у виводі.
//   MAX_AMOUNT        ліміт ціни однієї угоди в найменших одиницях токена (USDT: 6 знаків)
//                     приклад dev:  MAX_AMOUNT=1000000000    (1000 USDT, узгоджено з CRYPTO_MAX_DEAL_USDT dev)
//                     приклад prod: MAX_AMOUNT=50000000000   (50 000 USDT; сервер пускає 10 000, див. wrangler.jsonc)
//   DISPUTE_TIMEOUT   секунд до запасного виходу зі спору (від 14 до 365 діб)
//   FALLBACK_PCT      частка виконавця при запасному виході, кратна 5
//
// Без жодного значення скрипт працює лише в локальній мережі Hardhat: розгортає тестовий токен і бере адреси акаунтів.
// Приклад: npx hardhat run scripts/deploy.ts
import { network } from "hardhat";

const connection = await network.create();
const { ethers } = connection;
const local = connection.networkConfig.type === "edr-simulated";

const env = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") throw new Error(`Не задано ${name}`);
  return value;
};

const [first, second, third] = await ethers.getSigners();

let token = process.env.TOKEN_ADDRESS;
if (!token) {
  if (!local) throw new Error("Не задано TOKEN_ADDRESS: у справжній мережі токен-заглушку не розгортаємо");
  token = await (await ethers.deployContract("MockUSDT")).getAddress();
}

const feeRecipient = env("FEE_RECIPIENT", local ? second.address : undefined);
const arbiter = env("ARBITER", local ? third.address : undefined);
const feeBps = Number(env("FEE_BPS", "0"));
const maxAmount = BigInt(env("MAX_AMOUNT", local ? "30000000000" : undefined));
const disputeTimeout = BigInt(env("DISPUTE_TIMEOUT", local ? String(30 * 86_400) : undefined));
const fallbackPct = Number(env("FALLBACK_PCT", local ? "50" : undefined));

if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 1000) throw new Error("FEE_BPS: ціле число від 0 до 1000");
if (feeBps > 0) {
  console.warn(`УВАГА: комісія ${feeBps / 100}% (${feeBps} б.п.) зашивається в контракти й незмінна. Це дохід у USDT: переконайтеся, що рішення про комісію й отримувача ухвалено.`);
}

const router = await ethers.deployContract("FeeRouter", [feeBps, feeRecipient, [token]]);
const factory = await ethers.deployContract("EscrowFactory", [token, feeBps, feeRecipient, arbiter, maxAmount, disputeTimeout, fallbackPct]);

console.log(
  JSON.stringify(
    {
      deployer: first.address,
      feeBps,
      token,
      feeRouter: await router.getAddress(),
      escrowFactory: await factory.getAddress(),
      escrowImplementation: await factory.IMPLEMENTATION(),
    },
    null,
    2,
  ),
);
