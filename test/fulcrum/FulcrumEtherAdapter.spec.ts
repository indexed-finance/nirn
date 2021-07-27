import { getAddress } from "@ethersproject/address"
import { constants } from "ethers"
import { FulcrumErc20Adapter } from "../../typechain"
import { shouldBehaveLikeEtherAdapter } from "../EtherAdapterBehavior.spec"
import { deployContract, FulcrumConverter } from '../shared'

describe('FulcrumEtherAdapter', () => {
  const testAdapter = (_underlying: string, _itoken: string, symbol: string) => describe(`i${symbol}`, function () {
    shouldBehaveLikeEtherAdapter(
      async () => (await deployContract('FulcrumEtherAdapter', _underlying, _itoken)) as FulcrumErc20Adapter,
      async (adapter, underlying, token) => {},
      FulcrumConverter,
      _underlying,
      _itoken,
      symbol,
      async (_, __, wrapper) => ({
        depositSenderWrapped: constants.AddressZero,
        withdrawalSenderUnderlying: wrapper.address
      })
    )
  })

  testAdapter(getAddress('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'), getAddress('0xb983e01458529665007ff7e0cddecdb74b967eb6'), 'ETH');
});