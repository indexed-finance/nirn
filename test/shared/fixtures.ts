import { BigNumber } from "ethers";
import { waffle } from "hardhat";
import { AdapterRegistry, TestAdapter, TestERC20, TestVault } from "../../typechain";
import { deployContract, getBigNumber, getContract } from "./utils";

export async function deployTestAdaptersAndRegistry(name: string = 'Test Token', symbol: string = 'TOK', initBalance: BigNumber = getBigNumber(100)) {
  const [wallet,,protocolAdapter] = waffle.provider.getWallets()
  const underlying: TestERC20 = await deployContract('TestERC20', name, symbol, initBalance);
  const adapter1: TestAdapter = await deployContract('TestAdapter', underlying.address, getBigNumber(1, 17)) // 10% apr
  const adapter2: TestAdapter = await deployContract('TestAdapter', underlying.address, getBigNumber(5, 16)) // 5% apr
  const wrapper1: TestVault = await getContract(await adapter1.token(), 'TestVault')
  const wrapper2: TestVault = await getContract(await adapter2.token(), 'TestVault')
  await underlying.approve(adapter1.address, initBalance.div(2))
  await underlying.approve(adapter2.address, initBalance.div(2))
  await adapter1.deposit(initBalance.div(2))
  await adapter2.deposit(initBalance.div(2))
  const registry: AdapterRegistry = await deployContract('AdapterRegistry')
  await registry.addProtocolAdapter(protocolAdapter.address)
  await registry.connect(protocolAdapter).addTokenAdapters([ adapter1.address, adapter2.address ])
  return {
    underlying,
    adapter1,
    adapter2,
    wrapper1,
    wrapper2,
    registry
  }
}