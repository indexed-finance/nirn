import { getAddress, getCreate2Address } from '@ethersproject/address';
import { keccak256 } from '@ethersproject/keccak256';
import { BigNumber } from 'ethers';
import { ethers, waffle } from 'hardhat';
import { IERC20, IWETH, IUniswapV2Pair, IERC20Metadata } from '../../typechain';
import { formatUnits, parseUnits } from '@ethersproject/units';
import { getBigNumber, getContract, withSigner } from './utils';

export const SUSHISWAP_FACTORY_ADDRESS = '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac'
export const UNISWAP_FACTORY_ADDRESS = '0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f';

export const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

//#region transfers
export const sendEtherTo = (address: string, amount: BigNumber = getBigNumber(1)) => withSigner(WETH, async (signer) => {
  const factory = await ethers.getContractFactory('SendEth');
  const tx = await factory.getDeployTransaction(address);
  await signer.sendTransaction({ data: tx.data, value: amount });
});

export async function getIERC20(token: string): Promise<IERC20> {
  return getContract(token, 'IERC20')
}

export async function getBalance(erc20: string, account: string): Promise<BigNumber> {
  return (await getIERC20(erc20)).balanceOf(account);
}

const holders: Record<string, string> = {
  '0xbA4cFE5741b357FA371b506e5db0774aBFeCf8Fc': '0xDBC13E67F678Cc00591920ceCe4dCa6322a79AC7',
  '0x9cA85572E6A3EbF24dEDd195623F188735A5179f': '0x1E5CE6F088fD0adb4fCFf31Cfb02A61503311bE9'
}

export async function isPairToken(token: string) {
  return (await getContract(token, 'IUniswapV2Pair')).getReserves().then(() => true).catch(() => false)
}

export async function sendPairTokens(pairAddress: string, to: string, amount: BigNumber) {
  const pair: IUniswapV2Pair = await getContract(pairAddress, 'IUniswapV2Pair');
  const t0 = await getIERC20(await pair.token0());
  const t1 = await getIERC20(await pair.token1());
  const b0 = await t0.balanceOf(pairAddress);
  const b1 = await t1.balanceOf(pairAddress);
  const supply = await pair.totalSupply();
  const a0 = amount.mul(b0).div(supply);
  const a1 = amount.mul(b1).div(supply);
  const [wallet] = waffle.provider.getWallets()
  await sendTokenTo(t0.address, wallet.address, a0);
  await sendTokenTo(t1.address, wallet.address, a1);
  await pair.sync();
  await t0.transfer(pair.address, a0)
  await t1.transfer(pair.address, a1)
  await withSigner(WETH, async (signer) => {
    await pair.connect(signer).mint(to);
  })
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
export async function getTokenDecimals(token: IERC20) {
  const metadata: IERC20Metadata = await getContract(token.address, 'IERC20Metadata');
  return metadata.decimals();
}

export async function getTokenSymbol(token: IERC20) {
  const metadata: IERC20Metadata = await getContract(token.address, 'IERC20Metadata');
  return metadata.symbol();
}

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