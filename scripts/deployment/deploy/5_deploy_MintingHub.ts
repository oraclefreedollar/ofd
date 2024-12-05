import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { deployContract } from "../deployUtils";

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { get },
    ethers,
  } = hre;

  const ofdAddress: string = ''
  const positionFactoryAddress: string = '';
  const positionRollerAddress: string = '';
  const savingsAddress: string = '';

  if(ofdAddress.length === 0 || positionFactoryAddress.length === 0 || positionRollerAddress.length === 0 || savingsAddress.length === 0) {
    throw new Error("OFD or Position Factory address is not set, please set it in the script");
  }

  let ofdContract = await ethers.getContractAt("OracleFreeDollar", ofdAddress);

  let mintingHubContract = await deployContract(hre, "MintingHub", [
    ofdAddress,
    savingsAddress,
    positionRollerAddress,
    positionFactoryAddress,
  ]);

  const mintingHubAddress= await mintingHubContract.getAddress();

  //let mintingHubContract = await get("MintingHub");

  console.log(`Verify mintingHubContract: npx hardhat verify --network bnbtestnet ${mintingHubAddress} ${ofdAddress} ${savingsAddress} ${positionRollerAddress} ${positionFactoryAddress} \n`);

  // create a minting hub too while we have no OFD supply
  try {
    let txSavings = await ofdContract.initialize(savingsAddress, "Savings");
    await txSavings.wait();

    let txPositionFactory = await ofdContract.initialize(positionFactoryAddress, "Position Factory");
    await txPositionFactory.wait();

    let txPositionRoller = await ofdContract.initialize(positionRollerAddress, "Position Roller");
    await txPositionRoller.wait();

    let txMintingHub = await ofdContract.initialize(mintingHubAddress, "Minting Hub V2");
    await txMintingHub.wait();
  } catch (err) {
    console.log("Suggest minter failed, probably already registered:");
    console.error(err);
  }
};
export default deploy;
deploy.tags = ["main", "MintingHub"];
