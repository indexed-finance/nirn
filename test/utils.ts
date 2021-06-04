import { getCreate2Address } from '@ethersproject/address';
import { JsonRpcSigner } from '@ethersproject/providers';
import { keccak256 } from '@ethersproject/keccak256';
import { BigNumber, Contract } from 'ethers';
import { ethers, network } from 'hardhat';
import { IERC20 } from '../typechain/IERC20';


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
        jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/`,
        blockNumber: 12313413
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

export const sendEtherTo = (address: string) => withSigner('0xA2881A90Bf33F03E7a3f803765Cd2ED5c8928dFb', async (signer) => {
  await signer.sendTransaction({ to: address, value: BigNumber.from(10).pow(20) });
});

export async function sendTokenTo(erc20: string, to: string, amount: BigNumber) {
  const pair = computeUniswapPairAddress(erc20, WETH);
  const token = (await ethers.getContractAt('IERC20', erc20)) as IERC20;
  await sendEtherTo(pair);
  await withSigner(pair, async (signer) => {
    await token.connect(signer).transfer(to, amount);
  });
}

export async function getContract<C extends Contract>(address: string, name: string, signer?: string): Promise<C> {
  let contract = await getContractBase(address, name);
  if (signer) {
    const _signer = await impersonate(signer);
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
//#endregion Uniswap