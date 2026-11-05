import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

const FEE_BPS = 700n;
const REF = ethers.id("deal-1");
const U = (n: number) => BigInt(n) * 1_000_000n; // 6 знаків, як у USDT

// Детермінований генератор для фаззингу: тест відтворюється з тим самим результатом.
const lcg = (seed: bigint) => () => {
  seed = (seed * 6364136223846793005n + 1442695040888963407n) % 2n ** 64n;
  return seed;
};

async function deploy() {
  const [deployer, payer, recipient, feeRecipient, stranger] = await ethers.getSigners();
  const usdt = await ethers.deployContract("MockUSDT");
  const erc20 = await ethers.deployContract("MockERC20");
  const router = await ethers.deployContract("FeeRouter", [
    FEE_BPS,
    feeRecipient.address,
    [await usdt.getAddress(), await erc20.getAddress()],
  ]);
  await usdt.mint(payer.address, U(1_000_000));
  await erc20.mint(payer.address, U(1_000_000));
  return { deployer, payer, recipient, feeRecipient, stranger, usdt, erc20, router, routerAddress: await router.getAddress() };
}

async function approveTotal(f: Awaited<ReturnType<typeof deploy>>, token: "usdt" | "erc20", amount: bigint) {
  const fee = await f.router.quoteFee(amount);
  await f[token].connect(f.payer).approve(f.routerAddress, amount + fee);
  return fee;
}

describe("FeeRouter", () => {
  describe("конструктор", () => {
    it("стеля ставки: 10 % проходить, 10,01 % ні", async () => {
      const [, fr] = await ethers.getSigners();
      const usdt = await ethers.deployContract("MockUSDT");
      await ethers.deployContract("FeeRouter", [1000, fr.address, [await usdt.getAddress()]]);
      await expect(ethers.deployContract("FeeRouter", [1001, fr.address, [await usdt.getAddress()]])).to.be.revertedWithCustomError(
        await ethers.getContractFactory("FeeRouter"),
        "FeeTooHigh",
      );
    });

    it("нульові адреси відхиляються", async () => {
      const [, fr] = await ethers.getSigners();
      const factory = await ethers.getContractFactory("FeeRouter");
      await expect(ethers.deployContract("FeeRouter", [700, ethers.ZeroAddress, []])).to.be.revertedWithCustomError(factory, "ZeroAddress");
      await expect(ethers.deployContract("FeeRouter", [700, fr.address, [ethers.ZeroAddress]])).to.be.revertedWithCustomError(
        factory,
        "ZeroAddress",
      );
    });

    it("немає жодної функції зміни стану, окрім pay: ні власника, ні сеттерів, ні виводу", async () => {
      const { router } = await networkHelpers.loadFixture(deploy);
      const writes = router.interface.fragments
        .filter((x) => x.type === "function")
        .map((x) => x as import("ethers").FunctionFragment)
        .filter((x) => !x.constant)
        .map((x) => x.name);
      expect(writes).to.deep.equal(["pay"]);
    });
  });

  for (const kind of ["usdt", "erc20"] as const) {
    describe(`платіж токеном ${kind === "usdt" ? "без значення, що повертається (як USDT)" : "зі стандартним ERC-20"}`, () => {
      it("виконавець отримує рівно amount, комісія зверху йде отримувачу, в роутері нуль", async () => {
        const f = await networkHelpers.loadFixture(deploy);
        const token = f[kind];
        const amount = U(100);
        const fee = await approveTotal(f, kind, amount);
        expect(fee).to.equal(U(7));
        await expect(f.router.connect(f.payer).pay(await token.getAddress(), f.recipient.address, amount, REF))
          .to.emit(f.router, "Paid")
          .withArgs(REF, f.payer.address, f.recipient.address, await token.getAddress(), amount, fee);
        expect(await token.balanceOf(f.recipient.address)).to.equal(amount);
        expect(await token.balanceOf(f.feeRecipient.address)).to.equal(fee);
        expect(await token.balanceOf(f.routerAddress)).to.equal(0n);
        expect(await token.balanceOf(f.payer.address)).to.equal(U(1_000_000) - amount - fee);
      });

      it("заблокований виконавець: платіж відкочується, гроші платника на місці", async () => {
        const f = await networkHelpers.loadFixture(deploy);
        const token = f[kind];
        await token.setBlocked(f.recipient.address, true);
        await approveTotal(f, kind, U(100));
        await expect(f.router.connect(f.payer).pay(await token.getAddress(), f.recipient.address, U(100), REF)).to.revert(ethers);
        expect(await token.balanceOf(f.payer.address)).to.equal(U(1_000_000));
        expect(await token.balanceOf(f.feeRecipient.address)).to.equal(0n);
      });

      it("заблокований отримувач комісії не блокує виплату: виконавець отримує, платник комісію не платить", async () => {
        const f = await networkHelpers.loadFixture(deploy);
        const token = f[kind];
        await token.setBlocked(f.feeRecipient.address, true);
        const amount = U(100);
        const fee = await approveTotal(f, kind, amount);
        await expect(f.router.connect(f.payer).pay(await token.getAddress(), f.recipient.address, amount, REF))
          .to.emit(f.router, "FeeSkipped")
          .withArgs(REF, fee)
          .and.to.emit(f.router, "Paid")
          .withArgs(REF, f.payer.address, f.recipient.address, await token.getAddress(), amount, 0n);
        expect(await token.balanceOf(f.recipient.address)).to.equal(amount);
        expect(await token.balanceOf(f.payer.address)).to.equal(U(1_000_000) - amount);
        expect(await token.balanceOf(f.routerAddress)).to.equal(0n);
      });
    });
  }

  describe("перевірки входу", () => {
    it("токен не з білого списку", async () => {
      const f = await networkHelpers.loadFixture(deploy);
      const other = await ethers.deployContract("MockUSDT");
      await expect(f.router.connect(f.payer).pay(await other.getAddress(), f.recipient.address, 1n, REF)).to.be.revertedWithCustomError(
        f.router,
        "TokenNotAllowed",
      );
    });

    it("отримувач: нуль і сам роутер відхиляються (інакше гроші застрягли б)", async () => {
      const f = await networkHelpers.loadFixture(deploy);
      const token = await f.usdt.getAddress();
      await approveTotal(f, "usdt", U(10));
      await expect(f.router.connect(f.payer).pay(token, ethers.ZeroAddress, U(10), REF)).to.be.revertedWithCustomError(f.router, "InvalidRecipient");
      await expect(f.router.connect(f.payer).pay(token, f.routerAddress, U(10), REF)).to.be.revertedWithCustomError(f.router, "InvalidRecipient");
    });

    it("нульова сума", async () => {
      const f = await networkHelpers.loadFixture(deploy);
      await expect(f.router.connect(f.payer).pay(await f.usdt.getAddress(), f.recipient.address, 0n, REF)).to.be.revertedWithCustomError(
        f.router,
        "ZeroAmount",
      );
    });

    it("дозвіл лише на amount (без комісії) відхиляється: комісію не обійти", async () => {
      const f = await networkHelpers.loadFixture(deploy);
      await f.usdt.connect(f.payer).approve(f.routerAddress, U(100));
      await expect(f.router.connect(f.payer).pay(await f.usdt.getAddress(), f.recipient.address, U(100), REF)).to.be.revertedWithCustomError(
        f.router,
        "InsufficientAllowanceOrBalance",
      );
    });

    it("балансу вистачає лише на amount, але не на комісію: відхиляється", async () => {
      const f = await networkHelpers.loadFixture(deploy);
      const poor = f.stranger;
      await f.usdt.mint(poor.address, U(100));
      await f.usdt.connect(poor).approve(f.routerAddress, U(1000));
      await expect(f.router.connect(poor).pay(await f.usdt.getAddress(), f.recipient.address, U(100), REF)).to.be.revertedWithCustomError(
        f.router,
        "InsufficientAllowanceOrBalance",
      );
    });

    it("чужий не може списати гроші платника без його дозволу", async () => {
      const f = await networkHelpers.loadFixture(deploy);
      await approveTotal(f, "usdt", U(100));
      // stranger не має ні балансу, ні дозволу: платить сам за себе, а не за payer
      await expect(f.router.connect(f.stranger).pay(await f.usdt.getAddress(), f.recipient.address, U(100), REF)).to.be.revertedWithCustomError(
        f.router,
        "InsufficientAllowanceOrBalance",
      );
      expect(await f.usdt.balanceOf(f.payer.address)).to.equal(U(1_000_000));
    });
  });

  describe("округлення комісії", () => {
    it("мінімальна сума: комісія не нуль, а округлена вгору", async () => {
      const f = await networkHelpers.loadFixture(deploy);
      expect(await f.router.quoteFee(1n)).to.equal(1n);
      expect(await f.router.quoteFee(14n)).to.equal(1n); // 0,98 -> 1
      expect(await f.router.quoteFee(15n)).to.equal(2n); // 1,05 -> 2
      const fee = await approveTotal(f, "usdt", 1n);
      await f.router.connect(f.payer).pay(await f.usdt.getAddress(), f.recipient.address, 1n, REF);
      expect(await f.usdt.balanceOf(f.feeRecipient.address)).to.equal(fee);
      expect(fee).to.equal(1n);
    });

    it("нульова ставка дає нульову комісію й платіж без переказу комісії", async () => {
      const [, payer, recipient, fr] = await ethers.getSigners();
      const usdt = await ethers.deployContract("MockUSDT");
      const router = await ethers.deployContract("FeeRouter", [0, fr.address, [await usdt.getAddress()]]);
      await usdt.mint(payer.address, U(10));
      await usdt.connect(payer).approve(await router.getAddress(), U(10));
      await router.connect(payer).pay(await usdt.getAddress(), recipient.address, U(10), REF);
      expect(await usdt.balanceOf(fr.address)).to.equal(0n);
    });

    it("фаззинг: на межах округлення комісія = ceil(amount * bps / 10000), сума переказів = списана, роутер порожній", async () => {
      const f = await networkHelpers.loadFixture(deploy);
      const next = lcg(42n);
      const edges = [1n, 2n, 13n, 14n, 15n, 142n, 143n, 144n, 9_999n, 10_000n, 10_001n, 1_000_000n, 2n ** 60n];
      const amounts = [...edges, ...Array.from({ length: 60 }, () => (next() % 1_000_000_000_000n) + 1n)];
      await f.usdt.mint(f.payer.address, 2n ** 70n);
      let spent = 0n;
      for (const amount of amounts) {
        const fee = await f.router.quoteFee(amount);
        const exact = amount * FEE_BPS;
        expect(fee * 10_000n).to.be.gte(exact);
        expect(fee * 10_000n).to.be.lt(exact + 10_000n);
        await f.usdt.connect(f.payer).approve(f.routerAddress, amount + fee);
        const before = await f.usdt.balanceOf(f.recipient.address);
        await f.router.connect(f.payer).pay(await f.usdt.getAddress(), f.recipient.address, amount, REF);
        expect((await f.usdt.balanceOf(f.recipient.address)) - before).to.equal(amount);
        spent += amount + fee;
        expect(await f.usdt.balanceOf(f.routerAddress)).to.equal(0n);
      }
      expect(await f.usdt.balanceOf(f.recipient.address)).to.equal(amounts.reduce((a, b) => a + b, 0n));
      expect(await f.usdt.balanceOf(f.feeRecipient.address)).to.equal(spent - amounts.reduce((a, b) => a + b, 0n));
    });
  });

  describe("повторний вхід", () => {
    it("токен-хук, що під час переказу знову викликає pay, отримує ReentrancyGuardReentrantCall", async () => {
      const f = await networkHelpers.loadFixture(deploy);
      await approveTotal(f, "erc20", U(100));
      const inner = f.router.interface.encodeFunctionData("pay", [await f.erc20.getAddress(), f.recipient.address, U(1), REF]);
      await f.erc20.setHook(f.routerAddress, inner);
      await f.router.connect(f.payer).pay(await f.erc20.getAddress(), f.recipient.address, U(100), REF);
      expect(await f.erc20.hookSuccess()).to.equal(false);
      expect(await f.erc20.hookResult()).to.equal(f.router.interface.getError("ReentrancyGuardReentrantCall")!.selector);
      expect(await f.erc20.balanceOf(f.recipient.address)).to.equal(U(100)); // лише зовнішній платіж
    });
  });
});
