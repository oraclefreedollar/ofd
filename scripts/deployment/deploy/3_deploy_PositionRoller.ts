import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { deployContract } from "../deployUtils";

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { get },
  } = hre;
  const ofdAddress = ''

  if(ofdAddress.length === 0) {
    throw new Error("OFD address is not set, please set it in the script");
  }

  await deployContract(hre, "PositionRoller", [ofdAddress]);

  const positionRollerDeployment = await get("PositionRoller");
  console.log(
    `Verify PositionRoller:\nnpx hardhat verify --network bnbtestnet ${positionRollerDeployment.address} ${ofdAddress} \n`
  );
};
export default deploy;
deploy.tags = ["main", "PositionRoller"];
