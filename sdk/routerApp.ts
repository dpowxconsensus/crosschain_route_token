import { expect } from "chai";
import { ethers, upgrades, network } from "hardhat";
const { utils } = ethers;

export class RouterApp {
  chainId: string = "1";
  chainType: number = 0;
  validators: any = []; // for now any, will change it
  powers: any = [];
  valsetNonce: number = 0;
  RELAYER_ROUTER_ADDRESS =
    "router1hrpna9v7vs3stzyd4z3xf00676kf78zpe2u5ksvljswn2vnjp3ys8kpdc7";
  REQ_FROM_SOURCE_METHOD_NAME =
    "0x7265717565737446726f6d536f75726365000000000000000000000000000000";

  constructor() {
    // for now I am hardcoding validator and their powers and valsetNonce
    (async () => {
      const [validator] = await ethers.getSigners();
      this.validators = [validator.address];
      this.powers = [4294967295];
    })();
  }

  async deliver(dispatch, gateway) {
    const [validator] = await ethers.getSigners();

    const {
      applicationContract,
      eventIdentifier,
      srcChainParams,
      ackGasParam,
      destChainParams,
      destContractAddresses,
      payloads,
      ackType,
    } = dispatch.args;

    let caller = applicationContract; // contract address from where event is emitted

    caller = caller.toLowerCase();
    // console.log(caller, destContractAddresses[0]);

    const handlerBytes = destContractAddresses[0];

    let encoded_data = utils.defaultAbiCoder.encode(
      [
        "bytes32",
        "uint64",
        "uint64",
        "uint64",
        "string",
        "string",
        "uint64",
        "bytes",
        "bool",
        "uint64",
        "bytes[]",
        "bytes[]",
      ],
      [
        this.REQ_FROM_SOURCE_METHOD_NAME,
        eventIdentifier,
        srcChainParams.crossTalkNonce,
        srcChainParams.chainType,
        srcChainParams.chainId,
        srcChainParams.chainId,
        srcChainParams.chainType,
        caller,
        false,
        srcChainParams.expTimestamp,
        [handlerBytes],
        payloads,
      ]
    );
    const testBytes = utils.arrayify(encoded_data);
    const messageHash = utils.keccak256(testBytes);

    const messageHashBytes = utils.arrayify(messageHash);

    let sign = await validator.signMessage(messageHashBytes);
    let signature1 = utils.splitSignature(sign);

    let _sigs = [{ r: signature1.r, s: signature1.s, v: signature1.v }];

    let crossTalkPayload = {
      relayerRouterAddress: this.RELAYER_ROUTER_ADDRESS,
      isAtomic: srcChainParams.isAtomicCalls,
      eventIdentifier: eventIdentifier,
      expTimestamp: srcChainParams.expTimestamp,
      crossTalkNonce: srcChainParams.crossTalkNonce,
      sourceParams: {
        caller: caller,
        chainType: srcChainParams.chainType,
        chainId: srcChainParams.chainId,
      },
      contractCalls: {
        payloads,
        destContractAddresses: [handlerBytes],
      },
      isReadCall: false,
    };

    let _currentValset = {
      validators: this.validators,
      powers: this.powers,
      valsetNonce: this.valsetNonce,
    };

    await gateway.requestFromSource(_currentValset, _sigs, crossTalkPayload);
  }

  async processOutbound(gateway) {
    const reqToRouterFilter = gateway.filters.RequestToDestEvent();
    const dispatches = await gateway.queryFilter(reqToRouterFilter);
    // console.log(dispatches);
    for (const dispatch of dispatches) {
      // we can create inbox class for keeping track of message
      const { eventIdentifier } = dispatch.args;

      // check from inbox that eventIdentifier is processed or not
      //   then

      await this.deliver(dispatch, gateway);
    }
  }

  // it will deploy core contracts for cross-talk
  async deploy(signer) {
    // let's  deploy gateway contract
    const Gateway = await ethers.getContractFactory("GatewayUpgradeable");
    const gateway = await Gateway.connect(signer).deploy();
    await gateway.deployed();
    await gateway.initialize(
      this.chainId,
      this.chainType,
      this.validators,
      this.powers,
      this.valsetNonce
    );

    return gateway;
  }
}
