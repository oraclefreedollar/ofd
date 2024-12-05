import { expect } from "chai";
import { floatToDec18 } from "../scripts/math";
import { ethers } from "hardhat";
import {
  Equity,
  OracleFreeDollar,
  MintingHub,
  Position,
  PositionFactory,
  PositionRoller,
  Savings,
  TestToken,
} from "../typechain";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { evm_increaseTime, evm_mine_blocks } from "./helper";

describe("ForceSale Tests", () => {
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;

  let ofd: OracleFreeDollar;
  let equity: Equity;
  let roller: PositionRoller;
  let savings: Savings;

  let positionFactory: PositionFactory;
  let mintingHub: MintingHub;

  let position: Position;
  let coin: TestToken;

  const getTimeStamp = async () => {
    const blockNumBefore = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    return blockBefore?.timestamp ?? null;
  };

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();

    const oracleFreeDollarFactory = await ethers.getContractFactory("OracleFreeDollar");
    ofd = await oracleFreeDollarFactory.deploy(5 * 86400);

    const equityAddr = await ofd.reserve();
    equity = await ethers.getContractAt("Equity", equityAddr);

    const positionFactoryFactory = await ethers.getContractFactory(
      "PositionFactory"
    );
    positionFactory = await positionFactoryFactory.deploy();

    const savingsFactory = await ethers.getContractFactory("Savings");
    savings = await savingsFactory.deploy(ofd.getAddress(), 20000n);

    const rollerFactory = await ethers.getContractFactory("PositionRoller");
    roller = await rollerFactory.deploy(ofd.getAddress());

    const mintingHubFactory = await ethers.getContractFactory("MintingHub");
    mintingHub = await mintingHubFactory.deploy(
      await ofd.getAddress(),
      await savings.getAddress(),
      await roller.getAddress(),
      await positionFactory.getAddress()
    );

    // test coin
    const coinFactory = await ethers.getContractFactory("TestToken");
    coin = await coinFactory.deploy("Supercoin", "XCOIN", 18);

    // jump start ecosystem
    await ofd.initialize(owner.address, "owner");
    await ofd.initialize(await mintingHub.getAddress(), "mintingHub");

    await ofd.mint(owner.address, floatToDec18(2_000_000));
    await ofd.transfer(alice.address, floatToDec18(100_000));
    await ofd.transfer(bob.address, floatToDec18(100_000));

    // jump start ofdps
    await equity.invest(floatToDec18(1000), 0);
    await equity.connect(alice).invest(floatToDec18(10_000), 0);
    await equity.connect(bob).invest(floatToDec18(10_000), 0);
    await equity.invest(floatToDec18(1_000_000), 0);

    await coin.mint(alice.address, floatToDec18(1_000));
    await coin.mint(bob.address, floatToDec18(1_000));

    await coin.approve(mintingHub.getAddress(), floatToDec18(10));
    const newPos = await (
      await mintingHub.openPosition(
        await coin.getAddress(),
        floatToDec18(1),
        floatToDec18(10),
        floatToDec18(100_000),
        5 * 86_400,
        100 * 86_400,
        86_400,
        10000,
        floatToDec18(6000),
        100000
      )
    ).wait();

    // PositionOpened
    const topic =
      "0xc9b570ab9d98bdf3e38a40fd71b20edafca42449f23ca51f0bdcbf40e8ffe175";
    const log = newPos?.logs.find((x) => x.topics.indexOf(topic) >= 0);
    const positionAddr = "0x" + log?.topics[2].substring(26);
    position = await ethers.getContractAt("Position", positionAddr, owner);
  });

  describe("check position status", () => {
    it("fully open", async () => {
      await evm_increaseTime(5 * 86_400 + 300);
      expect(await position.start()).to.be.lessThan(await getTimeStamp());
    });

    it("expired", async () => {
      await evm_increaseTime(105 * 86_400 + 300);
      expect(await position.expiration()).to.be.lessThan(await getTimeStamp());
    });
  });

  describe("purchase price tests", () => {
    it("expect 10x liq. price", async () => {
      await evm_increaseTime(5 * 86_400 + 300); // consider open
      const p = await position.price();
      const expP = await mintingHub.expiredPurchasePrice(position);
      expect(expP).to.be.equal(10n * p);
    });

    it("expect 10x -> 1x ramp liq. price", async () => {
      await evm_increaseTime(105 * 86_400 + 100); // consider expired
      const p = await position.price();
      const eP1 = await mintingHub.expiredPurchasePrice(position);
      expect(eP1).to.be.lessThanOrEqual(10n * p);
      expect(eP1).to.be.greaterThan(9n * p);
      const period = await position.challengePeriod();
      await evm_increaseTime(period); // post period
      const eP2 = await mintingHub.expiredPurchasePrice(position);
      expect(eP2).to.be.lessThanOrEqual(p);
    });

    it("expect 0 price after 2nd period", async () => {
      const period = await position.challengePeriod();
      await evm_increaseTime(105n * 86_400n + 2n * period); // post 2nd period
      const eP3 = await mintingHub.expiredPurchasePrice(position);
      expect(eP3).to.be.equal(0n);
    });
  });

  describe("pre expiration tests", () => {
    it("restricted to onlyHub", async () => {
      const r = position.forceSale(
        owner.address,
        floatToDec18(1000),
        floatToDec18(1000)
      );
      await expect(r).to.be.revertedWithCustomError(position, "NotHub");
    });

    it("restricted to expired positions", async () => {
      await evm_increaseTime(5 * 86_400 + 300);
      const b = await coin.balanceOf(await position.getAddress());
      const r = mintingHub.buyExpiredCollateral(position, b);
      await expect(r).to.be.revertedWithCustomError(position, "Alive");
    });

    it("try to buy an Alive position and revert", async () => {
      await evm_increaseTime(5 * 86_400 + 300); // consider open
      const size = await coin.balanceOf(await position.getAddress());
      const tx = mintingHub.buyExpiredCollateral(position, size);
      await expect(tx).to.be.revertedWithCustomError(position, "Alive");
    });
  });

  describe("post expiration tests", () => {
    it("restricted to onlyHub", async () => {
      const r = position.forceSale(
        owner.address,
        floatToDec18(1000),
        floatToDec18(1000)
      );
      await expect(r).to.be.revertedWithCustomError(position, "NotHub");
    });

    it("simple buy of expired positions", async () => {
      await evm_increaseTime(105 * 86_400 + 300);
      const b = await coin.balanceOf(await position.getAddress());
      const r = await mintingHub.buyExpiredCollateral(position, b);
    });

    it("buy 10x liq. price", async () => {
      await evm_increaseTime(105 * 86_400 + 300); // consider expired
      const expP = await mintingHub.connect(alice).expiredPurchasePrice(position);
      const bZofd0 = await ofd.balanceOf(alice.address);
      const bCoin0 = await coin.balanceOf(alice.address);
      // const size = await coin.balanceOf(await position.getAddress());
      const size = floatToDec18(1);
      const expectedCost = size * expP / (10n**18n);
      const tx = await mintingHub.connect(alice).buyExpiredCollateral(position, size);
      tx.wait();
      const events = await mintingHub.queryFilter(mintingHub.filters.ForcedSale, -1);
      //console.log(events[0]);
      const bZofd1 = await ofd.balanceOf(alice.address);
      const bCoin1 = await coin.balanceOf(alice.address);
      expect(bCoin0 + size).to.be.equal(bCoin1);
      const actualCost = bZofd0 - bZofd1;
      expect(actualCost).to.be.approximately(expectedCost, 10n**18n); // slight deviation as one block passed
    });

    it("buy 1x liq. price", async () => {
      const period = await position.challengePeriod();
      await evm_increaseTime(105n * 86_400n + period + 300n); // consider expired
      const expP = await mintingHub
        .connect(alice)
        .expiredPurchasePrice(position);
      const bZofd0 = await ofd.balanceOf(alice.address);
      const bCoin0 = await coin.balanceOf(alice.address);
      const size = await coin.balanceOf(await position.getAddress());
      const tx = await mintingHub
        .connect(alice)
        .buyExpiredCollateral(position, size);
      const bZofd1 = await ofd.balanceOf(alice.address);
      const bCoin1 = await coin.balanceOf(alice.address);
      expect(bCoin0 + size).to.be.equal(bCoin1);
      expect(bZofd1 + (expP * size) / floatToDec18(1)).to.be.approximately(bZofd0, 10n**18n);
    });
  });
});
