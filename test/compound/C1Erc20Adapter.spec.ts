import { getAddress } from "@ethersproject/address"
import { C1Erc20Adapter } from "../../typechain"
import { shouldBehaveLikeAdapter } from "../Erc20AdapterBehavior.spec"
import { deployContract } from '../shared'
import { CompoundConverter } from "../shared/conversion"


describe('C1Erc20Adapter', () => {
  const testAdapter = (_underlying: string, _ctoken: string, symbol: string) => describe(`c${symbol}`, function () {
    shouldBehaveLikeAdapter(
      async () => (await deployContract('C1Erc20Adapter')) as C1Erc20Adapter,
      async (adapter, underlying, token) => (adapter as C1Erc20Adapter).initialize(underlying.address, token.address),
      CompoundConverter,
      _underlying,
      _ctoken,
      symbol,
    );
  })

  // Internal supply rate
  testAdapter(getAddress('0x0d8775f648430679a709e98d2b0cb6250d2887ef'), getAddress('0x6c8c6b02e7b2be14d4fa6022dfd6d75921d90e4e'), 'BAT');
  testAdapter(getAddress('0xe41d2489571d322189246dafa5ebde1f4699f498'), getAddress('0xb3319f5d18bc0d84dd1b4825dcde5d5f7266d407'), 'ZRX');
});