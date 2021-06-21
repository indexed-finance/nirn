import { getAddress } from "@ethersproject/address"
import { CyErc20Adapter } from "../../typechain"
import { behavesLikeErc20Adapter } from "../Erc20AdapterBehavior.spec"
import { deployContract, IronBankConverter } from '../shared'


describe('CyErc20Adapter', () => {
  let implementation: CyErc20Adapter;

  before(async () => {
    implementation = await deployContract('CyErc20Adapter');
  })

  const testAdapter = (_underlying: string, _ctoken: string, symbol: string) => behavesLikeErc20Adapter(
    () => implementation,
    async (adapter, underlying, token) => adapter.initialize(underlying.address, token.address),
    async (adapter, underlying, token) => underlying.balanceOf(token.address),
    IronBankConverter,
    _underlying,
    _ctoken,
    'IronBank',
    'cy',
    symbol
  );

  testAdapter(getAddress('0x6b175474e89094c44da98b954eedeac495271d0f'), getAddress('0x8e595470ed749b85c6f7669de83eae304c2ec68f'), 'DAI');
  // testAdapter(getAddress('0x9ca85572e6a3ebf24dedd195623f188735a5179f'), getAddress('0x7589c9e17bcfce1ccaa1f921196fda177f0207fc'), 'y3Crv');
  testAdapter(getAddress('0x514910771af9ca656af840dff83e8264ecf986ca'), getAddress('0xe7bff2da8a2f619c2586fb83938fa56ce803aa16'), 'LINK');
  testAdapter(getAddress('0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e'), getAddress('0xfa3472f7319477c9bfecdd66e4b948569e7621b9'), 'YFI');
  testAdapter(getAddress('0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f'), getAddress('0x12a9cc33a980daa74e00cc2d1a0e74c57a93d12c'), 'SNX');
  testAdapter(getAddress('0x2260fac5e5542a773aa44fbcfedf7c193bc2c599'), getAddress('0x8fc8bfd80d6a9f17fb98a373023d72531792b431'), 'WBTC');
  testAdapter(getAddress('0xdac17f958d2ee523a2206206994597c13d831ec7'), getAddress('0x48759f220ed983db51fa7a8c0d2aab8f3ce4166a'), 'USDT');
  testAdapter(getAddress('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'), getAddress('0x76eb2fe28b36b3ee97f3adae0c69606eedb2a37c'), 'USDC');
  testAdapter(getAddress('0xe2f2a5c287993345a840db3b0845fbc70f5935a5'), getAddress('0xbe86e8918dfc7d3cb10d295fc220f941a1470c5c'), 'mUSD');
  testAdapter(getAddress('0x5bc25f649fc4e26069ddf4cf4010f9f706c23831'), getAddress('0x297d4da727fbc629252845e96538fc46167e453a'), 'DUSD');
  testAdapter(getAddress('0xdb25f211ab05b1c97d595516f45794528a807ad8'), getAddress('0xa8caea564811af0e92b1e044f3edd18fa9a73e4f'), 'EURS');
  // testAdapter(getAddress('0xd71ecff9342a5ced620049e616c5035f1db98620'), getAddress('0xca55f9c4e77f7b8524178583b0f7c798de17fd54'), 'sEUR');
  testAdapter(getAddress('0x1494ca1f11d487c2bbe4543e90080aeba4ba3c2b'), getAddress('0x7736ffb07104c0c400bb0cc9a7c228452a732992'), 'DPI');
  testAdapter(getAddress('0x4fabb145d64652a948d72533023f6e7a623c7c53'), getAddress('0x09bdcce2593f0bef0991188c25fb744897b6572d'), 'BUSD');
  // Error in toWrappedAmount & toUnderlyingAmount
  // testAdapter(getAddress('0x056fd409e1d7a124bd7017459dfea2f387b6d5cd'), getAddress('0xa0e5a19e091bbe241e655997e50da82da676b083'), 'GUSD');
  // testAdapter(getAddress('0xf650c3d88d12db855b8bf7d11be6c55a4e07dcc9'), getAddress('0xbb4b067cc612494914a902217cb6078ab4728e36'), 'cUSDT');
  // testAdapter(getAddress('0x1456688345527be1f37e9e627da0837d6f08c925'), getAddress('0xbddeb563e90f6cbf168a7cda4927806477e5b6c6'), 'USDP');
  testAdapter(getAddress('0x5d3a536e4d6dbd6114cc1ead35777bab948e3643'), getAddress('0x4f12c9dabb5319a252463e6028ca833f1164d045'), 'cDAI');
  testAdapter(getAddress('0x39aa39c021dfbae8fac545936693ac917d5e7563'), getAddress('0x950027632fbd6adadfe82644bfb64647642b6c09'), 'cUSDC');
  testAdapter(getAddress('0x57ab1ec28d129707052df4df418d58a2d46d5f51'), getAddress('0xa7c4054afd3dbbbf5bfe80f41862b89ea05c9806'), 'sUSD');
  testAdapter(getAddress('0x1f9840a85d5af5bf1d1762f925bdaddc4201f984'), getAddress('0xfeeb92386a055e2ef7c2b598c872a4047a7db59f'), 'UNI');
  testAdapter(getAddress('0x6b3595068778dd592e39a122f4f5a5cf09c90fe2'), getAddress('0x226f3738238932ba0db2319a8117d9555446102f'), 'SUSHI');
});