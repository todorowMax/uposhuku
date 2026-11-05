import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { defineConfig } from "hardhat/config";

// Мережі для розгортання тут навмисно не описані: адреси й RPC передаються через оточення,
// а розгортання в будь-яку мережу, окрім локальної Hardhat, робить власник (див. README).
export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  paths: { sources: "./src" },
  solidity: {
    version: "0.8.34",
    settings: {
      evmVersion: "shanghai",
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: { type: "edr-simulated", chainType: "l1" },
  },
});
