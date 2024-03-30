import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { deployContract, sleep } from "../deployUtils";
import { floatToDec18 } from "../../math";
import { StablecoinBridge } from "../../../typechain";
var prompt = require("prompt");

async function getAddress() {
  // local node address
  let addr = "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707";

  console.log("Is this address for MOCKOFD ok? [y,N]", addr);
  prompt.start();
  const { isOk } = await prompt.get(["isOk"]);
  if (isOk != "y" && isOk != "Y") {
    return "";
  }
  return addr;
}

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log('------ Deploying XOFD Bridge ------')
  const limit = 10_000_000;
  const {
    deployments: { get },
    ethers,
  } = hre;
  let xofdAddress;
  let applicationMsg;
  if (["hardhat", "localhost", "sepolia"].includes(hre.network.name)) {
    console.log("Setting Mock-XOFD-Token Bridge");
    try {
      const xofdDeployment = await get("TestToken");
      xofdAddress = xofdDeployment.address;
    } catch (err: unknown) {
      xofdAddress = await getAddress();
      if (xofdAddress == "") {
        throw err;
      }
    }

    applicationMsg = "MockXOFD Token Bridge";
  } else {
    console.log("Deploying XOFD-Token Bridge");
    xofdAddress = "0xb4272071ecadd69d933adcd19ca99fe80664fc08";
    applicationMsg = "XOFD Bridge";
  }
  const ZOFDDeployment = await get("OracleFreeDollar");
  let zofdContract = await ethers.getContractAt(
    "OracleFreeDollar",
    ZOFDDeployment.address
  );

  let dLimit = floatToDec18(limit);
  console.log("\nDeploying StablecoinBridge with limit = ", limit, "OFD");
  await deployContract(hre, "StablecoinBridge", [
    xofdAddress,
    ZOFDDeployment.address,
    dLimit,
  ]);

  // suggest minter
  const bridgeDeployment = await get("StablecoinBridge");
  let bridgeAddr: string = bridgeDeployment.address;

  console.log(
    `Verify StablecoinBridge:\nnpx hardhat verify --network sepolia ${bridgeAddr} ${xofdAddress} ${ZOFDDeployment.address} ${dLimit}\n`
  );

  let isAlreadyMinter = await zofdContract.isMinter(bridgeAddr);
  if (isAlreadyMinter) {
    console.log(bridgeDeployment.address, "already is a minter");
  } else {
    let msg = "XOFD Bridge";
    console.log(
      "Apply for the bridge ",
      bridgeDeployment.address,
      "to be minter via zofd.suggestMinter"
    );
    let tx = await zofdContract.initialize(bridgeDeployment.address, msg);
    console.log("tx hash = ", tx.hash);
    await tx.wait();
    let isMinter = false;
    let trial = 0;
    while (!isMinter && trial < 5) {
      console.log("Waiting 20s...");
      await sleep(20 * 1000);
      isMinter = await zofdContract.isMinter(bridgeAddr, {
        gasLimit: 1_000_000,
      });
      console.log("Is minter? ", isMinter);
      trial += 1;
    }
  }

  if (["hardhat", "localhost", "sepolia"].includes(hre.network.name)) {
    let amount = floatToDec18(20_000);
    const mockXOFD = await ethers.getContractAt("TestToken", xofdAddress);
    await mockXOFD.approve(bridgeAddr, amount);
    const bridge = await ethers.getContractAt("StablecoinBridge", bridgeAddr);
    await bridge.mint(amount);
  }
};
export default deploy;
deploy.tags = ["main", "XOFDBridge"];
