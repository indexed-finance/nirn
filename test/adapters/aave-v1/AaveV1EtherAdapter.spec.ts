import { getAddress } from "@ethersproject/address"
import { AaveV1Erc20Adapter } from "../../../typechain"
import { shouldBehaveLikeEtherAdapter } from "../../EtherAdapterBehavior.spec"
import { deployContract, AaveV1Converter } from '../../shared'


describe('AaveV1EtherAdapter', () => {
  const testAdapter = (_underlying: string, _ctoken: string, symbol: string) => describe(`a${symbol}`, function () {
    shouldBehaveLikeEtherAdapter(
      async () => (await deployContract('AaveV1EtherAdapter', '0x24a42fD28C976A61Df5D00D0599C34c4f90748c8')) as AaveV1Erc20Adapter,
      async (adapter, underlying, token) => adapter.initialize(underlying.address, token.address),
      AaveV1Converter,
      _underlying,
      _ctoken,
      symbol,
    )
  })

  testAdapter(getAddress('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'), getAddress('0x3a3a65aab0dd2a17e3f1947ba16138cd37d08c04'), 'ETH');
});