import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { deployContract } from "../deployUtils";

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await deployContract(hre, "TestToken", ["CryptoDollar", "XOFD", 18]);
};
export default deploy;
deploy.tags = ["MockTokens", "MockOFDToken"];
