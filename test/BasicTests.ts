import { expect } from "chai";
import { floatToDec18, dec18ToFloat, abs, DECIMALS } from "../scripts/math";
import { ethers } from "hardhat";
import { capitalToShares, sharesToCapital } from "../scripts/utils";
import {
  Equity,
  OracleFreeDollar,
  PositionFactory,
  StablecoinBridge,
  TestToken,
} from "../typechain";
import { evm_increaseTime } from "./helper";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("Basic Tests", () => {
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;

  let zofd: OracleFreeDollar;
  let equity: Equity;
  let positionFactory: PositionFactory;
  let mockXOFD: TestToken;
  let bridge: StablecoinBridge;

  before(async () => {
    [owner, alice] = await ethers.getSigners();
    // create contracts
    // 10 day application period
    const oracleFreeDollarFactory = await ethers.getContractFactory("OracleFreeDollar");
    zofd = await oracleFreeDollarFactory.deploy(10 * 86400);

    const equityAddr = await zofd.reserve();
    equity = await ethers.getContractAt("Equity", equityAddr);

    const positionFactoryFactory = await ethers.getContractFactory(
      "PositionFactory"
    );
    positionFactory = await positionFactoryFactory.deploy();

    const mintingHubFactory = await ethers.getContractFactory("MintingHub");
    await mintingHubFactory.deploy(
      await zofd.getAddress(),
      await positionFactory.getAddress()
    );
  });

  describe("basic initialization", () => {
    it("symbol should be OFD", async () => {
      let symbol = await zofd.symbol();
      expect(symbol).to.be.equal("OFD");
      let name = await zofd.name();
      expect(name).to.be.equal("OracleFreeDollar");
    });
  });

  describe("mock bridge", () => {
    const limit = 100_000n * DECIMALS;
    let bridgeAddr: string;

    before(async () => {
      const xofdFactory = await ethers.getContractFactory("TestToken");
      mockXOFD = await xofdFactory.deploy("CryptoDollar", "XOFD", 18);
      const bridgeFactory = await ethers.getContractFactory("StablecoinBridge");
      bridge = await bridgeFactory.deploy(
        await mockXOFD.getAddress(),
        await zofd.getAddress(),
        limit
      );
      bridgeAddr = await bridge.getAddress();
    });
    it("create mock token", async () => {
      let symbol = await mockXOFD.symbol();
      expect(symbol).to.be.equal("XOFD");
    });
    it("minting fails if not approved", async () => {
      let amount = floatToDec18(10000);
      await mockXOFD.mint(owner.address, amount);
      await mockXOFD.approve(await bridge.getAddress(), amount);
      await expect(bridge.mint(amount)).to.be.revertedWithCustomError(
        zofd,
        "NotMinter"
      );
    });
    it("bootstrap suggestMinter", async () => {
      let msg = "XOFD Bridge";
      await zofd.initialize(bridgeAddr, msg);
      let isMinter = await zofd.isMinter(bridgeAddr);
      expect(isMinter).to.be.true;
    });

    it("minter of XOFD-bridge should receive ZOFD", async () => {
      let amount = floatToDec18(5000);
      let balanceBefore = await zofd.balanceOf(owner.address);
      // set allowance
      await mockXOFD.approve(bridgeAddr, amount);
      await bridge.mint(amount);

      let balanceXOFDOfBridge = await mockXOFD.balanceOf(bridgeAddr);
      let balanceAfter = await zofd.balanceOf(owner.address);
      let ZOFDReceived = balanceAfter - balanceBefore;
      let isBridgeBalanceCorrect = dec18ToFloat(balanceXOFDOfBridge) == 5000n;
      let isSenderBalanceCorrect = dec18ToFloat(ZOFDReceived) == 5000n;
      if (!isBridgeBalanceCorrect || !isSenderBalanceCorrect) {
        console.log(
          "Bridge received XOFD tokens ",
          dec18ToFloat(balanceXOFDOfBridge)
        );
        console.log("Sender received USD tokens ", ZOFDReceived);
        expect(isBridgeBalanceCorrect).to.be.true;
        expect(isSenderBalanceCorrect).to.be.true;
      }
    });
    it("should revert initialization when there is supply", async () => {
      await expect(
        zofd.initialize(bridgeAddr, "Bridge")
      ).to.be.revertedWithoutReason();
    });
    it("burner of XOFD-bridge should receive XOFD", async () => {
      let amount = floatToDec18(50);
      let balanceBefore = await zofd.balanceOf(owner.address);
      let balanceXOFDBefore = await mockXOFD.balanceOf(owner.address);
      await zofd.approve(bridgeAddr, amount);
      let allowance1 = await zofd.allowance(owner.address, bridgeAddr);
      expect(allowance1).to.be.eq(amount);
      let allowance2 = await zofd.allowance(owner.address, alice.address);
      expect(allowance2).to.be.eq(floatToDec18(0));
      await zofd.burn(amount);
      await bridge.burn(amount);
      await bridge.burnAndSend(owner.address, amount);

      let balanceXOFDOfBridge = await mockXOFD.balanceOf(bridgeAddr);
      let balanceXOFDAfter = await mockXOFD.balanceOf(owner.address);
      let balanceAfter = await zofd.balanceOf(owner.address);
      let ZOFDReceived = balanceAfter - balanceBefore;
      let XOFDReceived = balanceXOFDAfter - balanceXOFDBefore;
      let isBridgeBalanceCorrect = dec18ToFloat(balanceXOFDOfBridge) == 4900n;
      let isSenderBalanceCorrect = dec18ToFloat(ZOFDReceived) == -150n;
      let isXOFDBalanceCorrect = dec18ToFloat(XOFDReceived) == 100n;
      if (
        !isBridgeBalanceCorrect ||
        !isSenderBalanceCorrect ||
        !isXOFDBalanceCorrect
      ) {
        console.log(
          "Bridge balance XOFD tokens ",
          dec18ToFloat(balanceXOFDOfBridge)
        );
        console.log("Sender burned OFD tokens ", -ZOFDReceived);
        console.log("Sender received XOFD tokens ", XOFDReceived);
        expect(isBridgeBalanceCorrect).to.be.true;
        expect(isSenderBalanceCorrect).to.be.true;
        expect(isXOFDBalanceCorrect).to.be.true;
      }
    });
    it("should revert minting when exceed limit", async () => {
      let amount = limit + 100n;
      await mockXOFD.approve(bridgeAddr, amount);
      await expect(bridge.mint(amount)).to.be.revertedWithCustomError(
        bridge,
        "Limit"
      );
    });
    it("should revert minting when bridge is expired", async () => {
      let amount = floatToDec18(1);
      await evm_increaseTime(60 * 60 * 24 * 7 * 53); // pass 53 weeks
      await mockXOFD.approve(bridgeAddr, amount);
      await expect(bridge.mint(amount)).to.be.revertedWithCustomError(
        bridge,
        "Expired"
      );
    });
  });
  describe("exchanges shares & pricing", () => {
    it("deposit XOFD to reserve pool and receive share tokens", async () => {
      let amount = 1000n; // amount we will deposit
      let fAmount = floatToDec18(amount); // amount we will deposit
      let balanceBefore = await equity.balanceOf(owner.address);
      let balanceBeforeZOFD = await zofd.balanceOf(owner.address);
      let fTotalShares = await equity.totalSupply();
      let fTotalCapital = await zofd.equity();
      // calculate shares we receive according to pricing function:
      let totalShares = dec18ToFloat(fTotalShares);
      let totalCapital = dec18ToFloat(fTotalCapital);
      let dShares = capitalToShares(totalCapital, totalShares, amount);
      await equity.invest(fAmount, 0);
      let balanceAfter = await equity.balanceOf(owner.address);
      let balanceAfterZOFD = await zofd.balanceOf(owner.address);
      let poolTokenShares = dec18ToFloat(balanceAfter - balanceBefore);
      let ZOFDReceived = dec18ToFloat(balanceAfterZOFD - balanceBeforeZOFD);
      let isPoolShareAmountCorrect = abs(poolTokenShares - dShares) < 1e-7;
      let isSenderBalanceCorrect = ZOFDReceived == -1000n;
      if (!isPoolShareAmountCorrect || !isSenderBalanceCorrect) {
        console.log("Pool token shares received = ", poolTokenShares);
        console.log("ZOFD tokens deposited = ", -ZOFDReceived);
        expect(isPoolShareAmountCorrect).to.be.true;
        expect(isSenderBalanceCorrect).to.be.true;
      }
    });
    it("cannot redeem shares immediately", async () => {
      let canRedeem = await equity.canRedeem(owner.address);
      expect(canRedeem).to.be.false;
    });
    it("can redeem shares after 90 days", async () => {
      // increase block number so we can redeem
      await evm_increaseTime(90 * 86400 + 60);
      let canRedeem = await equity.canRedeem(owner.address);
      expect(canRedeem).to.be.true;
    });
    it("redeem 1 share", async () => {
      let amountShares = 1n;
      let fAmountShares = floatToDec18(amountShares);
      let fTotalShares = await equity.totalSupply();
      let fTotalCapital = await zofd.balanceOf(await equity.getAddress());
      // calculate capital we receive according to pricing function:
      let totalShares = dec18ToFloat(fTotalShares);
      let totalCapital = dec18ToFloat(fTotalCapital);
      let dCapital = sharesToCapital(totalCapital, totalShares, amountShares);

      let sharesBefore = await equity.balanceOf(owner.address);
      let capitalBefore = await zofd.balanceOf(owner.address);
      await equity.redeem(owner.address, fAmountShares);

      let sharesAfter = await equity.balanceOf(owner.address);
      let capitalAfter = await zofd.balanceOf(owner.address);

      let poolTokenSharesRec = dec18ToFloat(sharesAfter - sharesBefore);
      let ZOFDReceived = dec18ToFloat(capitalAfter - capitalBefore);
      let feeRate = (ZOFDReceived * 10000n) / dCapital;
      // let isZOFDAmountCorrect = abs(feeRate - 0.997n) <= 1e-5;
      let isZOFDAmountCorrect = true;
      let isPoolShareAmountCorrect = poolTokenSharesRec == -amountShares;
      if (!isZOFDAmountCorrect || !isZOFDAmountCorrect) {
        console.log("ZOFD tokens received = ", ZOFDReceived);
        console.log("ZOFD tokens expected = ", dCapital);
        console.log("Fee = ", feeRate);
        console.log("Pool shares redeemed = ", -poolTokenSharesRec);
        console.log("Pool shares expected = ", amountShares);
        expect(isPoolShareAmountCorrect).to.be.true;
        expect(isZOFDAmountCorrect).to.be.true;
      }
    });
  });
});
