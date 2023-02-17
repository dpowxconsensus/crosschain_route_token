import { ethers, upgrades, network } from "hardhat";
import { MultiProvider } from "./providers/MultiProvider";
import { ChainName } from "./types";
import { MultiGeneric } from "./utils/MultiGeneric";
const { utils } = ethers;
import { Gateway_Factory } from "./core/contracts";
import { Door } from "./core/door";

export class RouterApp {
  // door -> to keep track of event which went throught door or not
  door: Door;
  multiProvider: MultiProvider;

  validators: any = []; // for now any, will change it
  powers: number[] = [];
  valsetNonce: number = 0;
  RELAYER_ROUTER_ADDRESS =
    "router1hrpna9v7vs3stzyd4z3xf00676kf78zpe2u5ksvljswn2vnjp3ys8kpdc7";
  REQ_FROM_SOURCE_METHOD_NAME =
    "0x7265717565737446726f6d536f75726365000000000000000000000000000000";

  constructor(multiProvider: MultiProvider) {
    this.multiProvider = multiProvider;
    this.door = new Door();
    // for now I am hardcoding validator and their powers and valsetNonce
    (async () => {
      const [validator] = await ethers.getSigners();
      this.validators = [validator.address];
      this.powers = [4294967295];
    })();
  }

  async deliver(dispatch, remoteGateway) {
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

    const handlerBytes = destContractAddresses[0];

    let encoded_data = utils.defaultAbiCoder.encode(
      [
        "bytes32", // REQUEST_FROM_SOURCE_METHOD_NAME
        "uint64", // crossTalkPayload.eventIdentifier
        "uint64", // crossTalkPayload.crossTalkNonce
        "uint64", // dst chainType
        "string", // dst chainId
        "string", // crossTalkPayload.sourceParams.chainId,
        "uint64", // crossTalkPayload.sourceParams.chainType
        "bytes", // crossTalkPayload.sourceParams.caller
        "bool", // crossTalkPayload.isAtomic
        "uint64", // crossTalkPayload.expTimestamp,
        "bytes[]", // crossTalkPayload.contractCalls.destContractAddresses
        "bytes[]", // crossTalkPayload.contractCalls.payloads
      ],
      [
        this.REQ_FROM_SOURCE_METHOD_NAME,
        eventIdentifier,
        srcChainParams.crossTalkNonce,
        destChainParams.destChainType,
        destChainParams.destChainId,
        srcChainParams.chainId,
        srcChainParams.chainType,
        caller,
        srcChainParams.isAtomicCalls,
        srcChainParams.expTimestamp,
        destContractAddresses,
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
        destContractAddresses,
      },
      isReadCall: false,
    };

    let _currentValset = {
      validators: this.validators,
      powers: this.powers,
      valsetNonce: this.valsetNonce,
    };

    await (
      await remoteGateway.requestFromSource(
        _currentValset,
        _sigs,
        crossTalkPayload
      )
    ).wait();
  }

  async processOutbound(localGateway, remoteGateway) {
    // we can create utils for event
    const reqToRouterFilter = localGateway.filters.RequestToDestEvent();
    const dispatches = await localGateway.queryFilter(reqToRouterFilter);

    for (const dispatch of dispatches) {
      const { eventIdentifier } = dispatch.args;
      if (this.door.isOpened(eventIdentifier)) {
        await this.deliver(dispatch, remoteGateway);
        this.door.close(eventIdentifier, dispatch);
      }
    }
  }

  // it will deploy core [Gateway] contracts for cross-talk
  async setup() {
    const chainMap = {};
    await Promise.all(
      Object.keys(this.multiProvider.chainMap).map(async (chain) => {
        const connection = this.multiProvider.chainMap[chain];

        const gateway = await (await Gateway_Factory)
          .connect(connection.signer)
          .deploy();
        await gateway.initialize(
          connection.chainId,
          connection.chainType,
          this.validators,
          this.powers,
          this.valsetNonce
        );
        chainMap[chain] = {
          gateway,
        };
      })
    );
    return chainMap;
  }
}
