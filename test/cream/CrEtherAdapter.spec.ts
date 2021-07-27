import { getAddress } from "@ethersproject/address"
import { CrErc20Adapter } from "../../typechain"
import { shouldBehaveLikeEtherAdapter } from "../EtherAdapterBehavior.spec"
import { deployContract, CreamConverter } from '../shared'


describe('CrEtherAdapter', () => {
  const testAdapter = (_underlying: string, _ctoken: string, symbol: string) => describe(`cr${symbol}`, function () {
    shouldBehaveLikeEtherAdapter(
      async () => (await deployContract('CrEtherAdapter')) as CrErc20Adapter,
      async (adapter, underlying, token) => adapter.initialize(underlying.address, token.address),
      CreamConverter,
      _underlying,
      _ctoken,
      symbol,
    )
  })

  testAdapter(getAddress('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'), getAddress('0xD06527D5e56A3495252A528C4987003b712860eE'), 'ETH')
});