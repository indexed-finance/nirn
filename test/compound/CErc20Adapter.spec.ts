import { getAddress } from "@ethersproject/address"
import { CErc20Adapter } from "../../typechain"
import { behavesLikeErc20Adapter } from "../Erc20AdapterBehavior.spec"
import { deployContract } from '../shared'
import { CompoundConverter } from "../shared/conversion"


describe('CErc20Adapter', () => {
  let implementation: CErc20Adapter;

  before('Deploy implementation', async () => {
    implementation = await deployContract('CErc20Adapter');
  })

  const testAdapter = (_underlying: string, _ctoken: string, symbol: string) => behavesLikeErc20Adapter(
    () => implementation,
    async (adapter, underlying, token) => adapter.initialize(underlying.address, token.address),
    async (adapter, underlying, token) => underlying.balanceOf(token.address),
    CompoundConverter,
    _underlying,
    _ctoken,
    'Compound',
    'c',
    symbol
  );

  // Paused
  // testAdapter(getAddress('0x1985365e9f78359a9b6ad760e32412f4a445e862'), getAddress('0x158079ee67fce2f58472a96584a73c7ab9ac95c1'), 'REP');
  // testAdapter(getAddress('0x2260fac5e5542a773aa44fbcfedf7c193bc2c599'), getAddress('0xc11b1268c1a384e55c48c2391d8d480264a3a7f4'), 'WBTC');
  // testAdapter(getAddress('0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359'), getAddress('0xf5dce57282a584d2746faf1593d3121fcac444dc'), 'DAI');

  testAdapter(getAddress('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'), getAddress('0x39aa39c021dfbae8fac545936693ac917d5e7563'), 'USDC');
  testAdapter(getAddress('0xdac17f958d2ee523a2206206994597c13d831ec7'), getAddress('0xf650c3d88d12db855b8bf7d11be6c55a4e07dcc9'), 'USDT');
  testAdapter(getAddress('0x6b175474e89094c44da98b954eedeac495271d0f'), getAddress('0x5d3a536e4d6dbd6114cc1ead35777bab948e3643'), 'DAI');
  testAdapter(getAddress('0x1f9840a85d5af5bf1d1762f925bdaddc4201f984'), getAddress('0x35a18000230da775cac24873d00ff85bccded550'), 'UNI');
  testAdapter(getAddress('0xc00e94cb662c3520282e6f5717214004a7f26888'), getAddress('0x70e36f6bf80a52b3b46b3af8e106cc0ed743e8e4'), 'COMP');
  testAdapter(getAddress('0x2260fac5e5542a773aa44fbcfedf7c193bc2c599'), getAddress('0xccf4429db6322d5c611ee964527d42e5d685dd6a'), 'WBTC');
  testAdapter(getAddress('0x0000000000085d4780b73119b644ae5ecd22b376'), getAddress('0x12392f67bdf24fae0af363c24ac620a2f67dad86'), 'TUSD');
  testAdapter(getAddress('0x514910771af9ca656af840dff83e8264ecf986ca'), getAddress('0xface851a4921ce59e912d19329929ce6da6eb0c7'), 'LINK');
});