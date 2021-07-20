import { getContractAddress } from '@ethersproject/address';
import { JsonRpcSigner } from '@ethersproject/providers';
import { BigNumber, Contract } from 'ethers';
import { ethers, network } from 'hardhat';
import { TestFactory, IProtocolAdapter } from '../../typechain';

export async function batchMap(adapter: IProtocolAdapter, batchSize: number) {
  const unmapped = await adapter.getUnmapped();
  let remaining = unmapped.length;
  while (remaining > 0) {
    await adapter.map(batchSize);
    remaining -= batchSize;
  }
}

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

//#region Chain utils

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

export async function createSnapshot() {
  let snapshotId = await network.provider.request({
    method: 'evm_snapshot'
  });
  return async () => {
    await network.provider.request({
      method: 'evm_revert',
      params: [snapshotId]
    });
    snapshotId = await network.provider.request({
      method: 'evm_snapshot'
    });
  }
}
//#endregion

//#region Impersonation utils

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

export async function withSigner(address: string, fn: (signer: JsonRpcSigner) => Promise<void>) {
  const signer = await impersonate(address);
  await fn(signer);
  await stopImpersonating(address);
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

export async function deployClone<C extends Contract>(implementation: C): Promise<C> {
  const cloneFactory: TestFactory = await deployContract('TestFactory');
  await cloneFactory.clone(implementation.address);
  const address = await cloneFactory.last();
  return new Contract(address, implementation.interface, implementation.signer) as C;
}