import { getAddress, getCreate2Address } from '@ethersproject/address';
import { keccak256 } from '@ethersproject/keccak256';
import { BigNumber } from 'ethers';
import { ethers, waffle } from 'hardhat';
import { IERC20, IWETH, IUniswapV2Pair, IERC20Metadata } from '../../typechain';
import { formatEther, formatUnits, parseUnits } from '@ethersproject/units';
import { getBigNumber, getContract, withSigner } from './utils';

export const SUSHISWAP_FACTORY_ADDRESS = '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac'
export const UNISWAP_FACTORY_ADDRESS = '0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f';

export const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

//#region query helpers
export async function getBalance(erc20: string, account: string): Promise<BigNumber> {
  return (await getIERC20(erc20)).balanceOf(account);
}

export async function getTokenDecimals(token: IERC20) {
  const metadata: IERC20Metadata = await getContract(token.address, 'IERC20Metadata');
  return metadata.decimals();
}

export async function getTokenSymbol(token: IERC20) {
  const metadata: IERC20Metadata = await getContract(token.address, 'IERC20Metadata');
  return metadata.symbol();
}

export async function createBalanceCheckpoint(token: IERC20, account: string) {
  const balanceBefore = await token.balanceOf(account)
  return async () => {
    const balanceAfter = await token.balanceOf(account)
    return balanceAfter.sub(balanceBefore)
  }
}
//#region query helpers

//#region transfers
export const sendEtherTo = (address: string, amount: BigNumber = getBigNumber(1)) => withSigner(WETH, async (signer) => {
  const factory = await ethers.getContractFactory('SendEth');
  const tx = await factory.getDeployTransaction(address);
  await signer.sendTransaction({ data: tx.data, value: amount });
});

export async function getIERC20(token: string): Promise<IERC20> {
  return getContract(token, 'IERC20')
}

const holders: Record<string, string> = {
  '0xbA4cFE5741b357FA371b506e5db0774aBFeCf8Fc': '0xDBC13E67F678Cc00591920ceCe4dCa6322a79AC7',
  '0x9cA85572E6A3EbF24dEDd195623F188735A5179f': '0x1E5CE6F088fD0adb4fCFf31Cfb02A61503311bE9',
  '0xe1237aA7f535b0CC33Fd973D66cBf830354D16c7': '0x312e02D14B8D2bb593f681739DC0Fe51aC84d23b',
  '0xa9fE4601811213c340e850ea305481afF02f5b28': '0x28b8eA972a2EEb21c7B6Cbf7182F7849FfaB31b8',
  '0x4B5BfD52124784745c1071dcB244C6688d2533d3': '0x7a15866aFfD2149189Aa52EB8B40a8F9166441D9',
  '0xdF5e0e81Dff6FAF3A7e52BA697820c5e32D806A8': '0x77D3C47876e45123C2837Ba68720378Af00a2C0A',
  '0x5dbcF33D8c2E976c6b560249878e6F1491Bca25c': '0xA875b5083CaB61496dEDaa162C37130310512325',
  '0x27b7b1ad7288079A66d12350c828D3C00A6F07d7': '0x1C0b104A9EeFf2F7001348a49fA28b8A0D23d637',
  '0x986b4AFF588a109c09B50A03f42E4110E29D353F': '0xDAef20EA4708FcFf06204A4FE9ddf41dB056bA18',
  '0xdCD90C7f6324cfa40d7169ef80b12031770B4325': '0x7ccC9481fbcA38091044194982575f305d3E9e22'

}

export async function isPairToken(token: string) {
  return (await getContract(token, 'IUniswapV2Pair')).getReserves().then(() => true)
}

function divCeil(a: BigNumber, b: BigNumber): BigNumber {
  let q = a.div(b)
  if (!q.mul(b).eq(a)) {
    q = q.add(1)
  }
  return q
}

export async function sendPairTokens(pairAddress: string, to: string, amount: BigNumber) {
  const pair: IUniswapV2Pair = await getContract(pairAddress, 'IUniswapV2Pair');
  const t0 = await getIERC20(await pair.token0());
  const t1 = await getIERC20(await pair.token1());
  const b0 = await t0.balanceOf(pairAddress);
  const b1 = await t1.balanceOf(pairAddress);
  const supply = await pair.totalSupply();
  const a0 = divCeil(amount.mul(b0), supply);
  const a1 = divCeil(amount.mul(b1), supply);
  const [wallet] = waffle.provider.getWallets()
  await sendTokenTo(t0.address, wallet.address, a0);
  await sendTokenTo(t1.address, wallet.address, a1);
  await pair.sync();
  await t0.transfer(pair.address, a0)
  await t1.transfer(pair.address, a1)
  const balanceBefore = await pair.balanceOf(to)
  await withSigner(WETH, async (signer) => {
    await pair.connect(signer).mint(to);
  })
  const balanceAfter = await pair.balanceOf(to)
  const gained = balanceAfter.sub(balanceBefore)
  if (gained.gt(amount)) {
    await withSigner(to, async (signer) => {
      await pair.connect(signer).transfer(`0x${'ff'.repeat(20)}`, gained.sub(amount))
    })
  }
}

export async function sendTokenTo(erc20: string, to: string, amount: BigNumber) {
  if (erc20.toLowerCase() === WETH.toLowerCase()) {
    await sendEtherTo(to, amount)
    await withSigner(to, async (signer) => {
      const weth: IWETH = await getContract(WETH, 'IWETH', signer);
      await weth.deposit({ value: amount });
    })
  } else {
    const token = (await ethers.getContractAt('IERC20', erc20)) as IERC20;
    let sender = computeUniswapPairAddress(erc20, WETH);
    const code = await ethers.provider.getCode(sender)
    if (code === '0x' || (await token.balanceOf(sender)).lt(amount)) {
      sender = computeSushiswapPairAddress(erc20, WETH);
    }
    if ((await token.balanceOf(sender)).lt(amount)) {
      if (holders[getAddress(erc20)]) {
        sender = holders[getAddress(erc20)]
      } else {
        if (await isPairToken(erc20)) {
          await sendPairTokens(erc20, to, amount);
          return;
        }
        throw new Error('Could not find holder to transfer tokens from');
      }
    }
    await sendTokenToFrom(token, sender, to, amount);
  }
}

export async function sendTokenToFrom(token: IERC20, sender: string, to: string, amount: BigNumber) {
  await sendEtherTo(sender);
  await withSigner(sender, async (signer) => {
    await token.connect(signer).transfer(to, amount);
  });
}
//#endregion

//#region Uniswap

const toAddressBuffer = (address: string) => Buffer.from(address.slice(2).padStart(40, "0"), "hex");

export const INIT_CODE_HASH_SUSHI = '0xe18a34eb0e04b04f7a0ac29a6e80748dca96319b42c54d679cb821dca90c6303'
export const INIT_CODE_HASH_UNI = '0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f'

export function sortTokens(tokenA: string, tokenB: string): string[] {
  return tokenA.toLowerCase() < tokenB.toLowerCase()
    ? [tokenA, tokenB]
    : [tokenB, tokenA];
}

export function computeUniswapPairAddress(
  tokenA: string,
  tokenB: string
): string {
  const initCodeHash = INIT_CODE_HASH_UNI;
  const [token0, token1] = sortTokens(tokenA, tokenB);
  const salt = keccak256(
    Buffer.concat([
      toAddressBuffer(token0),
      toAddressBuffer(token1),
    ])
  );
  return getCreate2Address(UNISWAP_FACTORY_ADDRESS, salt, initCodeHash);
}

export function computeSushiswapPairAddress(
  tokenA: string,
  tokenB: string
): string {
  const initCodeHash = INIT_CODE_HASH_SUSHI;
  const [token0, token1] = sortTokens(tokenA, tokenB);
  const salt = keccak256(
    Buffer.concat([
      toAddressBuffer(token0),
      toAddressBuffer(token1),
    ])
  );
  return getCreate2Address(SUSHISWAP_FACTORY_ADDRESS, salt, initCodeHash);
}
//#endregion Uniswap


//#region token amounts

export async function formatTokenAmount(token: IERC20, amount: BigNumber) {
  return formatUnits(amount, await getTokenDecimals(token));
}

export async function parseTokenAmount(token: IERC20, amount: number) {
  return parseUnits(amount.toString(10), await getTokenDecimals(token));
}

export async function getTokenDecimalsAndSymbol(token: IERC20) {
  const metadata: IERC20Metadata = await getContract(token.address, 'IERC20Metadata');
  const [decimals, symbol] = await Promise.all([
    metadata.decimals(),
    metadata.symbol()
  ]);
  return { decimals, symbol };
}

export async function getTokenAmountString(token: IERC20, amount: BigNumber) {
  const metadata: IERC20Metadata = await getContract(token.address, 'IERC20Metadata');
  const [decimals, symbol] = await Promise.all([
    metadata.decimals(),
    metadata.symbol()
  ]);
  return `${formatUnits(amount, decimals)} ${symbol}`;
}
//#endregion