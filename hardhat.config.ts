import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-network-helpers";
import "hardhat-deploy";
import "hardhat-abi-exporter";
import "hardhat-contract-sizer";

import dotenv from "dotenv";
import {SigningKey} from '@ethersproject/signing-key'
dotenv.config();

let pk: string | SigningKey = <string>process.env.SEPOLIA_PK;
let etherscanapikey: string = <string>process.env.SEPOLIA_API_KEY;
let bnbTestnetApiKey: string = <string>process.env.BNBTESTNET_API_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      outputSelection: {
        "*": {
          "*": ["storageLayout"],
        },
      },
    },
  },
  networks: {
    bscMainnet:{
      url: "https://bsc-dataseed.bnbchain.org/",
      chainId: 56,
      gas: 50_000,
      gasPrice: "auto",
      accounts: [pk],
      timeout: 50_000,
    },
    bnbtestnet:{
        url: "https://data-seed-prebsc-1-s1.binance.org:8545/",
        chainId: 97,
        gas: 50_000,
        gasPrice: "auto",
        accounts: [pk],
        timeout: 50_000,
    },
    sepolia: {
      url: "https://arbitrum-sepolia.infura.io/v3/f283aed9f80f4f91bc513c27e2da9b1e",
      chainId: 421614,
      gas: 50_000,
      gasPrice: "auto",
      accounts: [pk],
      timeout: 50_000,
    },
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
  },
  etherscan: {
    apiKey: {
      bsc: etherscanapikey,
      bscTestnet: etherscanapikey,
      sepolia: etherscanapikey,
      arbitrumOne: etherscanapikey,
      arbitrumGoerli: etherscanapikey,
      arbitrumSepolia: etherscanapikey,
    },
    customChains: [
      {
        network: "sepolia",
        chainId: 421614,
        urls: {
          apiURL: "https://api-sepolia.arbiscan.io/api",
          browserURL: "https://sepolia.arbiscan.io/",
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
    deploy: "./scripts/deployment/deploy",
    deployments: "./scripts/deployment/deployments",
  },
  contractSizer: {
    alphaSort: false,
    runOnCompile: false,
    disambiguatePaths: false,
  },
  gasReporter: {
    enabled: true,
    currency: "USD",
  },
  abiExporter: {
    path: "./abi",
    clear: true,
    runOnCompile: true,
    flat: true,
    spacing: 4,
    pretty: false,
  },
  mocha: {
    timeout: 120000,
  },
  typechain: {
    outDir: "typechain",
    target: "ethers-v6",
  },
};

export default config;
