import { getAddress, getContractAddress, getCreate2Address } from '@ethersproject/address';
import { JsonRpcSigner } from '@ethersproject/providers';
import { keccak256 } from '@ethersproject/keccak256';
import { BigNumber, Contract } from 'ethers';
import { ethers, network, waffle } from 'hardhat';
import { IERC20, IVault, IWETH, IYearnRegistry, TestFactory, IUniswapV2Pair, IERC20Metadata } from '../../typechain';
import { addProxy } from './proxyResolution';
import { formatUnits, parseUnits } from '@ethersproject/units';

export const SUSHISWAP_FACTORY_ADDRESS = '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac'
export const UNISWAP_FACTORY_ADDRESS = '0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f';

export const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

export function getBigNumber(n: number, decimals = 18) {
  return BigNumber.from(10).pow(decimals).mul(n);
}

export async function getContractBase<C extends Contract>(address: string, name: string): Promise<C> {
  let contract = await ethers.getContractAt(name, address);
  return contract as C;
}

export async function getNextContractAddress(account: string): Promise<string> {
  const nonce = await ethers.provider.getTransactionCount(account);
  return getContractAddress({ from: account, nonce });
}

//#region Fork utils

export async function impersonate(address: string) {
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [address]
  });
  return ethers.provider.getSigner(address);
}

export async function stopImpersonating(address: string) {
  await network.provider.request({
    method: "hardhat_stopImpersonatingAccount",
    params: [address]
  });
}

export async function resetFork() {
  await network.provider.request({
    method: 'hardhat_reset',
    params: [{
      forking: {
        jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
        blockNumber: 12667185
      }
    }]
  })
}
//#endregion

//#region Impersonation utils
export async function withSigner(address: string, fn: (signer: JsonRpcSigner) => Promise<void>) {
  const signer = await impersonate(address);
  await fn(signer);
  await stopImpersonating(address);
}

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
  '0xbA4cFE5741b357FA371b506e5db0774aBFeCf8Fc': '0xDBC13E67F678Cc00591920ceCe4dCa6322a79AC7'
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
    let pair = computeUniswapPairAddress(erc20, WETH);
    const code = await ethers.provider.getCode(pair)
    if (code === '0x' || (await token.balanceOf(pair)).lt(amount)) {
      pair = computeSushiswapPairAddress(erc20, WETH);
    }
    if ((await token.balanceOf(pair)).lt(amount)) {
      if (holders[getAddress(erc20)]) {
        pair = holders[getAddress(erc20)]
      } else {
        if (await isPairToken(erc20)) {
          await sendPairTokens(erc20, to, amount);
          return;
        }
        throw new Error('Could not find holder to transfer tokens from');
      }
    }
    await sendEtherTo(pair);
    await withSigner(pair, async (signer) => {
      await token.connect(signer).transfer(to, amount);
    });
  }
}

export async function getContract<C extends Contract>(address: string, name: string, signer?: string | JsonRpcSigner): Promise<C> {
  let contract = await getContractBase(address, name);
  if (signer) {
    const _signer = typeof signer === 'string' ? await impersonate(signer) : signer;
    contract = contract.connect(_signer);
  }
  return contract as C;
}
//#endregion

/* Other Utils */
export async function deploy(bytecode: string): Promise<string> {
  const [signer] = await ethers.getSigners();
  const tx = await signer.sendTransaction({ data: bytecode });
  const { contractAddress } = await tx.wait();
  return contractAddress;
}

export async function deployContract<C extends Contract>(name: string, ...args: any[]): Promise<C> {
  const f = await ethers.getContractFactory(name);
  const c = await f.deploy(...args);
  return c as C;
}

export async function deployClone<C extends Contract>(implementation: C, name: string): Promise<C> {
  const cloneFactory: TestFactory = await deployContract('TestFactory');
  await cloneFactory.clone(implementation.address);
  const address = await cloneFactory.last();
  addProxy(address, name);
  return new Contract(address, implementation.interface, implementation.signer) as C;
}

const toAddressBuffer = (address: string) => Buffer.from(address.slice(2).padStart(40, "0"), "hex");
//#region Uniswap

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

//#region token ammounts
export async function getTokenDecimals(token: IERC20) {
  const metadata: IERC20Metadata = await getContract(token.address, 'IERC20Metadata');
  return metadata.decimals();
}

export async function getTokenSymbol(token: IERC20) {
  console.log(`GET SYMMBOL ${token.address}`)
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