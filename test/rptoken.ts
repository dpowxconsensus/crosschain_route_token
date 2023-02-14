import chai, { assert } from "chai";
const { expect } = chai;
const { ethers, upgrades } = require("hardhat");
import { RouterApp } from "./../sdk";

// const BigNumber = require("bignumber.js");
const { BigNumber } = ethers;
chai.use(require("chai-bignumber")(BigNumber));

describe("Router Token", function () {
  let localProvider;
  let remoteProvider;

  let localSigner;
  let remoteSigner;

  let router;
  let localGateway;
  let remoteGateway;

  let localRPTokenProxy;
  let remoteRPTokenProxy;

  const _totalSupply = 10000;
  const _dstGastLimit = 1000000;
  const gasLimit = 1000000;
  const LOCAL_CHAIN_ID: string = "1";
  const REMOTE_CHAIN_ID: string = "2";

  const CHAIN_TYPE: number = 0;

  before(async () => {
    router = new RouterApp();

    // local and remote signer
    [localSigner] = await ethers.getSigners();
    [remoteSigner] = await ethers.getSigners();
    localProvider = remoteProvider = localSigner.provider;

    // let's deploy core contract here
    localGateway = remoteGateway = await router.deploy(localSigner);

    const RouterProtocol = await ethers.getContractFactory("RouterProtocol");

    localRPTokenProxy = await upgrades.deployProxy(
      await RouterProtocol.connect(localSigner),
      [localGateway.address, _dstGastLimit, _totalSupply]
    );
    await localRPTokenProxy.deployed();

    remoteRPTokenProxy = await upgrades.deployProxy(
      await RouterProtocol.connect(remoteSigner),
      [remoteGateway.address, _dstGastLimit, _totalSupply]
    );
    await remoteRPTokenProxy.deployed();

    // enroll remote
    await localRPTokenProxy.setContractOnChain(
      CHAIN_TYPE,
      REMOTE_CHAIN_ID,
      remoteRPTokenProxy.address,
      { gasLimit }
    );

    await remoteRPTokenProxy.setContractOnChain(
      CHAIN_TYPE,
      LOCAL_CHAIN_ID,
      localRPTokenProxy.address,
      { gasLimit }
    );
  });

  beforeEach(async function () {});

  it("gateway Setup and nft deployment to chains", () => {});

  it("cross chain token transfer", async function () {
    // for testing just comment if block at line 490 in GatewayUpgradeable.sol in evm node module, I will figure out the errors
    /*
              if (block.timestamp > crossTalkPayload.expTimestamp) 
    */

    // _totalSupply should be minted to localSigner
    const expectedBalance = await BigNumber.from("10000000000000000000000");

    assert(
      await localRPTokenProxy.balanceOf(localSigner.address),
      expectedBalance
    );

    const expiryDurationInSeconds = 0; // for infinity
    const destGasPrice = await remoteProvider.getGasPrice();
    const to = localSigner.address;
    const amount = 100;
    const tx = await localRPTokenProxy
      .connect(localSigner)
      .sendRPTokenCrossChain(
        CHAIN_TYPE,
        REMOTE_CHAIN_ID,
        expiryDurationInSeconds,
        destGasPrice,
        to,
        amount,
        {
          gasPrice: await localProvider.getGasPrice(),
          gasLimit,
        }
      );
    await tx.wait();
    await router.processOutbound(localGateway);

    assert(
      await remoteRPTokenProxy.balanceOf(localSigner.address),
      expectedBalance.add(amount)
    );
  });
});
