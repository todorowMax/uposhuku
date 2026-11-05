import { expect } from "chai";
import { network } from "hardhat";
import type { FunctionFragment } from "ethers";

const { ethers, networkHelpers } = await network.create();
const { time } = networkHelpers;

const FEE_BPS = 700n;
const DAY = 86_400;
const REVIEW = 3 * DAY;
const WINDOW = 7 * DAY;
const DISPUTE_TIMEOUT = 30 * DAY;
const FALLBACK_PCT = 50;
const MAX_AMOUNT = 30_000_000_000n; // 30 000 USDT
const U = (n: number) => BigInt(n) * 1_000_000n;
const ref = (s: string) => ethers.id(s);
const ceilFee = (x: bigint) => (x * FEE_BPS + 9_999n) / 10_000n;

// Детермінований генератор для фаззингу.
const lcg = (seed: bigint) => () => {
  seed = (seed * 6364136223846793005n + 1442695040888963407n) % 2n ** 64n;
  return seed;
};

type Fixture = Awaited<ReturnType<typeof deploy>>;

const deploy = async () => {
  const [deployer, client, performer, feeRecipient, arbiter, stranger] = await ethers.getSigners();
  const usdt = await ethers.deployContract("MockUSDT");
  const factory = await ethers.deployContract("EscrowFactory", [
    await usdt.getAddress(),
    FEE_BPS,
    feeRecipient.address,
    arbiter.address,
    MAX_AMOUNT,
    DISPUTE_TIMEOUT,
    FALLBACK_PCT,
  ]);
  const impl = await ethers.getContractAt("DealEscrow", await factory.IMPLEMENTATION());
  await usdt.mint(client.address, U(10_000_000));
  return { deployer, client, performer, feeRecipient, arbiter, stranger, usdt, factory, impl, factoryAddress: await factory.getAddress() };
};

type Opts = { amount?: bigint; ref?: string; deliverBy?: number; review?: number; from?: "client" | "stranger" };

const create = async (f: Fixture, o: Opts = {}) => {
  const amount = o.amount ?? U(1000);
  const dealRef = o.ref ?? ref("deal-1");
  const now = await time.latest();
  const deliverBy = o.deliverBy ?? now + WINDOW + 10;
  const signer = o.from === "stranger" ? f.stranger : f.client;
  const deposit = await f.factory.quoteDeposit(amount);
  await f.usdt.connect(signer).approve(f.factoryAddress, deposit);
  const tx = await f.factory.connect(signer).createDeal(f.performer.address, amount, deliverBy, o.review ?? REVIEW, dealRef);
  await tx.wait();
  const escrowAddress = await f.factory.predictEscrow(signer.address, dealRef);
  const escrow = await ethers.getContractAt("DealEscrow", escrowAddress);
  return { escrow, escrowAddress, amount, deposit, fee: deposit - amount, deliverBy, dealRef };
};

const at = async (t: number) => time.setNextBlockTimestamp(t);

const setup = async () => {
  const f = await deploy();
  return { f, d: await create(f) };
};

const delivered = async () => {
  const { f, d } = await setup();
  await d.escrow.connect(f.performer).deliver();
  return { f, d, reviewEnds: Number(await d.escrow.reviewEnds()) };
};

const disputed = async () => {
  const { f, d } = await setup();
  await d.escrow.connect(f.client).dispute();
  return { f, d, disputedAt: Number(await d.escrow.disputedAt()) };
};

const bal = (f: Fixture, a: string) => f.usdt.balanceOf(a);

describe("EscrowFactory: конструктор", () => {
  const args = (f: Fixture, over: Partial<Record<number, unknown>> = {}) => {
    const base: unknown[] = [f.usdt.target, 700, f.feeRecipient.address, f.arbiter.address, MAX_AMOUNT, DISPUTE_TIMEOUT, 50];
    Object.entries(over).forEach(([i, v]) => (base[Number(i)] = v));
    return base;
  };

  it("межі параметрів", async () => {
    const f = await networkHelpers.loadFixture(deploy);
    const F = await ethers.getContractFactory("EscrowFactory");
    await ethers.deployContract("EscrowFactory", args(f, { 1: 1000 }));
    await expect(ethers.deployContract("EscrowFactory", args(f, { 1: 1001 }))).to.be.revertedWithCustomError(F, "FeeTooHigh");
    await expect(ethers.deployContract("EscrowFactory", args(f, { 0: ethers.ZeroAddress }))).to.be.revertedWithCustomError(F, "ZeroAddress");
    await expect(ethers.deployContract("EscrowFactory", args(f, { 2: ethers.ZeroAddress }))).to.be.revertedWithCustomError(F, "ZeroAddress");
    await expect(ethers.deployContract("EscrowFactory", args(f, { 3: ethers.ZeroAddress }))).to.be.revertedWithCustomError(F, "ZeroAddress");
    await expect(ethers.deployContract("EscrowFactory", args(f, { 4: 0 }))).to.be.revertedWithCustomError(F, "InvalidAmount");
    await expect(ethers.deployContract("EscrowFactory", args(f, { 5: 14 * DAY - 1 }))).to.be.revertedWithCustomError(F, "BadTimeout");
    await expect(ethers.deployContract("EscrowFactory", args(f, { 5: 365 * DAY + 1 }))).to.be.revertedWithCustomError(F, "BadTimeout");
    await expect(ethers.deployContract("EscrowFactory", args(f, { 6: 53 }))).to.be.revertedWithCustomError(F, "BadPercent");
    await expect(ethers.deployContract("EscrowFactory", args(f, { 6: 105 }))).to.be.revertedWithCustomError(F, "BadPercent");
  });

  it("немає функцій зміни стану, окрім createDeal; у ескроу немає сеттерів", async () => {
    const f = await networkHelpers.loadFixture(deploy);
    const writes = (c: { interface: { fragments: readonly unknown[] } }) =>
      c.interface.fragments
        .filter((x): x is FunctionFragment => (x as { type: string }).type === "function")
        .filter((x) => !x.constant)
        .map((x) => x.name)
        .sort();
    expect(writes(f.factory)).to.deep.equal(["createDeal"]);
    expect(writes(f.impl)).to.deep.equal(["deliver", "dispute", "forceResolve", "initialize", "payOut", "release", "resolve", "settle"]);
  });
});

describe("EscrowFactory: створення угоди", () => {
  it("клон: мінімальний проксі EIP-1167, внесок = ціна + комісія зверху, параметри фабрики незмінні й видні", async () => {
    const { f, d } = await networkHelpers.loadFixture(setup);
    const code = await ethers.provider.getCode(d.escrowAddress);
    expect((code.length - 2) / 2).to.equal(45);
    expect(code.toLowerCase()).to.contain((await f.factory.IMPLEMENTATION()).slice(2).toLowerCase());
    expect(d.deposit).to.equal(U(1000) + U(70));
    expect(await bal(f, d.escrowAddress)).to.equal(d.deposit);
    expect(await bal(f, f.client.address)).to.equal(U(10_000_000) - d.deposit);
    expect(await d.escrow.state()).to.equal(1n);
    expect(await d.escrow.client()).to.equal(f.client.address);
    expect(await d.escrow.performer()).to.equal(f.performer.address);
    expect(await d.escrow.amount()).to.equal(d.amount);
    expect(await d.escrow.fee()).to.equal(d.fee);
    expect(await d.escrow.dealRef()).to.equal(d.dealRef);
    expect(await d.escrow.ARBITER()).to.equal(f.arbiter.address);
    expect(await d.escrow.FEE_RECIPIENT()).to.equal(f.feeRecipient.address);
    expect(await d.escrow.FEE_BPS()).to.equal(FEE_BPS);
    expect(await d.escrow.TOKEN()).to.equal(f.usdt.target);
  });

  it("подія DealCreated", async () => {
    const f = await networkHelpers.loadFixture(deploy);
    const now = await time.latest();
    await f.usdt.connect(f.client).approve(f.factoryAddress, U(1070));
    const predicted = await f.factory.predictEscrow(f.client.address, ref("e"));
    await expect(f.factory.connect(f.client).createDeal(f.performer.address, U(1000), now + 1000, REVIEW, ref("e")))
      .to.emit(f.factory, "DealCreated")
      .withArgs(ref("e"), predicted, f.client.address, f.performer.address, U(1000), U(70), (v: bigint) => v > 0n, REVIEW);
  });

  it("перевірки входу", async () => {
    const f = await networkHelpers.loadFixture(deploy);
    const now = await time.latest();
    await f.usdt.connect(f.client).approve(f.factoryAddress, U(100_000));
    const go = (over: Partial<{ performer: string; amount: bigint; by: number; review: number; r: string; from: typeof f.client }> = {}) =>
      f.factory
        .connect(over.from ?? f.client)
        .createDeal(over.performer ?? f.performer.address, over.amount ?? U(100), over.by ?? now + 1000, over.review ?? REVIEW, over.r ?? ref("x"));
    await expect(go({ performer: ethers.ZeroAddress })).to.be.revertedWithCustomError(f.factory, "InvalidParty");
    await expect(go({ performer: f.client.address })).to.be.revertedWithCustomError(f.factory, "InvalidParty");
    await expect(go({ performer: f.arbiter.address })).to.be.revertedWithCustomError(f.factory, "InvalidParty");
    await f.usdt.mint(f.arbiter.address, U(1000));
    await f.usdt.connect(f.arbiter).approve(f.factoryAddress, U(1000));
    await expect(go({ from: f.arbiter })).to.be.revertedWithCustomError(f.factory, "InvalidParty");
    await expect(go({ amount: 0n })).to.be.revertedWithCustomError(f.factory, "InvalidAmount");
    await expect(go({ amount: MAX_AMOUNT + 1n })).to.be.revertedWithCustomError(f.factory, "InvalidAmount");
    await expect(go({ by: now })).to.be.revertedWithCustomError(f.factory, "InvalidDeadline");
    await expect(go({ by: now + 366 * DAY })).to.be.revertedWithCustomError(f.factory, "InvalidDeadline");
    await expect(go({ review: DAY - 1 })).to.be.revertedWithCustomError(f.factory, "InvalidReviewPeriod");
    await expect(go({ review: 60 * DAY + 1 })).to.be.revertedWithCustomError(f.factory, "InvalidReviewPeriod");
    await expect(go({ r: ethers.ZeroHash })).to.be.revertedWithCustomError(f.factory, "ZeroRef");
  });

  it("ліміт на угоду: рівно MAX_AMOUNT проходить", async () => {
    const f = await networkHelpers.loadFixture(deploy);
    const d = await create(f, { amount: MAX_AMOUNT });
    expect(await d.escrow.amount()).to.equal(MAX_AMOUNT);
  });

  it("без схвалення (або з меншим) створення відкочується", async () => {
    const f = await networkHelpers.loadFixture(deploy);
    const now = await time.latest();
    await f.usdt.connect(f.client).approve(f.factoryAddress, U(1000)); // без комісії
    await expect(f.factory.connect(f.client).createDeal(f.performer.address, U(1000), now + 1000, REVIEW, ref("a"))).to.revert(ethers);
  });

  it("CREATE2 з тими самими параметрами: повтор відхиляється; те саме посилання з іншими параметрами теж", async () => {
    const f = await networkHelpers.loadFixture(deploy);
    const now = await time.latest();
    await create(f, { ref: ref("same"), deliverBy: now + 5000 });
    await f.usdt.connect(f.client).approve(f.factoryAddress, U(5000));
    await expect(f.factory.connect(f.client).createDeal(f.performer.address, U(1000), now + 5000, REVIEW, ref("same"))).to.revert(ethers);
    await expect(f.factory.connect(f.client).createDeal(f.stranger.address, U(10), now + 6000, REVIEW, ref("same"))).to.revert(ethers);
  });

  it("чужий не може зайняти адрес ескроу заказчика: сіль містить адресу того, хто створює", async () => {
    const f = await networkHelpers.loadFixture(deploy);
    const a = await f.factory.predictEscrow(f.client.address, ref("r"));
    const b = await f.factory.predictEscrow(f.stranger.address, ref("r"));
    expect(a).to.not.equal(b);
    await f.usdt.mint(f.stranger.address, U(2000));
    await create(f, { ref: ref("r"), from: "stranger" });
    // заказчик зі своїм посиланням створює без проблем
    const d = await create(f, { ref: ref("r") });
    expect(d.escrowAddress).to.equal(a);
  });

  it("токен, надісланий на адрес клона ДО створення, не ламає створення й не рахується в угоді", async () => {
    const f = await networkHelpers.loadFixture(deploy);
    const predicted = await f.factory.predictEscrow(f.client.address, ref("pre"));
    await f.usdt.mint(predicted, U(500));
    const d = await create(f, { ref: ref("pre") });
    expect(d.escrowAddress).to.equal(predicted);
    expect(await d.escrow.amount()).to.equal(U(1000));
    await d.escrow.connect(f.performer).deliver();
    await d.escrow.connect(f.client).release();
    expect(await bal(f, f.performer.address)).to.equal(U(1000));
    expect(await bal(f, d.escrowAddress)).to.equal(U(500)); // зайве лишається в клоні, на угоду не впливає
  });

  it("токен із комісією переказу: внесок менший за потрібний, ініціалізація відхиляється", async () => {
    const [, client, performer, fr, arb] = await ethers.getSigners();
    const t = await ethers.deployContract("MockFeeOnTransferToken");
    const factory = await ethers.deployContract("EscrowFactory", [t.target, 700, fr.address, arb.address, MAX_AMOUNT, DISPUTE_TIMEOUT, 50]);
    await t.mint(client.address, U(5000));
    await t.connect(client).approve(factory.target, U(5000));
    const now = await time.latest();
    await expect(factory.connect(client).createDeal(performer.address, U(1000), now + 1000, REVIEW, ref("fot"))).to.be.revertedWithCustomError(
      await ethers.getContractFactory("DealEscrow"),
      "NotFunded",
    );
  });
});

describe("DealEscrow: ініціалізація", () => {
  it("повторна ініціалізація клона: хто завгодно відхиляється, навіть сама фабрика", async () => {
    const { f, d } = await networkHelpers.loadFixture(setup);
    const args = [f.stranger.address, f.stranger.address, 1n, 1n, 1n, ref("evil")] as const;
    await expect(d.escrow.connect(f.stranger).initialize(...args)).to.be.revertedWithCustomError(d.escrow, "NotFactory");
    await expect(d.escrow.connect(f.client).initialize(...args)).to.be.revertedWithCustomError(d.escrow, "NotFactory");
    await networkHelpers.setBalance(f.factoryAddress, ethers.parseEther("1"));
    const asFactory = await ethers.getImpersonatedSigner(f.factoryAddress);
    await expect(d.escrow.connect(asFactory).initialize(...args)).to.be.revertedWithCustomError(d.escrow, "WrongState");
    expect(await d.escrow.performer()).to.equal(f.performer.address);
  });

  it("initialize напряму на implementation: чужий отримує NotFactory, фабрика теж не може (стан Closed)", async () => {
    const f = await networkHelpers.loadFixture(deploy);
    const args = [f.stranger.address, f.performer.address, U(1), 1n, 1n, ref("evil")] as const;
    await expect(f.impl.connect(f.stranger).initialize(...args)).to.be.revertedWithCustomError(f.impl, "NotFactory");
    await networkHelpers.setBalance(f.factoryAddress, ethers.parseEther("1"));
    const asFactory = await ethers.getImpersonatedSigner(f.factoryAddress);
    await expect(f.impl.connect(asFactory).initialize(...args)).to.be.revertedWithCustomError(f.impl, "WrongState");
    expect(await f.impl.state()).to.equal(4n);
  });

  it("реалізація як угода марна: на ній нічого не зробити", async () => {
    const f = await networkHelpers.loadFixture(deploy);
    await expect(f.impl.connect(f.performer).deliver()).to.revert(ethers);
    await expect(f.impl.connect(f.stranger).settle()).to.be.revertedWithCustomError(f.impl, "WrongState");
    await expect(f.impl.connect(f.arbiter).resolve(50)).to.be.revertedWithCustomError(f.impl, "WrongState");
  });

  it("payOut викликається лише самим контрактом", async () => {
    const { f, d } = await networkHelpers.loadFixture(setup);
    await expect(d.escrow.connect(f.client).payOut(d.amount)).to.be.revertedWithCustomError(d.escrow, "NotSelf");
    await expect(d.escrow.connect(f.arbiter).payOut(d.amount)).to.be.revertedWithCustomError(d.escrow, "NotSelf");
  });
});

describe("DealEscrow: основний шлях", () => {
  it("здача, приймання: виконавець отримує ціну повністю, комісія йде отримувачу, заказчику нічого не повертається", async () => {
    const { f, d } = await networkHelpers.loadFixture(setup);
    await d.escrow.connect(f.performer).deliver();
    await expect(d.escrow.connect(f.client).release()).to.emit(d.escrow, "Closed").withArgs(d.amount, d.fee, 0n);
    expect(await bal(f, f.performer.address)).to.equal(d.amount);
    expect(await bal(f, f.feeRecipient.address)).to.equal(d.fee);
    expect(await bal(f, d.escrowAddress)).to.equal(0n);
    expect(await bal(f, f.client.address)).to.equal(U(10_000_000) - d.deposit);
    expect(await d.escrow.state()).to.equal(4n);
    expect(await d.escrow.paidToPerformer()).to.equal(d.amount);
  });

  it("повторна виплата: release, settle, dispute, resolve, forceResolve після закриття відкочуються, баланси не рухаються", async () => {
    const { f, d } = await networkHelpers.loadFixture(setup);
    await d.escrow.connect(f.performer).deliver();
    await d.escrow.connect(f.client).release();
    const before = [await bal(f, f.performer.address), await bal(f, f.client.address), await bal(f, f.feeRecipient.address)];
    await time.increase(400 * DAY);
    await expect(d.escrow.connect(f.client).release()).to.be.revertedWithCustomError(d.escrow, "WrongState");
    await expect(d.escrow.connect(f.stranger).settle()).to.be.revertedWithCustomError(d.escrow, "WrongState");
    await expect(d.escrow.connect(f.client).dispute()).to.be.revertedWithCustomError(d.escrow, "WrongState");
    await expect(d.escrow.connect(f.performer).deliver()).to.be.revertedWithCustomError(d.escrow, "WrongState");
    await expect(d.escrow.connect(f.arbiter).resolve(100)).to.be.revertedWithCustomError(d.escrow, "WrongState");
    await expect(d.escrow.connect(f.stranger).forceResolve()).to.be.revertedWithCustomError(d.escrow, "WrongState");
    expect([await bal(f, f.performer.address), await bal(f, f.client.address), await bal(f, f.feeRecipient.address)]).to.deep.equal(before);
  });

  it("чужі виклики: deliver не виконавцем, release не заказчиком, release до здачі", async () => {
    const { f, d } = await networkHelpers.loadFixture(setup);
    await expect(d.escrow.connect(f.client).deliver()).to.be.revertedWithCustomError(d.escrow, "NotPerformer");
    await expect(d.escrow.connect(f.stranger).deliver()).to.be.revertedWithCustomError(d.escrow, "NotPerformer");
    await expect(d.escrow.connect(f.client).release()).to.be.revertedWithCustomError(d.escrow, "WrongState");
    await d.escrow.connect(f.performer).deliver();
    await expect(d.escrow.connect(f.performer).release()).to.be.revertedWithCustomError(d.escrow, "NotClient");
    await expect(d.escrow.connect(f.stranger).release()).to.be.revertedWithCustomError(d.escrow, "NotClient");
    await expect(d.escrow.connect(f.arbiter).release()).to.be.revertedWithCustomError(d.escrow, "NotClient");
    await expect(d.escrow.connect(f.performer).deliver()).to.be.revertedWithCustomError(d.escrow, "WrongState");
  });
});

describe("DealEscrow: таймери на межах", () => {
  it("здача рівно в deliverBy проходить, на секунду пізніше ні", async () => {
    const a = await networkHelpers.loadFixture(setup);
    await at(a.d.deliverBy);
    await a.d.escrow.connect(a.f.performer).deliver();
    expect(await a.d.escrow.state()).to.equal(2n);
    expect(await a.d.escrow.reviewEnds()).to.equal(a.d.deliverBy + REVIEW);
  });

  it("здача на секунду після deliverBy відхиляється", async () => {
    const { f, d } = await networkHelpers.loadFixture(setup);
    await at(d.deliverBy + 1);
    await expect(d.escrow.connect(f.performer).deliver()).to.be.revertedWithCustomError(d.escrow, "TooLate");
  });

  it("без здачі: settle у deliverBy ще рано, у deliverBy+1 гроші повністю повертаються заказчику без комісії", async () => {
    const { f, d } = await networkHelpers.loadFixture(setup);
    await at(d.deliverBy);
    await expect(d.escrow.connect(f.stranger).settle()).to.be.revertedWithCustomError(d.escrow, "TooEarly");
    await at(d.deliverBy + 1);
    await d.escrow.connect(f.stranger).settle();
    expect(await bal(f, f.client.address)).to.equal(U(10_000_000));
    expect(await bal(f, f.performer.address)).to.equal(0n);
    expect(await bal(f, f.feeRecipient.address)).to.equal(0n);
    expect(await bal(f, d.escrowAddress)).to.equal(0n);
    expect(await d.escrow.paidToPerformer()).to.equal(0n);
  });

  it("після здачі: settle у reviewEnds ще рано, у reviewEnds+1 виплата виконавцю (викликає хто завгодно)", async () => {
    const { f, d, reviewEnds } = await networkHelpers.loadFixture(delivered);
    await at(reviewEnds);
    await expect(d.escrow.connect(f.stranger).settle()).to.be.revertedWithCustomError(d.escrow, "TooEarly");
    await at(reviewEnds + 1);
    await d.escrow.connect(f.stranger).settle();
    expect(await bal(f, f.performer.address)).to.equal(d.amount);
    expect(await bal(f, f.feeRecipient.address)).to.equal(d.fee);
  });

  it("заказчик може прийняти й до, і в момент reviewEnds", async () => {
    const { f, d, reviewEnds } = await networkHelpers.loadFixture(delivered);
    await at(reviewEnds);
    await d.escrow.connect(f.client).release();
    expect(await d.escrow.state()).to.equal(4n);
  });

  it("settle після здачі не повертає гроші заказчику, а до deliverBy settle у стані Funded рано", async () => {
    const { f, d } = await networkHelpers.loadFixture(setup);
    await expect(d.escrow.connect(f.client).settle()).to.be.revertedWithCustomError(d.escrow, "TooEarly");
  });

  it("запасний вихід зі спору: рано за секунду до таймера, можна рівно в disputedAt + DISPUTE_TIMEOUT", async () => {
    const { f, d, disputedAt } = await networkHelpers.loadFixture(disputed);
    await at(disputedAt + DISPUTE_TIMEOUT - 1);
    await expect(d.escrow.connect(f.stranger).forceResolve()).to.be.revertedWithCustomError(d.escrow, "TooEarly");
    await at(disputedAt + DISPUTE_TIMEOUT);
    await d.escrow.connect(f.stranger).forceResolve();
    // 50 % виконавцю: 500, комісія з його частки 35, решта 535 - заказчику
    expect(await bal(f, f.performer.address)).to.equal(U(500));
    expect(await bal(f, f.feeRecipient.address)).to.equal(U(35));
    expect(await bal(f, f.client.address)).to.equal(U(10_000_000) - d.deposit + (d.deposit - U(500) - U(35)));
    expect(await bal(f, d.escrowAddress)).to.equal(0n);
  });
});

describe("DealEscrow: спір і арбітр", () => {
  it("спір відкривають лише сторони, тільки до виплати", async () => {
    const { f, d } = await networkHelpers.loadFixture(setup);
    await expect(d.escrow.connect(f.stranger).dispute()).to.be.revertedWithCustomError(d.escrow, "NotParty");
    await expect(d.escrow.connect(f.arbiter).dispute()).to.be.revertedWithCustomError(d.escrow, "NotParty");
    await expect(d.escrow.connect(f.performer).dispute()).to.emit(d.escrow, "Disputed").withArgs(f.performer.address);
    await expect(d.escrow.connect(f.client).dispute()).to.be.revertedWithCustomError(d.escrow, "WrongState");
  });

  it("під час спору таймери не діють, здача й приймання закриті, навіть через рік", async () => {
    const { f, d } = await networkHelpers.loadFixture(disputed);
    await time.increase(366 * DAY);
    await expect(d.escrow.connect(f.stranger).settle()).to.be.revertedWithCustomError(d.escrow, "WrongState");
    await expect(d.escrow.connect(f.client).release()).to.be.revertedWithCustomError(d.escrow, "WrongState");
    await expect(d.escrow.connect(f.performer).deliver()).to.be.revertedWithCustomError(d.escrow, "WrongState");
    expect(await bal(f, d.escrowAddress)).to.equal(d.deposit);
  });

  it("спір після здачі теж блокує автовиплату", async () => {
    const { f, d, reviewEnds } = await networkHelpers.loadFixture(delivered);
    await d.escrow.connect(f.client).dispute();
    await at(reviewEnds + 10);
    await expect(d.escrow.connect(f.stranger).settle()).to.be.revertedWithCustomError(d.escrow, "WrongState");
  });

  it("арбітр поза спором безсилий: у Funded, Delivered і Closed", async () => {
    const a = await networkHelpers.loadFixture(setup);
    await expect(a.d.escrow.connect(a.f.arbiter).resolve(100)).to.be.revertedWithCustomError(a.d.escrow, "WrongState");
    await a.d.escrow.connect(a.f.performer).deliver();
    await expect(a.d.escrow.connect(a.f.arbiter).resolve(100)).to.be.revertedWithCustomError(a.d.escrow, "WrongState");
    await a.d.escrow.connect(a.f.client).release();
    await expect(a.d.escrow.connect(a.f.arbiter).resolve(100)).to.be.revertedWithCustomError(a.d.escrow, "WrongState");
  });

  it("resolve лише арбітром", async () => {
    const { f, d } = await networkHelpers.loadFixture(disputed);
    for (const s of [f.client, f.performer, f.stranger, f.feeRecipient, f.deployer])
      await expect(d.escrow.connect(s).resolve(50)).to.be.revertedWithCustomError(d.escrow, "NotArbiter");
  });

  it("частка не кратна 5 або більше 100 відхиляється", async () => {
    const { f, d } = await networkHelpers.loadFixture(disputed);
    for (const p of [1, 4, 6, 99, 101, 105, 255])
      await expect(d.escrow.connect(f.arbiter).resolve(p)).to.be.revertedWithCustomError(d.escrow, "BadPercent");
  });

  it("арбітр не отримує нічого за жодної частки: гроші лише в заказчика, виконавця й отримувача комісії", async () => {
    for (let p = 0; p <= 100; p += 5) {
      const { f, d } = await networkHelpers.loadFixture(disputed);
      const share = (d.amount * BigInt(p)) / 100n;
      const fee = ceilFee(share);
      await d.escrow.connect(f.arbiter).resolve(p);
      expect(await bal(f, f.arbiter.address)).to.equal(0n);
      expect(await bal(f, f.performer.address)).to.equal(share);
      expect(await bal(f, f.feeRecipient.address)).to.equal(fee);
      expect(await bal(f, f.client.address)).to.equal(U(10_000_000) - share - fee);
      expect(await bal(f, d.escrowAddress)).to.equal(0n);
    }
  });
});

describe("DealEscrow: заблоковані адреси", () => {
  it("виконавця заблоковано: приймання й автовиплата відкочуються, гроші на місці, вихід через спір і арбітра", async () => {
    const { f, d, reviewEnds } = await networkHelpers.loadFixture(delivered);
    await f.usdt.setBlocked(f.performer.address, true);
    await expect(d.escrow.connect(f.client).release()).to.revert(ethers);
    await at(reviewEnds + 1);
    await expect(d.escrow.connect(f.stranger).settle()).to.revert(ethers);
    expect(await bal(f, d.escrowAddress)).to.equal(d.deposit);
    expect(await d.escrow.state()).to.equal(2n);

    await d.escrow.connect(f.client).dispute();
    // арбітр, що обрав виплату заблокованому, отримує відкіт і обирає інше рішення
    await expect(d.escrow.connect(f.arbiter).resolve(50)).to.revert(ethers);
    await d.escrow.connect(f.arbiter).resolve(0);
    expect(await bal(f, f.client.address)).to.equal(U(10_000_000));
    expect(await bal(f, d.escrowAddress)).to.equal(0n);
  });

  it("виконавця заблоковано, арбітр мовчить: після таймера forceResolve повертає заказчику (50 % не проходить, 0 % проходить)", async () => {
    const { f, d, disputedAt } = await networkHelpers.loadFixture(disputed);
    await f.usdt.setBlocked(f.performer.address, true);
    await at(disputedAt + DISPUTE_TIMEOUT);
    await d.escrow.connect(f.stranger).forceResolve();
    expect(await bal(f, f.client.address)).to.equal(U(10_000_000));
    expect(await bal(f, d.escrowAddress)).to.equal(0n);
    expect(await d.escrow.paidToPerformer()).to.equal(0n);
  });

  it("заказчика заблоковано: повернення відкочується, виконавець виходить через спір, арбітр платить йому все", async () => {
    const { f, d } = await networkHelpers.loadFixture(setup);
    await f.usdt.setBlocked(f.client.address, true);
    await at(d.deliverBy + 1);
    await expect(d.escrow.connect(f.stranger).settle()).to.revert(ethers);
    await d.escrow.connect(f.performer).dispute();
    await d.escrow.connect(f.arbiter).resolve(100); // клієнтові нічого не лишається (комісія = вся внесена), переказу йому немає
    expect(await bal(f, f.performer.address)).to.equal(d.amount);
    expect(await bal(f, d.escrowAddress)).to.equal(0n);
  });

  it("заказчика заблоковано, арбітр мовчить: forceResolve доходить до варіанту «все виконавцю»", async () => {
    const { f, d, disputedAt } = await networkHelpers.loadFixture(disputed);
    await f.usdt.setBlocked(f.client.address, true);
    await at(disputedAt + DISPUTE_TIMEOUT);
    await d.escrow.connect(f.stranger).forceResolve();
    expect(await bal(f, f.performer.address)).to.equal(d.amount);
    expect(await bal(f, d.escrowAddress)).to.equal(0n);
  });

  it("заблоковані обидва: forceResolve відкочується (Stuck), стан спору лишається; після розблокування працює", async () => {
    const { f, d, disputedAt } = await networkHelpers.loadFixture(disputed);
    await f.usdt.setBlocked(f.client.address, true);
    await f.usdt.setBlocked(f.performer.address, true);
    await at(disputedAt + DISPUTE_TIMEOUT);
    await expect(d.escrow.connect(f.stranger).forceResolve()).to.be.revertedWithCustomError(d.escrow, "Stuck");
    expect(await d.escrow.state()).to.equal(3n);
    expect(await bal(f, d.escrowAddress)).to.equal(d.deposit);
    await f.usdt.setBlocked(f.client.address, false);
    await f.usdt.setBlocked(f.performer.address, false);
    await d.escrow.connect(f.stranger).forceResolve();
    expect(await bal(f, d.escrowAddress)).to.equal(0n);
  });

  it("заблокований отримувач комісії не блокує виплату: комісія повертається заказчику", async () => {
    const { f, d } = await networkHelpers.loadFixture(delivered);
    await f.usdt.setBlocked(f.feeRecipient.address, true);
    await expect(d.escrow.connect(f.client).release()).to.emit(d.escrow, "Closed").withArgs(d.amount, 0n, d.fee);
    expect(await bal(f, f.performer.address)).to.equal(d.amount);
    expect(await bal(f, f.client.address)).to.equal(U(10_000_000) - d.amount);
    expect(await bal(f, d.escrowAddress)).to.equal(0n);
  });

  it("заблокований отримувач комісії: рішення арбітра теж проходить", async () => {
    const { f, d } = await networkHelpers.loadFixture(disputed);
    await f.usdt.setBlocked(f.feeRecipient.address, true);
    await d.escrow.connect(f.arbiter).resolve(60);
    expect(await bal(f, f.performer.address)).to.equal(U(600));
    expect(await bal(f, d.escrowAddress)).to.equal(0n);
  });
});

describe("DealEscrow: повторний вхід і зайві токени", () => {
  const erc20Setup = async () => {
    const [, client, performer, fr, arb] = await ethers.getSigners();
    const t = await ethers.deployContract("MockERC20");
    const factory = await ethers.deployContract("EscrowFactory", [t.target, 700, fr.address, arb.address, MAX_AMOUNT, DISPUTE_TIMEOUT, 50]);
    await t.mint(client.address, U(5000));
    await t.connect(client).approve(factory.target, U(5000));
    return { client, performer, fr, arb, t, factory };
  };

  it("токен-хук у release викликає release/dispute/settle ще раз: усе відхилено охоронцем, виплата одна", async () => {
    const x = await networkHelpers.loadFixture(erc20Setup);
    const now = await time.latest();
    await x.factory.connect(x.client).createDeal(x.performer.address, U(1000), now + WINDOW, REVIEW, ref("re"));
    const escrow = await ethers.getContractAt("DealEscrow", await x.factory.predictEscrow(x.client.address, ref("re")));
    await escrow.connect(x.performer).deliver();
    await x.t.setHook(escrow.target, escrow.interface.encodeFunctionData("release"));
    await escrow.connect(x.client).release();
    expect(await x.t.hookSuccess()).to.equal(false);
    expect(await x.t.hookResult()).to.equal(escrow.interface.getError("ReentrancyGuardReentrantCall")!.selector);
    expect(await x.t.balanceOf(x.performer.address)).to.equal(U(1000));
    expect(await x.t.balanceOf(escrow.target)).to.equal(0n);
  });

  it("токен-хук у createDeal викликає createDeal ще раз: відхилено охоронцем фабрики", async () => {
    const x = await networkHelpers.loadFixture(erc20Setup);
    const now = await time.latest();
    const inner = x.factory.interface.encodeFunctionData("createDeal", [x.performer.address, U(10), now + WINDOW, REVIEW, ref("inner")]);
    await x.t.setHook(x.factory.target, inner);
    await x.factory.connect(x.client).createDeal(x.performer.address, U(1000), now + WINDOW, REVIEW, ref("outer"));
    expect(await x.t.hookSuccess()).to.equal(false);
    expect(await x.t.hookResult()).to.equal(x.factory.interface.getError("ReentrancyGuardReentrantCall")!.selector);
  });

  it("токен, надісланий у клон після створення, ігнорується: виплата точна, зайве лишається", async () => {
    const { f, d } = await networkHelpers.loadFixture(setup);
    await f.usdt.mint(d.escrowAddress, U(123));
    await d.escrow.connect(f.performer).deliver();
    await d.escrow.connect(f.client).release();
    expect(await bal(f, f.performer.address)).to.equal(d.amount);
    expect(await bal(f, f.feeRecipient.address)).to.equal(d.fee);
    expect(await bal(f, f.client.address)).to.equal(U(10_000_000) - d.deposit);
    expect(await bal(f, d.escrowAddress)).to.equal(U(123));
  });

  it("мінімальна угода в 1 одиницю: комісія 1, release виплачує обидва", async () => {
    const f = await networkHelpers.loadFixture(deploy);
    const d = await create(f, { amount: 1n });
    expect(d.fee).to.equal(1n);
    await d.escrow.connect(f.performer).deliver();
    await d.escrow.connect(f.client).release();
    expect(await bal(f, f.performer.address)).to.equal(1n);
    expect(await bal(f, f.feeRecipient.address)).to.equal(1n);
    expect(await bal(f, d.escrowAddress)).to.equal(0n);
  });
});

describe("DealEscrow: інваріант і фаззинг", () => {
  it("для випадкових і граничних сум та всіх шляхів: сума виплат = внесок, ескроу порожній, виконавець отримує рівно свою частку", async () => {
    const next = lcg(7n);
    const amounts = [1n, 2n, 13n, 14n, 15n, 19n, 20n, 21n, 99n, 100n, 101n, 143n, 9_999n, 10_001n, MAX_AMOUNT, MAX_AMOUNT - 1n];
    for (let i = 0; i < 24; i++) amounts.push((next() % 30_000_000_000n) + 1n);
    const paths = ["release", "refund", "auto", "resolve", "force"] as const;

    const f = await deploy();
    await f.usdt.mint(f.client.address, 2n ** 80n);
    let n = 0;
    for (const amount of amounts) {
      for (const path of paths) {
        n++;
        const d = await create(f, { amount, ref: ref(`fz-${n}`) });
        const clientBefore = await bal(f, f.client.address);
        const performerBefore = await bal(f, f.performer.address);
        const feeBefore = await bal(f, f.feeRecipient.address);
        let share: bigint;
        if (path === "release" || path === "auto") {
          await d.escrow.connect(f.performer).deliver();
          if (path === "release") await d.escrow.connect(f.client).release();
          else {
            await time.increase(REVIEW + 1);
            await d.escrow.connect(f.stranger).settle();
          }
          share = amount;
        } else if (path === "refund") {
          await time.increase(WINDOW + 20);
          await d.escrow.connect(f.stranger).settle();
          share = 0n;
        } else {
          await d.escrow.connect(f.client).dispute();
          if (path === "resolve") {
            const pct = Number(next() % 21n) * 5;
            share = (amount * BigInt(pct)) / 100n;
            await d.escrow.connect(f.arbiter).resolve(pct);
          } else {
            await time.increase(DISPUTE_TIMEOUT + 1);
            await d.escrow.connect(f.stranger).forceResolve();
            share = (amount * BigInt(FALLBACK_PCT)) / 100n;
          }
        }
        const fee = ceilFee(share);
        expect(await bal(f, d.escrowAddress)).to.equal(0n);
        expect(await d.escrow.paidToPerformer()).to.equal(share);
        // сума трьох виплат = внесок: виконавець, отримувач комісії, повернення заказчику
        const toClient = (await bal(f, f.client.address)) - clientBefore;
        expect(toClient).to.equal(d.deposit - share - fee);
        expect(share + fee + toClient).to.equal(d.deposit);
        expect(await bal(f, f.performer.address)).to.equal(performerBefore + share);
        expect(await bal(f, f.feeRecipient.address)).to.equal(feeBefore + fee);
      }
    }
  });
});
