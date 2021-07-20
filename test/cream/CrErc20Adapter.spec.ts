import { getAddress } from "@ethersproject/address"
import { CrErc20Adapter } from "../../typechain"
import { shouldBehaveLikeAdapter } from "../Erc20AdapterBehavior.spec"
import { deployContract, CreamConverter } from '../shared'


describe('CrErc20Adapter', () => {
  const testAdapter = (_underlying: string, _ctoken: string, symbol: string) => describe(`cr${symbol}`, function () {
    shouldBehaveLikeAdapter(
      async () => (await deployContract('CrErc20Adapter')) as CrErc20Adapter,
      async (adapter, underlying, token) => adapter.initialize(underlying.address, token.address),
      CreamConverter,
      _underlying,
      _ctoken,
      symbol,
    )
  })

  // Working
  testAdapter(getAddress('0xa47c8bf37f92abed4a126bda807a7b7498661acd'), getAddress('0x51f48b638f82e8765f7a26373a2cb4ccb10c07af'), 'UST');
  testAdapter(getAddress('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'), getAddress('0x44fbebd2f576670a6c33f6fc0b00aa8c5753b322'), 'USDC');
  testAdapter(getAddress('0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e'), getAddress('0xcbae0a83f4f9926997c8339545fb8ee32edc6b76'), 'YFI');
  testAdapter(getAddress('0xba100000625a3754423978a60c9317c58a424e3d'), getAddress('0xce4fe9b4b8ff61949dcfeb7e03bc9faca59d2eb3'), 'BAL');
  testAdapter(getAddress('0xc00e94cb662c3520282e6f5717214004a7f26888'), getAddress('0x19d1666f543d42ef17f66e376944a22aea1a8e46'), 'COMP');
  testAdapter(getAddress('0xdac17f958d2ee523a2206206994597c13d831ec7'), getAddress('0x797aab1ce7c01eb727ab980762ba88e7133d2157'), 'USDT');
  testAdapter(getAddress('0x2ba592f78db6436527729929aaf6c908497cb200'), getAddress('0x892b14321a4fcba80669ae30bd0cd99a7ecf6ac0'), 'CREAM');
  testAdapter(getAddress('0x514910771af9ca656af840dff83e8264ecf986ca'), getAddress('0x697256caa3ccafd62bb6d3aa1c7c5671786a5fd9'), 'LINK');
  testAdapter(getAddress('0xd533a949740bb3306d119cc777fa900ba034cd52'), getAddress('0xc7fd8dcee4697ceef5a2fd4608a7bd6a94c77480'), 'CRV');
  testAdapter(getAddress('0xeb4c2781e4eba804ce9a9803c67d0893436bb27d'), getAddress('0x17107f40d70f4470d20cb3f138a052cae8ebd4be'), 'renBTC');
  testAdapter(getAddress('0x4fabb145d64652a948d72533023f6e7a623c7c53'), getAddress('0x1ff8cdb51219a8838b52e9cac09b71e591bc998e'), 'BUSD');
  testAdapter(getAddress('0xa3bed4e1c75d00fa6f4e5e6922db7261b5e9acd2'), getAddress('0x3623387773010d9214b10c551d6e7fc375d31f58'), 'MTA');
  testAdapter(getAddress('0x6b3595068778dd592e39a122f4f5a5cf09c90fe2'), getAddress('0x338286c0bc081891a4bda39c7667ae150bf5d206'), 'SUSHI');
  testAdapter(getAddress('0x50d1c9771902476076ecfc8b2a83ad6b9355a4c9'), getAddress('0x10fdbd1e48ee2fd9336a482d746138ae19e649db'), 'FTX Token');
  testAdapter(getAddress('0x476c5e26a75bd202a9683ffd34359c0cc15be0ff'), getAddress('0xef58b2d5a1b8d3cde67b8ab054dc5c831e9bc025'), 'SRM');
  testAdapter(getAddress('0x1f9840a85d5af5bf1d1762f925bdaddc4201f984'), getAddress('0xe89a6d0509faf730bd707bf868d9a2a744a363c7'), 'UNI');
  testAdapter(getAddress('0x0d438f3b5175bebc262bf23753c1e53d03432bde'), getAddress('0xeff039c3c1d668f408d09dd7b63008622a77532c'), 'wNXM');
  testAdapter(getAddress('0xaaaebe6fe48e54f431b0c390cfaf0b017d09d42d'), getAddress('0x8b3ff1ed4f36c2c2be675afb13cc3aa5d73685a5'), 'CEL');
  testAdapter(getAddress('0x1494ca1f11d487c2bbe4543e90080aeba4ba3c2b'), getAddress('0x2a537fa9ffaea8c1a41d3c2b68a9cb791529366d'), 'DPI');
  testAdapter(getAddress('0x9be89d2a4cd102d8fecc6bf9da793be995c22541'), getAddress('0x7ea9c63e216d5565c3940a2b3d150e59c2907db3'), 'BBTC');
  testAdapter(getAddress('0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9'), getAddress('0x3225e3c669b39c7c8b3e204a8614bb218c5e31bc'), 'AAVE');
  testAdapter(getAddress('0x0391d2021f89dc339f60fff84546ea23e337750f'), getAddress('0xf55bbe0255f7f4e70f63837ff72a577fbddbe924'), 'BOND');
  testAdapter(getAddress('0x1ceb5cb57c4d4e2b2433641b95dd330a33185a44'), getAddress('0x903560b1cce601794c584f58898da8a8b789fc5d'), 'KP3R');
  testAdapter(getAddress('0x2260fac5e5542a773aa44fbcfedf7c193bc2c599'), getAddress('0x197070723ce0d3810a0e47f06e935c30a480d4fc'), 'WBTC');
  testAdapter(getAddress('0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f'), getAddress('0xc25eae724f189ba9030b2556a1533e7c8a732e14'), 'SNX');
  testAdapter(getAddress('0x57ab1ec28d129707052df4df418d58a2d46d5f51'), getAddress('0x25555933a8246ab67cbf907ce3d1949884e82b55'), 'sUSD');
  testAdapter(getAddress('0x429881672b9ae42b8eba0e26cd9c73711b891ca5'), getAddress('0xc68251421edda00a10815e273fa4b1191fac651b'), 'PICKLE');
  testAdapter(getAddress('0x19d97d8fa813ee2f51ad4b4e04ea08baf4dffc28'), getAddress('0x8b950f43fcac4931d408f1fcda55c6cb6cbf3096'), 'bBADGER');
  testAdapter(getAddress('0x8207c1ffc5b6804f6024322ccf34f29c3541ae26'), getAddress('0x59089279987dd76fc65bf94cb40e186b96e03cb3'), 'OGN');
  testAdapter(getAddress('0xff20817765cb7f73d4bde2e66e067e58d11095c2'), getAddress('0x2db6c82ce72c8d7d770ba1b5f5ed0b6e075066d6'), 'AMP');
  testAdapter(getAddress('0x853d955acef822db058eb8505911ed77f175b99e'), getAddress('0xb092b4601850e23903a42eacbc9d8a0eec26a4d5'), 'FRAX');
  testAdapter(getAddress('0x4e15361fd6b4bb609fa63c81a2be19d873717870'), getAddress('0xc36080892c64821fa8e396bc1bd8678fa3b82b17'), 'FTM');
  testAdapter(getAddress('0x3155ba85d5f96b2d030a4966af206230e46849cb'), getAddress('0x8379baa817c5c5ab929b03ee8e3c48e45018ae41'), 'RUNE');
  testAdapter(getAddress('0xbc396689893d065f41bc2c6ecbee5e0085233447'), getAddress('0x299e254a8a165bbeb76d9d69305013329eea3a3b'), 'PERP');
  testAdapter(getAddress('0x03ab458634910aad20ef5f1c8ee96f1d6ac54919'), getAddress('0xf8445c529d363ce114148662387eba5e62016e20'), 'RAI');
  testAdapter(getAddress('0xb753428af26e81097e7fd17f40c88aaa3e04902c'), getAddress('0x28526bb33d7230e65e735db64296413731c5402e'), 'SFI');
  testAdapter(getAddress('0x1337def16f9b486faed0293eb623dc8395dfe46a'), getAddress('0xab10586c918612ba440482db77549d26b7abf8f7'), 'ARMOR');
  testAdapter(getAddress('0xec67005c4e498ec7f55e092bd1d35cbc47c91892'), getAddress('0xdbb5e3081def4b6cdd8864ac2aeda4cbf778fecf'), 'MLN');
  testAdapter(getAddress('0xfca59cd816ab1ead66534d82bc21e7515ce441cf'), getAddress('0x081fe64df6dc6fc70043aedf3713a3ce6f190a21'), 'RARI');
  testAdapter(getAddress('0xa1faa113cbe53436df28ff0aee54275c13b40975'), getAddress('0x1d0986fb43985c88ffa9ad959cc24e6a087c7e35'), 'ALPHA');
  testAdapter(getAddress('0x8ab7404063ec4dbcfd4598215992dc3f8ec853d7'), getAddress('0x65883978ada0e707c3b2be2a6825b1c4bdf76a90'), 'AKRO');
  testAdapter(getAddress('0x36f3fd68e7325a35eb768f1aedaae9ea0689d723'), getAddress('0x3c6c553a95910f9fc81c98784736bd628636d296'), 'ESD');
  testAdapter(getAddress('0x8798249c2e607446efb7ad49ec89dd1865ff4272'), getAddress('0x228619cca194fbe3ebeb2f835ec1ea5080dafbb2'), 'xSUSHI');
  testAdapter(getAddress('0xcbc1065255cbc3ab41a6868c22d1f1c573ab89fd'), getAddress('0xfd609a03b393f1a1cfcacedabf068cad09a924e2'), 'CRETH2');
  testAdapter(getAddress('0xdf574c24545e5ffecb9a659c229253d4111d87e1'), getAddress('0xd692ac3245bb82319a31068d6b8412796ee85d2c'), 'HUSD');
  testAdapter(getAddress('0x6b175474e89094c44da98b954eedeac495271d0f'), getAddress('0x92b767185fb3b04f881e3ac8e5b0662a027a1d9f'), 'DAI');
  testAdapter(getAddress('0x584bc13c7d411c00c01a62e8019472de68768430'), getAddress('0x10a3da2bb0fae4d591476fd97d6636fd172923a8'), 'HEGIC');
  testAdapter(getAddress('0x4688a8b1f292fdab17e9a90c8bc379dc1dbd8713'), getAddress('0x21011bc93d9e515b9511a817a1ed1d6d468f49fc'), 'COVER');
  testAdapter(getAddress('0x111111111117dc0aa78b770fa6a738034120c302'), getAddress('0x85759961b116f1d36fd697855c57a6ae40793d9b'), '1INCH');
  testAdapter(getAddress('0x967da4048cd07ab37855c090aaf366e4ce1b9f48'), getAddress('0x7c3297cfb4c4bbd5f44b450c0872e0ada5203112'), 'OCEAN');
  testAdapter(getAddress('0xd26114cd6ee289accf82350c8d8487fedb8a0c07'), getAddress('0x7aaa323d7e398be4128c7042d197a2545f0f1fea'), 'OMG');
  testAdapter(getAddress('0x1337def18c680af1f9f45cbcab6309562975b1dd'), getAddress('0xdfff11dfe6436e42a17b86e7f419ac8292990393'), 'arNXM');
  testAdapter(getAddress('0x1b40183efb4dd766f11bda7a7c3ad8982e998421'), getAddress('0x71cefcd324b732d4e058afacba040d908c441847'), 'VSP');
  testAdapter(getAddress('0x6810e776880c02933d47db1b9fc05908e5386b96'), getAddress('0x523effc8bfefc2948211a05a905f761cba5e8e9e'), 'GNO');
  testAdapter(getAddress('0xcc4304a31d09258b0029ea7fe63d032f52e44efe'), getAddress('0x98e329eb5aae2125af273102f3440de19094b77c'), 'SWAP');
  testAdapter(getAddress('0xba4cfe5741b357fa371b506e5db0774abfecf8fc'), getAddress('0x1a122348b73b58ea39f822a89e6ec67950c2bbd0'), 'vVSP');

  // SLP tokens blocked by protocol
  // testAdapter(getAddress('0xceff51756c56ceffca006cd410b03ffc46dd3a58'), getAddress('0x73f6cba38922960b7092175c0add22ab8d0e81fc'), 'SLP');
  // testAdapter(getAddress('0xc3d03e4f041fd4cd388c549ee2a29a9e5075882f'), getAddress('0x38f27c03d6609a86ff7716ad03038881320be4ad'), 'SLP');
  // testAdapter(getAddress('0x397ff1542f962076d0bfe58ea045ffa2d347aca0'), getAddress('0x5ecad8a75216cea7dff978525b2d523a251eea92'), 'SLP');
  // testAdapter(getAddress('0x06da0fd433c1a5d7a4faa01111c044910a184553'), getAddress('0x5c291bc83d15f71fb37805878161718ea4b6aee9'), 'SLP');
  // testAdapter(getAddress('0x795065dcc9f64b5614c407a6efdc400da6221fb0'), getAddress('0x6ba0c66c48641e220cf78177c144323b3838d375'), 'SLP');
  // testAdapter(getAddress('0x088ee5007c98a9677165d78dd2109ae4a3d04d0c'), getAddress('0xd532944df6dfd5dd629e8772f03d4fc861873abf'), 'SLP');
  testAdapter(getAddress('0xbb2b8038a1640196fbe3e38816f3e67cba72d940'), getAddress('0x011a014d5e8eb4771e575bb1000318d509230afa'), 'UNI-V2');
  testAdapter(getAddress('0x0d4a11d5eeaac28ec3f61d100daf4d40471f1852'), getAddress('0xe6c3120f38f56deb38b69b65cc7dcaf916373963'), 'UNI-V2');
  testAdapter(getAddress('0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc'), getAddress('0x4fe11bc316b6d7a345493127fbe298b95adaad85'), 'UNI-V2');
  testAdapter(getAddress('0xa478c2975ab1ea89e8196811f51a7b7ade33eb11'), getAddress('0xcd22c4110c12ac41acefa0091c432ef44efaafa0'), 'UNI-V2');
  testAdapter(getAddress('0xdf5e0e81dff6faf3a7e52ba697820c5e32d806a8'), getAddress('0x9baf8a5236d44ac410c0186fe39178d5aad0bb87'), 'yDAI+yUSDC+yUSDT+yTUSD');
  testAdapter(getAddress('0x5dbcf33d8c2e976c6b560249878e6f1491bca25c'), getAddress('0x4ee15f44c6f0d8d1136c83efd2e8e4ac768954c6'), 'yyDAI+yUSDC+yUSDT+yTUSD');
  testAdapter(getAddress('0xe1237aa7f535b0cc33fd973d66cbf830354d16c7'), getAddress('0x01da76dea59703578040012357b81ffe62015c2d'), 'yWETH');
  testAdapter(getAddress('0xa9fe4601811213c340e850ea305481aff02f5b28'), getAddress('0x4202d97e00b9189936edf37f8d01cff88bdd81d4'), 'yvWETH');
  testAdapter(getAddress('0x4b5bfd52124784745c1071dcb244c6688d2533d3'), getAddress('0x4baa77013ccd6705ab0522853cb0e9d453579dd4'), 'yUSD');
  testAdapter(getAddress('0x27b7b1ad7288079a66d12350c828d3c00a6f07d7'), getAddress('0x45406ba53bb84cd32a58e7098a2d4d1b11b107f6'), 'yvCurve-IronBank');
  testAdapter(getAddress('0x986b4aff588a109c09b50a03f42e4110e29d353f'), getAddress('0x6d1b9e01af17dd08d6dec08e210dfd5984ff1c20'), 'yvCurve-sETH');
  // Unknown revert
  // testAdapter(getAddress('0xdcd90c7f6324cfa40d7169ef80b12031770b4325'), getAddress('0x1f9b4756b008106c806c7e64322d7ed3b72cb284'), 'yvCurve-stETH');
 
  /* Unknown Error
  testAdapter(getAddress('0x0316eb71485b0ab14103307bf65a021042c6d380'), getAddress('0x054b7ed3f45714d3091e82aad64a1588dc4096ed'), 'HBTC');
  testAdapter(getAddress('0x9afb950948c2370975fb91a441f36fdc02737cd4'), getAddress('0xd5103afcd0b3fa865997ef2984c66742c51b2a8b'), 'HFIL'); */
});