import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "console";

import deploy from "./../deploy/artifacts/deploy.json";

const { ethers } = require("hardhat");

import {
  abi,
  bytecode,
} from "../artifacts/contracts/RouterToken.sol/RouterProtocol.json";

import config from "../constants/config";
import { network } from "hardhat";

async function main() {
  const localChain = "polygonmumbai";
  const remoteChain = "goerli";
  const jsonURLLocalChain =
    "https://polygon-mumbai.g.alchemy.com/v2/mTfNmVbF3-tovNs2n5vUpUzy4BfXAVcg";
  const jsonURLRemoteChain =
    "https://goerli.infura.io/v3/f4d139222fce4c03963c4145d0a30260";
  const localChainId = config[localChain].chainId;
  const remoteChainId = config[remoteChain].chainId;
  const localChainType = config[localChain].chainType;
  const remoteChainType = config[remoteChain].chainType;

  let signerOrigin: SignerWithAddress;
  let signerRemote: SignerWithAddress;

  let remoteChainProvider;
  let localChainProvider;

  let rpTokenSrcContract: any;
  let rpTokenDstContract: any;

  let signer: SignerWithAddress;

  let tx;
  let nftOwner;
  let txReceipt;
  let tokenId;

  const setup = async () => {
    signer = ethers.Wallet.fromMnemonic(process.env.MNEMONIC);
    localChainProvider = new ethers.providers.JsonRpcProvider(
      jsonURLLocalChain
    );
    remoteChainProvider = new ethers.providers.JsonRpcProvider(
      jsonURLRemoteChain
    );

    signerOrigin = signer.connect(localChainProvider);
    signerRemote = signer.connect(remoteChainProvider);

    rpTokenSrcContract = await ethers.getContractAt(
      abi,
      deploy[localChain],
      signerOrigin
    );

    rpTokenDstContract = await ethers.getContractAt(
      abi,
      deploy[remoteChain],
      signerRemote
    );
  };

  const testNFTFLOW = async () => {
    const balanceOnDstBeforeTransfer = await rpTokenDstContract
      .connect(signerRemote)
      .balanceOf(signer.address);
    // let's transfer token token from src to dst
    const expiryDurationInSeconds = 0; // for infinity
    const destGasPrice = await remoteChainProvider.getGasPrice();
    const to = signer.address;
    const amount = ethers.BigNumber.from("1000000000000000000");
    const tx = await rpTokenSrcContract
      .connect(signerOrigin)
      .sendRPTokenCrossChain(
        remoteChainType,
        remoteChainId,
        expiryDurationInSeconds,
        destGasPrice,
        to,
        amount,
        {
          gasLimit: 100000,
        }
      );
    console.log("Crosschain Transfer: tx sent with hash ", tx.hash);
    await tx.wait();
    console.log("Crosschain Transfer: went successful");
    // on src chain balance should be decreased by amount
    const balanceOnSrc = await rpTokenSrcContract
      .connect(signerOrigin)
      .balanceOf(signer.address);
    assert(
      await rpTokenSrcContract.connect(signerOrigin).balanceOf(signer.address),
      balanceOnSrc.sub(amount)
    );

    // wait here before checking it on destination chain as it will check some time to relay message to dstchain

    assert(
      await rpTokenDstContract.connect(signerRemote).balanceOf(signer.address),
      balanceOnDstBeforeTransfer.add(amount)
    );
  };

  setup()
    .then(async () => {
      console.log("Setup completed !!");
      await testNFTFLOW();
    })
    .catch(console.log);
}

main()
  .then(() => console.info("Test completed cross chain !!"))
  .catch(console.error);
