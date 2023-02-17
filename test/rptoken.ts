import chai, { assert } from "chai";
const { expect } = chai;
const { ethers, upgrades } = require("hardhat");
import { RouterApp } from "./../sdk";
import { MultiProvider } from "./../sdk";
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
    // local and remote signer
    [localSigner] = await ethers.getSigners();
    [remoteSigner] = await ethers.getSigners();
    localProvider = remoteProvider = localSigner.provider;

    // Getting multiprovider here for two chain
    const multiProvider = new MultiProvider({
      chainA: {
        signer: localSigner,
        chainId: LOCAL_CHAIN_ID,
        chainType: CHAIN_TYPE,
        provider: await ethers.getDefaultProvider(),
      },
      chainB: {
        signer: remoteSigner,
        chainId: REMOTE_CHAIN_ID,
        chainType: CHAIN_TYPE,
        provider: await ethers.getDefaultProvider(),
      },
    });

    // now be have providers let's setup core contract on each
    router = new RouterApp(multiProvider);
    const chainMap = await router.setup();

    localGateway = chainMap["chainA"].gateway;
    remoteGateway = chainMap["chainB"].gateway;

    // Router Protocol Token Contract, deploying contract on local chain from remote chain
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

    // enroll remote on both local chain and remote chain
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

  it("gateway Setup and router token deployment to chains", () => {});

  it("cross chain token transfer", async function () {
    // _totalSupply should be minted to localSigner
    const expectedBalance = await BigNumber.from("10000000000000000000000");

    assert(
      (await localRPTokenProxy.balanceOf(localSigner.address)).eq(
        expectedBalance
      ),
      "Intial supply is not minted to sender"
    );

    const expiryDurationInSeconds = 0; // for infinity
    const destGasPrice = await remoteProvider.getGasPrice();
    const to = localSigner.address;
    const amount = 1000;
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

    // processing outBound message to destination chain
    await router.processOutbound(localGateway, remoteGateway);

    assert(
      (await remoteRPTokenProxy.balanceOf(localSigner.address)).eq(
        expectedBalance.add(amount)
      ),
      "Balance not updated on dst chain"
    );
  });
});
