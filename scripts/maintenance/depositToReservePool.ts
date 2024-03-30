/*
    Script to deposit ZOFD to reserve pool
    1) set private key in terminal without 0x, via export PK="123cafefefefefeCACe..."
        action will be done for that wallet
    2) edit script if needed
    4) ts-node scripts/maintenance/depositToReservePool.ts
*/
const ethers = require("ethers");
import { SigningKey } from "@ethersproject/signing-key";
import { floatToDec18, dec18ToFloat } from "../math";
const NODE_URL = "https://rpc.sepolia.org";
const ERC20_ABI = require('../../abi/MockXOFDToken.json');
const ZOFD_ABI = require('../../abi/OracleFreeDollar.json');
const EQUITY_ABI = require('../../abi/Equity.json');

const BRIDGE_ABI = require('../../abi/StablecoinBridge.json');
const mockXOFDAddr = "0x081AEb4c123DF59a31890E038A1cCCAa32F41616";
const ZOFDAddr = "0x079909c5191fffF4AB4Ad7889B34821D4CE35f6b";

let pk: string | SigningKey = <string>process.env.PK;

export async function getSigningManagerFromPK(ctrAddr, ctrAbi, nodeUrl, pk) {
    const provider = new ethers.providers.JsonRpcProvider(nodeUrl);
    const wallet = new ethers.Wallet(pk);
    const signer = wallet.connect(provider);
    const signingContractManager = new ethers.Contract(ctrAddr, ctrAbi, signer);
    return signingContractManager;
}

async function depositZOFD(amountZOFD : number) {

    let ZOFDContract = await getSigningManagerFromPK(ZOFDAddr, ZOFD_ABI, NODE_URL, pk);
    let reserveAddress = await ZOFDContract.reserve();
    let equityContract = await getSigningManagerFromPK(reserveAddress, EQUITY_ABI, NODE_URL, pk);
    let fOldBalanceZOFD = await ZOFDContract.balanceOf(reserveAddress);
    let fOldBalancePoolShareTokens = await equityContract.totalSupply();

    console.log("Reserve (ZOFD) before =", dec18ToFloat(fOldBalanceZOFD));
    console.log("Pool Shares before =", dec18ToFloat(fOldBalancePoolShareTokens));
    let tx = await ZOFDContract.transferAndCall(reserveAddress, floatToDec18(amountZOFD), 0);
    await tx.wait();
    console.log("tx = ", tx);
    let fNewBalanceZOFD = await ZOFDContract.balanceOf(reserveAddress);
    let fNewBalancePoolShareTokens = await equityContract.totalSupply();
    console.log("Reserve (ZOFD) after =", dec18ToFloat(fNewBalanceZOFD));
    console.log("Pool Shares after =", dec18ToFloat(fNewBalancePoolShareTokens));

}
async function start() {
    let amountZOFD = 500; // how much ZOFD do we deposit to reserve from your wallet (=Equity contract)
    await depositZOFD(amountZOFD);
}
start();
