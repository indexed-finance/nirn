import { getCreate2Address } from '@ethersproject/address';
import { JsonRpcSigner } from '@ethersproject/providers';
import { keccak256 } from '@ethersproject/keccak256';
import { BigNumber, Contract } from 'ethers';
import { ethers, network } from 'hardhat';
import { IERC20, IWETH, TestFactory } from '../../typechain';
import { addProxy } from './proxyResolution';

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
        url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
        blockNumber: 12569699
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

export const sendEtherTo = (address: string, amount: BigNumber = BigNumber.from(10).pow(20)) => withSigner(WETH, async (signer) => {
  const factory = await ethers.getContractFactory('SendEth');
  const tx = await factory.getDeployTransaction(address);
  await signer.sendTransaction({ data: tx.data, value: amount });
});

export async function sendTokenTo(erc20: string, to: string, amount: BigNumber) {
  if (erc20.toLowerCase() === WETH.toLowerCase()) {
    await sendEtherTo(to, amount)
    await withSigner(to, async (signer) => {
      const weth: IWETH = await getContract(WETH, 'IWETH', signer);
      await weth.deposit({ value: amount });
    })
  } else {
    let pair = computeUniswapPairAddress(erc20, WETH);
    const code = await ethers.provider.getCode(pair)
    if (code === '0x') {
      pair = computeSushiswapPairAddress(erc20, WETH);
    }
    const token = (await ethers.getContractAt('IERC20', erc20)) as IERC20;
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

//#region Uniswap
export function sortTokens(tokenA: string, tokenB: string): string[] {
  return tokenA.toLowerCase() < tokenB.toLowerCase()
    ? [tokenA, tokenB]
    : [tokenB, tokenA];
}

export function computeUniswapPairAddress(
  tokenA: string,
  tokenB: string
): string {
  const initCodeHash =
    "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f";
  const [token0, token1] = sortTokens(tokenA, tokenB);
  const salt = keccak256(
    Buffer.concat([
      Buffer.from(token0.slice(2).padStart(40, "0"), "hex"),
      Buffer.from(token1.slice(2).padStart(40, "0"), "hex"),
    ])
  );
  return getCreate2Address(UNISWAP_FACTORY_ADDRESS, salt, initCodeHash);
}

export function computeSushiswapPairAddress(
  tokenA: string,
  tokenB: string
): string {
  const initCodeHash =
    "0xe18a34eb0e04b04f7a0ac29a6e80748dca96319b42c54d679cb821dca90c6303";
  const [token0, token1] = sortTokens(tokenA, tokenB);
  const salt = keccak256(
    Buffer.concat([
      Buffer.from(token0.slice(2).padStart(40, "0"), "hex"),
      Buffer.from(token1.slice(2).padStart(40, "0"), "hex"),
    ])
  );
  return getCreate2Address(SUSHISWAP_FACTORY_ADDRESS, salt, initCodeHash);
}
//#endregion Uniswap