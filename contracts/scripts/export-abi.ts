// Записує ABI контрактів у ../lib/crypto/abi як `as const` для viem/wagmi.
// Запуск після збірки: npx hardhat build && npx hardhat run scripts/export-abi.ts
import { readFile, writeFile } from "node:fs/promises";

const OUT = new URL("../../lib/crypto/abi/", import.meta.url);
const SOURCES = [
  { contract: "FeeRouter", file: "fee-router", name: "feeRouterAbi" },
  { contract: "EscrowFactory", file: "escrow-factory", name: "escrowFactoryAbi" },
  { contract: "DealEscrow", file: "deal-escrow", name: "dealEscrowAbi" },
] as const;

const header = (contract: string) =>
  `// Згенеровано contracts/scripts/export-abi.ts з ${contract}.sol. Не редагувати вручну: змінюйте контракт і запускайте скрипт.\n\n`;

for (const { contract, file, name } of SOURCES) {
  const artifact = JSON.parse(await readFile(new URL(`../artifacts/src/${contract}.sol/${contract}.json`, import.meta.url), "utf8"));
  // Один запис ABI в одному рядку: файл лишається коротким (ліміт max-lines).
  const items = artifact.abi.map((item: unknown) => `  ${JSON.stringify(item, (key, value) => (key === "internalType" ? undefined : value))},`);
  const text = `[\n${items.join("\n")}\n]`;
  await writeFile(new URL(`${file}.ts`, OUT), `${header(contract)}export const ${name} = ${text} as const;\n`);
}
