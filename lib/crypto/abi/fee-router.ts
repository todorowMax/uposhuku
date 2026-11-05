// Згенеровано contracts/scripts/export-abi.ts з FeeRouter.sol. Не редагувати вручну: змінюйте контракт і запускайте скрипт.

export const feeRouterAbi = [
  {"inputs":[{"name":"feeBps","type":"uint16"},{"name":"feeRecipient","type":"address"},{"name":"tokens","type":"address[]"}],"stateMutability":"nonpayable","type":"constructor"},
  {"inputs":[],"name":"FeeTooHigh","type":"error"},
  {"inputs":[],"name":"InsufficientAllowanceOrBalance","type":"error"},
  {"inputs":[],"name":"InvalidRecipient","type":"error"},
  {"inputs":[],"name":"ReentrancyGuardReentrantCall","type":"error"},
  {"inputs":[{"name":"token","type":"address"}],"name":"SafeERC20FailedOperation","type":"error"},
  {"inputs":[],"name":"TokenNotAllowed","type":"error"},
  {"inputs":[],"name":"ZeroAddress","type":"error"},
  {"inputs":[],"name":"ZeroAmount","type":"error"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"dealRef","type":"bytes32"},{"indexed":false,"name":"fee","type":"uint256"}],"name":"FeeSkipped","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"dealRef","type":"bytes32"},{"indexed":true,"name":"payer","type":"address"},{"indexed":true,"name":"recipient","type":"address"},{"indexed":false,"name":"token","type":"address"},{"indexed":false,"name":"amount","type":"uint256"},{"indexed":false,"name":"fee","type":"uint256"}],"name":"Paid","type":"event"},
  {"inputs":[],"name":"FEE_BPS","outputs":[{"name":"","type":"uint16"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"FEE_RECIPIENT","outputs":[{"name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"MAX_FEE_BPS","outputs":[{"name":"","type":"uint16"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"name":"token","type":"address"}],"name":"isTokenAllowed","outputs":[{"name":"allowed","type":"bool"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"name":"token","type":"address"},{"name":"recipient","type":"address"},{"name":"amount","type":"uint256"},{"name":"dealRef","type":"bytes32"}],"name":"pay","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"name":"amount","type":"uint256"}],"name":"quoteFee","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
] as const;
