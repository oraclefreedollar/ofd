import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { deployContract } from "../deployUtils";

/*
    //see package.json
    export PK=12...
    // deploy according to config (see package.json), e.g.,
    npm run redeploynotesttoken:network sepolia
    // mint OFD via scripts/maintenance/mintOFD.ts (adjust StableCoinBridge address in mintOFD.ts header)
    ts-node scripts/maintenance/mintOFD.ts
    // verify on https://sepolia.arbiscan.io/
    // deploy positions (inspect script A_deploy_...)
    npm run-script deployPositions:network sepolia
*/
const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const paramFile = "paramsOracleFreeDollar.json";
  let chainId = hre.network.config["chainId"];
  let paramsArr = require(__dirname + `/../parameters/${paramFile}`);

  // find config for current chain
  for (var k = 0; k < paramsArr.length && paramsArr[k].chainId != chainId; k++);
  let params = paramsArr[k];
  if (chainId != params.chainId) {
    throw new Error("ChainId doesn't match");
  }

  let minApplicationPeriod = params["minApplicationPeriod"];
  console.log("\nMin application period =", minApplicationPeriod);

  let OFD = await deployContract(hre, "OracleFreeDollar", [minApplicationPeriod]);
  console.log(
    `Verify OracleFreeDollar:\nnpx hardhat verify --network sepolia ${await OFD.getAddress()} ${minApplicationPeriod}`
  );

  let reserve = await OFD.reserve();
  console.log(
    `Verify Equity:\nnpx hardhat verify --network sepolia ${reserve} ${await OFD.getAddress()}\n`
  );
};
export default deploy;
deploy.tags = ["main", "OracleFreeDollar"];
