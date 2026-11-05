// Розгортає FeeRouter і EscrowFactory. Параметри лише з оточення, ключів у скрипті немає.
//
//   TOKEN_ADDRESS     адреса USDT у цій мережі (звірити зі сторінкою Tether; пам'яті не вірити)
//   FEE_RECIPIENT     отримувач комісії
//   ARBITER           адреса арбітра (мультипідпис Safe)
//   FEE_BPS           ставка в базисних пунктах, не більше 1000
//   MAX_AMOUNT        ліміт ціни однієї угоди в найменших одиницях токена
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
const feeBps = Number(env("FEE_BPS", local ? "700" : undefined));
const maxAmount = BigInt(env("MAX_AMOUNT", local ? "30000000000" : undefined));
const disputeTimeout = BigInt(env("DISPUTE_TIMEOUT", local ? String(30 * 86_400) : undefined));
const fallbackPct = Number(env("FALLBACK_PCT", local ? "50" : undefined));

const router = await ethers.deployContract("FeeRouter", [feeBps, feeRecipient, [token]]);
const factory = await ethers.deployContract("EscrowFactory", [token, feeBps, feeRecipient, arbiter, maxAmount, disputeTimeout, fallbackPct]);

console.log(
  JSON.stringify(
    {
      deployer: first.address,
      token,
      feeRouter: await router.getAddress(),
      escrowFactory: await factory.getAddress(),
      escrowImplementation: await factory.IMPLEMENTATION(),
    },
    null,
    2,
  ),
);
