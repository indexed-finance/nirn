import { BigNumber, constants } from "ethers";
import { waffle } from "hardhat";
import { AdapterRegistry, TestAdapter, TestERC20, TestNirnVault, TestVault } from "../../typechain";
import { deployClone, deployContract, getBigNumber, getContract } from "./utils";

export async function deployTestWrapperAndAdapter(
  underlying: string,
  apr: BigNumber = getBigNumber(1, 17)
) {
  const wrapper: TestVault = await deployContract('TestVault', underlying);
  const adapter: TestAdapter = await deployContract('TestAdapter', underlying, wrapper.address, apr) // 10% apr
  return { adapter, wrapper };
}

export function deployTestERC20(name: string = 'Test Token', symbol: string = 'TOK', initBalance: BigNumber = getBigNumber(100)): Promise<TestERC20> {
  return deployContract('TestERC20', name, symbol, initBalance);
}

export async function deployTestVaultStack(
  registry: AdapterRegistry,
  eoaSafeCaller = constants.AddressZero,
  name: string = 'Test Token 2',
  symbol: string = 'TOK2',
  initBalance: BigNumber = getBigNumber(150)
) {
  const [owner,,protocolAdapter, vaultFactory] = waffle.provider.getWallets()
  const underlying: TestERC20 = await deployContract('TestERC20', name, symbol, initBalance);
  const { adapter: adapter1 } = await deployTestWrapperAndAdapter(underlying.address, getBigNumber(1, 17))
  const { adapter: adapter2 } = await deployTestWrapperAndAdapter(underlying.address, getBigNumber(5, 16))
  await underlying.approve(adapter1.address, constants.MaxUint256)
  await underlying.approve(adapter2.address, constants.MaxUint256)
  await adapter1.deposit(initBalance.div(3))
  await adapter2.deposit(initBalance.div(3))
  if ((await registry.protocolAdapterIds(protocolAdapter.address)).eq(0)) {
    await registry.addProtocolAdapter(protocolAdapter.address)
  }
  await registry.connect(protocolAdapter).addTokenAdapters([ adapter1.address, adapter2.address ])
  if (!(await registry.approvedVaultFactories(vaultFactory.address))) {
    await registry.addVaultFactory(vaultFactory.address)
  }
  const implementation = await deployContract<TestNirnVault>('TestNirnVault', registry.address, eoaSafeCaller)
  const vault = await deployClone(implementation)
  await vault.initialize(underlying.address, owner.address, owner.address, owner.address)
  await registry.connect(vaultFactory).addVault(vault.address)
  await underlying.approve(vault.address, constants.MaxUint256)
  await underlying.mint(owner.address, getBigNumber(4))
  return {
    adapter1,
    adapter2,
    underlying,
    vault
  }
}

export async function deployTestAdaptersAndRegistry(name: string = 'Test Token', symbol: string = 'TOK', initBalance: BigNumber = getBigNumber(150), approveAdapters = true) {
  const [,,protocolAdapter] = waffle.provider.getWallets()
  const underlying: TestERC20 = await deployContract('TestERC20', name, symbol, initBalance);
  const { adapter: adapter1, wrapper: wrapper1 } = await deployTestWrapperAndAdapter(underlying.address, getBigNumber(1, 17))
  const { adapter: adapter2, wrapper: wrapper2 } = await deployTestWrapperAndAdapter(underlying.address, getBigNumber(5, 16))
  const { adapter: adapter3, wrapper: wrapper3 } = await deployTestWrapperAndAdapter(underlying.address, getBigNumber(1, 16))
  await underlying.approve(adapter1.address, constants.MaxUint256)
  await underlying.approve(adapter2.address, constants.MaxUint256)
  await underlying.approve(adapter3.address, constants.MaxUint256)
  await adapter1.deposit(initBalance.div(3))
  await adapter2.deposit(initBalance.div(3))
  await adapter3.deposit(initBalance.div(3))
  const registry: AdapterRegistry = await deployContract('AdapterRegistry')
  await registry.addProtocolAdapter(protocolAdapter.address)
  if (approveAdapters) {
    await registry.connect(protocolAdapter).addTokenAdapters([ adapter1.address, adapter2.address, adapter3.address ])
  }
  return {
    underlying,
    adapter1,
    adapter2,
    adapter3,
    wrapper1,
    wrapper2,
    wrapper3,
    registry
  }
}