import { getAddress } from "@ethersproject/address"
import { CErc20Adapter } from "../../typechain"
import { behavesLikeErc20Adapter } from "../Erc20AdapterBehavior.spec"
import { deployContract } from '../shared'
import { CompoundConverter } from "../shared/conversion"


describe('C1Erc20Adapter', () => {
  let implementation: CErc20Adapter;

  before('Deploy implementation', async () => {
    implementation = await deployContract('C1Erc20Adapter');
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

  // Internal supply rate
  testAdapter(getAddress('0x0d8775f648430679a709e98d2b0cb6250d2887ef'), getAddress('0x6c8c6b02e7b2be14d4fa6022dfd6d75921d90e4e'), 'BAT');
  testAdapter(getAddress('0xe41d2489571d322189246dafa5ebde1f4699f498'), getAddress('0xb3319f5d18bc0d84dd1b4825dcde5d5f7266d407'), 'ZRX');
});