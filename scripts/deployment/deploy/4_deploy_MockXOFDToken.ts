import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { deployContract } from "../deployUtils";

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("------ Deploying Mock OFD Token ------");
  await deployContract(hre, "TestToken", ["CryptoFranc", "XOFD", 18]);
};
export default deploy;
deploy.tags = ["MockTokens", "MockOFDToken"];
