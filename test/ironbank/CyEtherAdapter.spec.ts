import { getAddress } from "@ethersproject/address"
import { IErc20Adapter } from "../../typechain"
import { shouldBehaveLikeEtherAdapter } from "../EtherAdapterBehavior.spec"
import { deployContract, IronBankConverter } from '../shared'


describe('CyEtherAdapter', () => {
  const testAdapter = (_underlying: string, _ctoken: string, symbol: string) => describe(`cy${symbol}`, function () {
    shouldBehaveLikeEtherAdapter(
      async () => (await deployContract('CyEtherAdapter')) as IErc20Adapter,
      (adapter, underlying, token) => adapter.initialize(underlying.address, token.address),
      IronBankConverter,
      _underlying,
      _ctoken,
      symbol
    );
  })

  testAdapter(getAddress('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'), getAddress('0x41c84c0e2ee0b740cf0d31f63f3b6f627dc6b393'), 'ETH');
});