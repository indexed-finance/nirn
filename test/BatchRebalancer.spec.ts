import { expect } from 'chai'
import { constants } from 'ethers'
import { waffle } from 'hardhat'
import { AdapterRegistry, BatchRebalancer, TestAdapter, TestERC20, TestBatcherRevert, TestNirnVault, CallForwarder } from '../typechain'

import { createSnapshot, deployClone, deployContract, deployTestAdaptersAndRegistry, deployTestVaultStack, getBigNumber } from "./shared"


/**
 * This test file is used to automatically generate tests for all the tokens
 * in each protocol.
 */
describe('Map Protocols', () => {
  const [owner, notOwner, approvedProtocol, approvedFactory] = waffle.provider.getWallets()

  let registry: AdapterRegistry
  let adapter1: TestAdapter
  let adapter2: TestAdapter
  let underlying: TestERC20
  let batcher: BatchRebalancer
  let vault: TestNirnVault
  let restoreSnapshot: () => Promise<void>

  before(async () => {
    ;({
      underlying,
      adapter1,
      adapter2,
      registry
    } = await deployTestAdaptersAndRegistry())
    batcher = await deployContract('BatchRebalancer', registry.address)
    const implementation = await deployContract<TestNirnVault>('TestNirnVault', registry.address, batcher.address)
    vault = await deployClone(implementation)
    await registry.addVaultFactory(approvedFactory.address)
    await underlying.approve(vault.address, constants.MaxUint256)
    await underlying.mint(owner.address, getBigNumber(4))
    await vault.initialize(underlying.address, owner.address, owner.address, owner.address)
    await registry.connect(approvedFactory).addVault(vault.address)

    await vault.deposit(getBigNumber(1))
    restoreSnapshot = await createSnapshot()
  })

  beforeEach(() => restoreSnapshot())

  describe('batchExecuteRebalance()', () => {
    describe('Revert message forwarding', () => {
      it('Should pass along reason string', async () => {
        await expect(batcher.batchExecuteRebalance(
          [vault.address],
          [vault.interface.encodeFunctionData('rebalanceWithNewAdapters', [[], [getBigNumber(1)]])]
        )).to.be.revertedWith('bad lengths')
      })

      it('Should revert with default message if no reason string', async () => {
        const testRevert = await deployContract<TestBatcherRevert>('TestBatcherRevert')
        await registry.connect(approvedFactory).addVault(testRevert.address)
        await expect(batcher.batchExecuteRebalance(
          [testRevert.address],
          [vault.interface.encodeFunctionData('rebalance')]
        )).to.be.revertedWith('silent revert')
      })
    })

    describe('Validation', async () => {
      it('Should revert if caller is not an EOA', async () => {
        const callForwarder = await deployContract<CallForwarder>('CallForwarder')
        await expect(
          callForwarder.execute(
            batcher.address,
            batcher.interface.encodeFunctionData('batchExecuteRebalance', [[], []])
          )
        ).to.be.revertedWith('!EOA')
      })

      it('Should revert if array lengths do not match', async () => {
        await expect(batcher.batchExecuteRebalance(
          [constants.AddressZero],
          []
        )).to.be.revertedWith('bad lengths')
      })

      it('Should revert if vault not registered', async () => {
        const testRevert = await deployContract<TestBatcherRevert>('TestBatcherRevert')
        await expect(batcher.batchExecuteRebalance(
          [testRevert.address],
          [vault.interface.encodeFunctionData('rebalance')]
        )).to.be.revertedWith('bad vault')
      })

      it('Should revert if fn sig is not approved', async () => {
        await expect(batcher.batchExecuteRebalance(
          [vault.address],
          [vault.interface.encodeFunctionData('balance')]
        )).to.be.revertedWith('fn not allowed')
      })
    })

    it('Should allow rebalance', async () => {
      await expect(
        batcher.batchExecuteRebalance(
          [vault.address],
          [vault.interface.encodeFunctionData('rebalance')]
        )
      )
        .to.emit(vault, 'Rebalanced')
    })

    it('Should allow rebalanceWithNewAdapters', async () => {
      await adapter2.setAnnualInterest(getBigNumber(10))
      await expect(
        batcher.batchExecuteRebalance(
          [vault.address],
          [
            vault.interface.encodeFunctionData(
              'rebalanceWithNewAdapters',
              [[adapter2.address], [getBigNumber(1)]]
            )
          ]
        )
      )
        .to.emit(vault, 'AllocationsUpdated')
        .withArgs([adapter2.address], [getBigNumber(1)])
    })

    it('Should allow rebalanceWithNewWeights', async () => {
      await vault.setAdaptersAndWeightsInternal([adapter1.address, adapter2.address], [getBigNumber(5, 17), getBigNumber(5, 17)])
      await adapter1.setAnnualInterest(getBigNumber(10))
      await expect(
        batcher.batchExecuteRebalance(
          [vault.address],
          [
            vault.interface.encodeFunctionData(
              'rebalanceWithNewWeights',
              [[getBigNumber(9, 17), getBigNumber(1, 17)]]
            )
          ]
        )
      )
        .to.emit(vault, 'AllocationsUpdated')
        .withArgs([adapter1.address, adapter2.address], [getBigNumber(9, 17), getBigNumber(1, 17)])
    })

    it('Should allow multiple rebalance calls', async () => {
      await vault.setAdaptersAndWeightsInternal([adapter1.address, adapter2.address], [getBigNumber(5, 17), getBigNumber(5, 17)])
      const {
        vault: vault2,
        adapter2: preferredAdapter
      } = await deployTestVaultStack(registry, batcher.address)
      await adapter2.setAnnualInterest(getBigNumber(10))
      await preferredAdapter.setAnnualInterest(getBigNumber(10))
      await expect(
        batcher.batchExecuteRebalance(
          [vault.address, vault2.address],
          [
            vault.interface.encodeFunctionData(
              'rebalanceWithNewWeights',
              [[getBigNumber(1, 17), getBigNumber(9, 17)]]
            ),
            vault.interface.encodeFunctionData(
              'rebalanceWithNewAdapters',
              [
                [preferredAdapter.address],
                [getBigNumber(1)]
              ]
            )
          ]
        )
      )
        .to.emit(vault, 'AllocationsUpdated')
        .withArgs([adapter1.address, adapter2.address], [getBigNumber(1, 17), getBigNumber(9, 17)])
        .to.emit(vault2, 'AllocationsUpdated')
        .withArgs([preferredAdapter.address], [getBigNumber(1)])
    })
  })
})