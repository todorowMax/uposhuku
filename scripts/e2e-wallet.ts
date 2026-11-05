// scripts/e2e-wallet.ts
//
// Наскрізний сценарій оплат з гаманця проти ЛОКАЛЬНОЇ мережі Hardhat (вузол піднімається тут і гаситься в кінці).
// У публічні мережі нічого не розгортається. Контракти беруться зі зібраних артефактів `contracts/artifacts`
// (спершу `cd contracts && npm ci && npx hardhat build`). Токен: MockUSDTStrict (як справжній USDT: події, без значень, що повертаються, approve лише через нуль). Гаманці: коннектор `mock` із wagmi на відкритих тестових
// акаунтах Hardhat (ключі відомі всім, цінності не мають). Запуск: `npm run test:chain`.
// Перевіряє справжній код сайту: lib/crypto/pay-flow.ts, escrow-flow.ts, evm.ts, escrow-chain.ts, wallet-sign.ts.

import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, createWalletClient, defineChain, getAddress, http, type Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat as hardhatDefault } from "viem/chains";
import { createConfig } from "wagmi";
import { connect, signMessage } from "wagmi/actions";
import { mock } from "wagmi/connectors";
import { erc20Abi } from "@/lib/crypto/abi/erc20";
import { approvalSteps } from "@/lib/crypto/approvals";
import type { PublicCryptoConfig } from "@/lib/crypto/config";
import { dealRefOf } from "@/lib/crypto/deal-ref";
import { escrowStageOutcome, readEscrow, verifyEscrowCreated } from "@/lib/crypto/escrow-chain";
import { actOnEscrow, createEscrowDeal } from "@/lib/crypto/escrow-flow";
import { evaluateEvmPayment, EVM_MIN_CONFIRMATIONS, readEvmChain } from "@/lib/crypto/evm";
import { sendDirectPayment } from "@/lib/crypto/pay-flow";
import { buildWalletMessage, isWalletSignatureValid } from "@/lib/crypto/wallet-sign";

const PORT = 8599;
const RPC = `http://127.0.0.1:${PORT}`;
/** Коннектор mock ходить на RPC мережі за замовчуванням: вказуємо наш порт. */
const hardhat = defineChain({ ...hardhatDefault, rpcUrls: { default: { http: [RPC] } } });
/** Відкриті ключі акаунтів Hardhat #0..#3 (документація Hardhat). */
const KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
] as const;
const [deployer, customer, performer, arbiter] = KEYS.map((key) => privateKeyToAccount(key));

const log = (text: string) => console.log(`  ok  ${text}`);
const assert = (condition: unknown, text: string) => {
  if (!condition) throw new Error(`ПРОВАЛ: ${text}`);
  log(text);
};

const rpc = async (method: string, params: unknown[] = []) => {
  const response = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return ((await response.json()) as { result?: unknown }).result;
};
const mine = (blocks: number) => rpc("hardhat_mine", ["0x" + blocks.toString(16)]);
const increaseTime = async (seconds: number) => {
  await rpc("evm_increaseTime", [seconds]);
  await mine(1);
};

const startNode = async (): Promise<ChildProcess> => {
  const node = spawn("npx", ["hardhat", "node", "--port", String(PORT)], { cwd: join(process.cwd(), "contracts"), stdio: "ignore" });
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await rpc("eth_chainId")) === "0x7a69") return node;
    } catch {
      // Вузол ще піднімається.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  node.kill();
  throw new Error("Вузол Hardhat не піднявся");
};

const artifact = (path: string) => JSON.parse(readFileSync(join(process.cwd(), "contracts/artifacts/src", path), "utf8")) as { abi: Abi; bytecode: Hex };

const publicClient = createPublicClient({ chain: hardhat, transport: http(RPC) });
const deployerClient = createWalletClient({ account: deployer, chain: hardhat, transport: http(RPC) });

const deploy = async (path: string, args: unknown[]): Promise<Address> => {
  const { abi, bytecode } = artifact(path);
  const hash = await deployerClient.deployContract({ abi, bytecode, args });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return receipt.contractAddress as Address;
};

const walletFor = async (key: (typeof KEYS)[number]) => {
  const config = createConfig({ chains: [hardhat], connectors: [mock({ accounts: [privateKeyToAccount(key).address] })], transports: { [hardhat.id]: http(RPC) } });
  await connect(config, { connector: config.connectors[0], chainId: hardhat.id });
  return config;
};

const balance = (token: Address, who: Address) => publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [who] }) as Promise<bigint>;
const allowanceOf = (token: Address, owner: Address, spender: Address) => publicClient.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [owner, spender] }) as Promise<bigint>;
const send = async (hash: Hex) => publicClient.waitForTransactionReceipt({ hash });

const run = async () => {
  const usdt = await deploy("mocks/MockUSDTStrict.sol/MockUSDTStrict.json", []);
  const router = await deploy("FeeRouter.sol/FeeRouter.json", [500, deployer.address, [usdt]]);
  const factory = await deploy("EscrowFactory.sol/EscrowFactory.json", [usdt, 500, deployer.address, arbiter.address, 10_000_000_000n, 14n * 86_400n, 50]);
  const mockAbi = artifact("mocks/MockUSDTStrict.sol/MockUSDTStrict.json").abi;
  await send(await deployerClient.writeContract({ address: usdt, abi: mockAbi, functionName: "mint", args: [customer.address, 1_000_000_000n] }));
  log("контракти розгорнуто в локальній мережі, USDT-заглушка видана замовнику");

  const customerWallet = await walletFor(KEYS[1]);
  const performerWallet = await walletFor(KEYS[2]);
  const crypto: PublicCryptoConfig = { chainId: hardhat.id, token: usdt, router: null, factory };
  const acceptedAt = Date.now() - 60_000;

  // 1. Підтвердження адреси підписом.
  const message = buildWalletMessage({ domain: "findlyfy.test", address: performer.address, nonce: "abc", issuedAt: Date.now(), expiresAt: Date.now() + 600_000 });
  const signature = await signMessage(performerWallet, { message });
  assert(await isWalletSignatureValid({ address: performer.address, message, signature }), "підпис гаманця виконавця проходить перевірку сервера");
  assert(!(await isWalletSignatureValid({ address: customer.address, message, signature })), "той самий підпис не підтверджує чужу адресу");

  // 2. Прямий платіж без комісії.
  const ref = dealRefOf("deal_e2e", "deal_e2e-s1");
  const plainHash = await sendDirectPayment({ config: customerWallet, crypto, owner: customer.address, recipient: performer.address, units: 7_000_000n, dealRef: ref });
  await send(plainHash);
  const early = evaluateEvmPayment({ chain: await readEvmChain(plainHash, RPC), expected: { chainId: hardhat.id, token: usdt, router: null, to: performer.address, dealRef: ref, acceptedAt } });
  assert(!early.ok && early.reason === "few_confirmations", "свіжа транзакція ще не має достатньо підтверджень");
  await mine(EVM_MIN_CONFIRMATIONS);
  const plain = evaluateEvmPayment({ chain: await readEvmChain(plainHash, RPC), expected: { chainId: hardhat.id, token: usdt, router: null, to: performer.address, dealRef: ref, acceptedAt } });
  assert(plain.ok && plain.proof.amountUnits === "7000000" && getAddress(plain.proof.from) === customer.address, "прямий переказ без комісії підтверджено сервером за хешем");

  // 3. Платіж через FeeRouter: схвалення рівно на суму з комісією, спершу скидання ненульового.
  const withRouter: PublicCryptoConfig = { ...crypto, router };
  await send(await writeApprove({ config: customerWallet, token: usdt, spender: router, value: 1n }));
  assert(approvalSteps(await allowanceOf(usdt, customer.address, router), 5_250_000n).length === 2, "потрібне схвалення йде в два кроки: нуль, потім сума");
  const feeBefore = await balance(usdt, deployer.address);
  const phases: string[] = [];
  const routedHash = await sendDirectPayment({ config: customerWallet, crypto: withRouter, owner: customer.address, recipient: performer.address, units: 5_000_000n, dealRef: ref, onPhase: (phase) => phases.push(phase) });
  await send(routedHash);
  assert(phases.filter((phase) => phase === "approving").length === 2 && phases.at(-1) === "paying", "перед платежем виконано скидання схвалення й схвалення суми");
  assert((await allowanceOf(usdt, customer.address, router)) === 0n, "після платежу схвалення витрачено повністю: безмежного немає");
  assert((await balance(usdt, deployer.address)) - feeBefore === 250_000n, "комісія 5% дійшла отримувачу комісії");
  await mine(EVM_MIN_CONFIRMATIONS);
  const chain = await readEvmChain(routedHash, RPC);
  const routed = evaluateEvmPayment({ chain, expected: { chainId: hardhat.id, token: usdt, router, to: performer.address, dealRef: ref, acceptedAt } });
  assert(routed.ok && routed.proof.amountUnits === "5000000" && routed.proof.feeUnits === "250000", "платіж через FeeRouter підтверджено: сума й комісія з події");
  const wrongRef = evaluateEvmPayment({ chain, expected: { chainId: hardhat.id, token: usdt, router, to: performer.address, dealRef: dealRefOf("deal_e2e", "інший"), acceptedAt } });
  assert(!wrongRef.ok && wrongRef.reason === "wrong_ref", "той самий платіж не підходить до іншого етапу");
  const bypass = evaluateEvmPayment({ chain: await readEvmChain(plainHash, RPC), expected: { chainId: hardhat.id, token: usdt, router, to: performer.address, dealRef: ref, acceptedAt } });
  assert(!bypass.ok && bypass.reason === "no_router", "переказ повз FeeRouter відхиляється, коли комісія ввімкнена");

  // 4. Ескроу: внесення, здача, приймання.
  const escrowAt = async (name: string) => {
    const dealRef = dealRefOf("deal_e2e", name);
    const deadline = (await publicClient.getBlock()).timestamp + 3n * 86_400n;
    const hash = await createEscrowDeal({ config: customerWallet, crypto, owner: customer.address, deal: { performer: performer.address, amount: 10_000_000n, deliverBy: deadline, reviewPeriod: 86_400n, dealRef } });
    const receipt = await send(hash);
    const created = verifyEscrowCreated(receipt.logs.map((entry) => ({ address: entry.address, topics: entry.topics as string[], data: entry.data })), { factory, client: customer.address, performer: performer.address, amount: 10_000_000n, dealRef });
    if (!created.ok) throw new Error(`ПРОВАЛ: подія створення: ${created.reason}`);
    return created.escrow;
  };
  const wrongParty = verifyEscrowCreated([], { factory, client: customer.address, performer: performer.address, amount: 1n, dealRef: ref });
  assert(!wrongParty.ok && wrongParty.reason === "no_event", "без події створення ескроу не зараховується");

  const paidBefore = await balance(usdt, performer.address);
  const first = await escrowAt("release");
  assert(escrowStageOutcome(await readEscrow(RPC, first)).kind === "funded", "після внесення стан контракту funded");
  assert((await balance(usdt, first)) === 10_500_000n, "заказчик вніс ціну плюс комісію зверху");
  await actOnEscrow({ config: performerWallet, chainId: hardhat.id, escrow: first, action: "deliver" });
  assert(escrowStageOutcome(await readEscrow(RPC, first)).kind === "delivered", "виконавець здав: стан delivered");
  await actOnEscrow({ config: customerWallet, chainId: hardhat.id, escrow: first, action: "release" });
  const released = escrowStageOutcome(await readEscrow(RPC, first));
  assert(released.kind === "released" && released.paid === 10_000_000n, "замовник прийняв: стан released, виконавцю виплачена повна ціна");
  assert((await balance(usdt, performer.address)) - paidBefore === 10_000_000n, "гроші на гаманці виконавця");

  // 5. Ескроу: завершення за таймером без здачі (повернення), спір.
  const second = await escrowAt("refund");
  const customerBefore = await balance(usdt, customer.address);
  await increaseTime(4 * 86_400);
  await actOnEscrow({ config: customerWallet, chainId: hardhat.id, escrow: second, action: "settle" });
  assert(escrowStageOutcome(await readEscrow(RPC, second)).kind === "refunded" && (await balance(usdt, customer.address)) - customerBefore === 10_500_000n, "без здачі після строку заказчик повертає внесене повністю");
  const third = await escrowAt("dispute");
  await actOnEscrow({ config: performerWallet, chainId: hardhat.id, escrow: third, action: "dispute" });
  assert(escrowStageOutcome(await readEscrow(RPC, third)).kind === "disputed", "спір: стан disputed, таймери не діють");
  console.log("Усе пройшло.");
};

const writeApprove = async ({ config, token, spender, value }: { config: Awaited<ReturnType<typeof walletFor>>; token: Address; spender: Address; value: bigint }) => {
  const { writeContract } = await import("wagmi/actions");
  return writeContract(config, { chainId: hardhat.id, abi: erc20Abi, address: token, functionName: "approve", args: [spender, value] });
};

const main = async () => {
  const node = await startNode();
  try {
    await run();
  } finally {
    node.kill();
  }
};

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
