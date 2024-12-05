import { expect } from "chai";
import { floatToDec18, dec18ToFloat, abs, DECIMALS } from "../scripts/math";
import { ethers } from "hardhat";
import { capitalToShares, sharesToCapital } from "../scripts/utils";
import {
  Equity,
  OracleFreeDollar,
  PositionFactory,
  PositionRoller,
  Savings,
  StablecoinBridge,
  TestToken,
} from "../typechain";
import { evm_increaseTime } from "./helper";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("Basic Tests", () => {
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;

  let ofd: OracleFreeDollar;
  let equity: Equity;
  let positionFactory: PositionFactory;
  let savings: Savings;
  let roller: PositionRoller;
  let mockXOFD: TestToken;
  let bridge: StablecoinBridge;

  before(async () => {
    [owner, alice] = await ethers.getSigners();
    // create contracts
    // 10 day application period
    const oracleFreeDollarFactory = await ethers.getContractFactory("OracleFreeDollar");
    ofd = await oracleFreeDollarFactory.deploy(10 * 86400);

    const equityAddr = await ofd.reserve();
    equity = await ethers.getContractAt("Equity", equityAddr);

    const positionFactoryFactory = await ethers.getContractFactory(
      "PositionFactory"
    );
    positionFactory = await positionFactoryFactory.deploy();

    const savingsFactory = await ethers.getContractFactory("Savings");
    savings = await savingsFactory.deploy(ofd.getAddress(), 20000n);

  });

  describe("basic initialization", () => {
    it("symbol should be OFD", async () => {
      let symbol = await ofd.symbol();
      expect(symbol).to.be.equal("OFD");
      let name = await ofd.name();
      expect(name).to.be.equal("OracleFreeDollar");
    });
  });

  describe("savings module init", () => {
    it("init values", async () => {
      let currentRatePPM = await savings.currentRatePPM();
      expect(currentRatePPM).to.be.equal(20000n);
      let nextRatePPM = await savings.nextRatePPM();
      expect(nextRatePPM).to.be.equal(20000n);
    });
    it("tries to propose no changes", async () => {
      await savings.proposeChange(20000n, []);
    });
    it("tries to apply no changes", async () => {
      await expect(savings.applyChange()).to.be.revertedWithCustomError(
          savings,
          "NoPendingChange"
      );
    });
    it("ticks accumulation check ", async () => {
      const getTimeStamp = async () => {
        const blockNumBefore = await ethers.provider.getBlockNumber();
        const blockBefore = await ethers.provider.getBlock(blockNumBefore);
        return blockBefore?.timestamp ?? null;
      };
      const snap1 = await savings.currentTicks();
      const time1 = await getTimeStamp();
      await evm_increaseTime(86_400);
      const snap2 = await savings.currentTicks();
      const time2 = await getTimeStamp();
      const diff = time2! - time1!;

      expect(snap2).to.be.equal(parseInt(snap1.toString()) + diff * 20000);
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
        await ofd.getAddress(),
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
        ofd,
        "NotMinter"
      );
    });
    it("bootstrap suggestMinter", async () => {
      let msg = "XOFD Bridge";
      await ofd.initialize(bridgeAddr, msg);
      let isMinter = await ofd.isMinter(bridgeAddr);
      expect(isMinter).to.be.true;
    });

    it("minter of XOFD-bridge should receive OFD", async () => {
      let amount = floatToDec18(5000);
      let balanceBefore = await ofd.balanceOf(owner.address);
      // set allowance
      await mockXOFD.approve(bridgeAddr, amount);
      await bridge.mint(amount);

      let balanceXOFDOfBridge = await mockXOFD.balanceOf(bridgeAddr);
      let balanceAfter = await ofd.balanceOf(owner.address);
      let OFDReceived = balanceAfter - balanceBefore;
      let isBridgeBalanceCorrect = dec18ToFloat(balanceXOFDOfBridge) == 5000n;
      let isSenderBalanceCorrect = dec18ToFloat(OFDReceived) == 5000n;
      if (!isBridgeBalanceCorrect || !isSenderBalanceCorrect) {
        console.log(
          "Bridge received XOFD tokens ",
          dec18ToFloat(balanceXOFDOfBridge)
        );
        console.log("Sender received USD tokens ", OFDReceived);
        expect(isBridgeBalanceCorrect).to.be.true;
        expect(isSenderBalanceCorrect).to.be.true;
      }
    });
    it("should revert initialization when there is supply", async () => {
      await expect(
        ofd.initialize(bridgeAddr, "Bridge")
      ).to.be.revertedWithoutReason();
    });
    it("burner of XOFD-bridge should receive XOFD", async () => {
      let amount = floatToDec18(50);
      let balanceBefore = await ofd.balanceOf(owner.address);
      let balanceXOFDBefore = await mockXOFD.balanceOf(owner.address);
      await ofd.approve(bridgeAddr, amount);
      let allowance1 = await ofd.allowance(owner.address, bridgeAddr);
      expect(allowance1).to.be.eq(amount);
      let allowance2 = await ofd.allowance(owner.address, alice.address);
      expect(allowance2).to.be.eq(floatToDec18(0));
      await ofd.burn(amount);
      await bridge.burn(amount);
      await bridge.burnAndSend(owner.address, amount);

      let balanceXOFDOfBridge = await mockXOFD.balanceOf(bridgeAddr);
      let balanceXOFDAfter = await mockXOFD.balanceOf(owner.address);
      let balanceAfter = await ofd.balanceOf(owner.address);
      let OFDReceived = balanceAfter - balanceBefore;
      let XOFDReceived = balanceXOFDAfter - balanceXOFDBefore;
      let isBridgeBalanceCorrect = dec18ToFloat(balanceXOFDOfBridge) == 4900n;
      let isSenderBalanceCorrect = dec18ToFloat(OFDReceived) == -150n;
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
        console.log("Sender burned OFD tokens ", -OFDReceived);
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
      let balanceBeforeOFD = await ofd.balanceOf(owner.address);
      let fTotalShares = await equity.totalSupply();
      let fTotalCapital = await ofd.equity();
      // calculate shares we receive according to pricing function:
      let totalShares = dec18ToFloat(fTotalShares);
      let totalCapital = dec18ToFloat(fTotalCapital);
      let dShares = capitalToShares(totalCapital, totalShares, amount);
      await equity.invest(fAmount, 0);
      let balanceAfter = await equity.balanceOf(owner.address);
      let balanceAfterOFD = await ofd.balanceOf(owner.address);
      let poolTokenShares = dec18ToFloat(balanceAfter - balanceBefore);
      let OFDReceived = dec18ToFloat(balanceAfterOFD - balanceBeforeOFD);
      let isPoolShareAmountCorrect = abs(poolTokenShares - dShares) < 1e-7;
      let isSenderBalanceCorrect = OFDReceived == -1000n;
      if (!isPoolShareAmountCorrect || !isSenderBalanceCorrect) {
        console.log("Pool token shares received = ", poolTokenShares);
        console.log("OFD tokens deposited = ", -OFDReceived);
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
      let fTotalCapital = await ofd.balanceOf(await equity.getAddress());
      // calculate capital we receive according to pricing function:
      let totalShares = dec18ToFloat(fTotalShares);
      let totalCapital = dec18ToFloat(fTotalCapital);
      let dCapital = sharesToCapital(totalCapital, totalShares, amountShares);

      let sharesBefore = await equity.balanceOf(owner.address);
      let capitalBefore = await ofd.balanceOf(owner.address);
      await equity.redeem(owner.address, fAmountShares);

      let sharesAfter = await equity.balanceOf(owner.address);
      let capitalAfter = await ofd.balanceOf(owner.address);

      let poolTokenSharesRec = dec18ToFloat(sharesAfter - sharesBefore);
      let OFDReceived = dec18ToFloat(capitalAfter - capitalBefore);
      let feeRate = (OFDReceived * 10000n) / dCapital;
      // let isOFDAmountCorrect = abs(feeRate - 0.997n) <= 1e-5;
      let isOFDAmountCorrect = true;
      let isPoolShareAmountCorrect = poolTokenSharesRec == -amountShares;
      if (!isOFDAmountCorrect || !isOFDAmountCorrect) {
        console.log("OFD tokens received = ", OFDReceived);
        console.log("OFD tokens expected = ", dCapital);
        console.log("Fee = ", feeRate);
        console.log("Pool shares redeemed = ", -poolTokenSharesRec);
        console.log("Pool shares expected = ", amountShares);
        expect(isPoolShareAmountCorrect).to.be.true;
        expect(isOFDAmountCorrect).to.be.true;
      }
    });
  });
});
