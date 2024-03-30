import { expect } from "chai";
import { floatToDec18 } from "../scripts/math";
import { ethers } from "hardhat";
import { OracleFreeDollar, StablecoinBridge, TestToken } from "../typechain";
import { evm_increaseTime } from "./helper";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("Plugin Veto Tests", () => {
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;

  let bridge: StablecoinBridge;
  let secondBridge: StablecoinBridge;
  let zofd: OracleFreeDollar;
  let mockXOFD: TestToken;
  let mockDOFD: TestToken;

  before(async () => {
    [owner, alice] = await ethers.getSigners();
    // create contracts
    const oracleFreeDollarFactory = await ethers.getContractFactory("OracleFreeDollar");
    zofd = await oracleFreeDollarFactory.deploy(10 * 86400);

    // mocktoken
    const xchfFactory = await ethers.getContractFactory("TestToken");
    mockXOFD = await xchfFactory.deploy("CryptoFranc", "XOFD", 18);
    // mocktoken bridge to bootstrap
    let limit = floatToDec18(100_000);
    const bridgeFactory = await ethers.getContractFactory("StablecoinBridge");
    bridge = await bridgeFactory.deploy(
      await mockXOFD.getAddress(),
      await zofd.getAddress(),
      limit
    );
    await zofd.initialize(await bridge.getAddress(), "");
    // wait for 1 block
    await evm_increaseTime(60);
    // now we are ready to bootstrap ZOFD with Mock-XOFD
    await mockXOFD.mint(owner.address, limit / 2n);
    await mockXOFD.mint(alice.address, limit / 2n);
    // mint some ZOFD to block bridges without veto
    let amount = floatToDec18(20_000);
    await mockXOFD.connect(alice).approve(await bridge.getAddress(), amount);
    await bridge.connect(alice).mint(amount);
    // owner also mints some to be able to veto
    await mockXOFD.approve(await bridge.getAddress(), amount);
    await bridge.mint(amount);
  });

  describe("create secondary bridge plugin", () => {
    it("create mock DOFD token&bridge", async () => {
      let limit = floatToDec18(100_000);
      const xofdFactory = await ethers.getContractFactory("TestToken");
      mockDOFD = await xofdFactory.deploy("Test Name", "Symbol", 18);
      await mockDOFD.mint(alice.address, floatToDec18(100_000));

      const bridgeFactory = await ethers.getContractFactory("StablecoinBridge");
      secondBridge = await bridgeFactory.deploy(
        await mockDOFD.getAddress(),
        await zofd.getAddress(),
        limit
      );
    });
    it("Participant suggests minter", async () => {
      let applicationPeriod = await zofd.MIN_APPLICATION_PERIOD();
      let applicationFee = await zofd.MIN_FEE();
      let msg = "DOFD Bridge";
      await mockXOFD
        .connect(alice)
        .approve(await zofd.getAddress(), applicationFee);
      let balance = await zofd.balanceOf(alice.address);
      expect(balance).to.be.greaterThan(applicationFee);
      await expect(
        zofd
          .connect(alice)
          .suggestMinter(
            await secondBridge.getAddress(),
            applicationPeriod,
            applicationFee,
            msg
          )
      ).to.emit(zofd, "MinterApplied");
    });
    it("can't mint before min period", async () => {
      let amount = floatToDec18(1_000);
      await mockDOFD
        .connect(alice)
        .approve(await secondBridge.getAddress(), amount);
      // set allowance
      await expect(
        secondBridge.connect(alice).mint(amount)
      ).to.be.revertedWithCustomError(zofd, "NotMinter");
    });
    it("deny minter", async () => {
      await expect(
        zofd.denyMinter(await secondBridge.getAddress(), [], "other denied")
      ).to.emit(zofd, "MinterDenied");
      await expect(
        secondBridge.connect(alice).mint(floatToDec18(1_000))
      ).to.be.revertedWithCustomError(zofd, "NotMinter");
    });
  });
});
