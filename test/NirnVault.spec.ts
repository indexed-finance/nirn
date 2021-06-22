import { formatEther } from "@ethersproject/units";
import { expect } from "chai";
import { BigNumber, constants } from "ethers";
import { waffle } from "hardhat";
import { AdapterRegistry, CErc20Adapter, CallForwarder, CrErc20Adapter, IERC20, IProtocolAdapter, NirnVault } from "../typechain"
import { deployContract, getBigNumber, getContract, resetFork, sendEtherTo, sendTokenTo } from "./shared";

describe('NirnVault', () => {
  const [wallet] = waffle.provider.getWallets()

  let underlying: IERC20
  let registry: AdapterRegistry
  let vault: NirnVault
  let compound: IProtocolAdapter
  let cream: IProtocolAdapter
  let adapter1: CErc20Adapter
  let adapter2: CrErc20Adapter
  let wrapper1: IERC20
  let wrapper2: IERC20

  async function batchMap(adapter: IProtocolAdapter, batchSize: number) {
    const unmapped = await adapter.getUnmapped();
    let remaining = unmapped.length;
    while (remaining > 0) {
      await adapter.map(batchSize);
      remaining -= batchSize;
    }
  }

  const deposit = async (amount: BigNumber) => {
    await sendTokenTo(underlying.address, wallet.address, amount)
    return vault.deposit(amount)
  }

  const setupTests = (withDeposit = false) => {
    before('Deploy vault and registry', async () => {
      await resetFork()
      await sendEtherTo(wallet.address);
      registry = await deployContract('AdapterRegistry')
      underlying = await getContract('0x6b175474e89094c44da98b954eedeac495271d0f', 'IERC20')
      compound = await deployContract('CompoundProtocolAdapter', registry.address)
      cream = await deployContract('CreamProtocolAdapter', registry.address)
      await registry.addProtocolAdapter(compound.address)
      await registry.addProtocolAdapter(cream.address)
      await batchMap(compound, 4)
      await batchMap(cream, 4)
      vault = await deployContract('NirnVault', registry.address, constants.AddressZero, underlying.address)
      const { adapters } = await registry.getAdaptersSortedByAPR(underlying.address)
      adapter1 = await getContract(adapters[0], 'CErc20Adapter')
      adapter2 = await getContract(adapters[1], 'CErc20Adapter')
      wrapper1 = await getContract(await adapter1.token(), 'IERC20')
      wrapper2 = await getContract(await adapter2.token(), 'IERC20')
      await underlying.approve(vault.address, constants.MaxUint256);
      if (withDeposit) {
        await deposit(getBigNumber(10))
      }
    })
  }

  describe('Constructor', () => {
    setupTests()

    it('Should add adapter with highest APR', async () => {
      await expect(vault.deployTransaction)
        .to.emit(vault, 'AdapterAdded')
        .withArgs(adapter1.address, await adapter1.token(), getBigNumber(1))
        .to.emit(underlying, 'Approval')
        .withArgs(vault.address, adapter1.address, constants.MaxUint256)
    })

    it('Should add wrapper to lockedTokens', async () => {
      expect(await vault.lockedTokens(wrapper1.address)).to.be.true
    })

    it('Should set reserveRatio to 10%', async () => {
      expect(await vault.reserveRatio()).to.eq(getBigNumber(1, 17))
    })

    it('Should set feeRecipient to deployer', async () => {
      expect(await vault.feeRecipient()).to.eq(wallet.address)
    })

    it('Should add highest APR adapter to adapters', async () => {
      expect(await vault.getAdapters()).to.deep.eq([adapter1.address])
    })

    it('Should set weights to 100%', async () => {
      expect(await vault.getWeights()).to.deep.eq([getBigNumber(1)])
    })

    it('Should set priceAtLastFee to 1', async () => {
      expect(await vault.priceAtLastFee()).to.eq(getBigNumber(1))
    })

    it('Should set performanceFee to 5%', async () => {
      expect(await vault.performanceFee()).to.eq(getBigNumber(5, 16))
    })

    it('Should set name to Indexed {underlying.name()}', async () => {
      expect(await vault.name()).to.eq('Indexed Dai Stablecoin')
    })

    it('Should set symbol to n{underlying.symbol()}', async () => {
      expect(await vault.symbol()).to.eq('nDAI')
    })
  })

  describe('When using a single adapter', () => {
    describe('deposit', () => {
      setupTests()

      it('Should revert if caller has insufficient balance/allowance', async () => {
        await expect(vault.deposit(getBigNumber(1))).to.be.revertedWith('TH:STF')
      })
  
      it('Should mint 1 vault token per underlying on first deposit', async () => {
        await sendTokenTo(underlying.address, wallet.address, getBigNumber(10))
        await underlying.approve(vault.address, constants.MaxUint256);
        await expect(vault.deposit(getBigNumber(10)))
          .to.emit(underlying, 'Transfer')
          .withArgs(wallet.address, vault.address, getBigNumber(10))
          .to.emit(vault, 'Transfer')
          .withArgs(constants.AddressZero, wallet.address, getBigNumber(10))
      })
  
      it('Should mint vault tokens proportional to deposit', async () => {
        await sendTokenTo(underlying.address, vault.address, getBigNumber(10))
        await expect(await deposit(getBigNumber(10)))
          .to.emit(underlying, 'Transfer')
          .withArgs(wallet.address, vault.address, getBigNumber(10))
          .to.emit(vault, 'Transfer')
          .withArgs(constants.AddressZero, wallet.address, getBigNumber(5))
      })
    })
  
    describe('getCurrentLiquidityDeltas', () => {
      setupTests(true)

      it('Should return amounts that should be added or removed per adapter', async () => {
        expect(await vault.getCurrentLiquidityDeltas()).to.deep.eq([ getBigNumber(9) ])
      })
    })

    describe('getHypotheticalLiquidityDeltas(uint256[])', () => {
      setupTests(true)

      it('Should revert if weights.length != adapters.length', async () => {
        await expect(
          vault["getHypotheticalLiquidityDeltas(uint256[])"]([getBigNumber(5, 17), getBigNumber(1)])
        ).to.be.revertedWith('bad lengths')
      })

      it('Should return weighted amounts that should be deposited per adapter', async () => {
        expect(await vault["getHypotheticalLiquidityDeltas(uint256[])"]([getBigNumber(5, 17)])).to.deep.eq([ getBigNumber(45, 17) ])
      })

      it('Should return current deltas if given current weights', async () => {
        expect(await vault["getHypotheticalLiquidityDeltas(uint256[])"]([getBigNumber(1)])).to.deep.eq(await vault.getCurrentLiquidityDeltas())
      })

      it('Accounts for existing deposits', async () => {
        await vault.rebalance()
        const wBalance = await wrapper1.balanceOf(vault.address)
        const balanceValue = await adapter1.toUnderlyingAmount(wBalance)
        const totalUnderlying = balanceValue.add(getBigNumber(1))
        const available = totalUnderlying.sub(totalUnderlying.mul(1).div(10))
        const expectedDelta = available.mul(getBigNumber(5, 17)).div(getBigNumber(1)).sub(balanceValue)
        expect(await vault["getHypotheticalLiquidityDeltas(uint256[])"]([getBigNumber(5, 17)])).to.deep.eq([ expectedDelta ])
      })
    })

    describe('getHypotheticalLiquidityDeltas(address[],uint256[])', () => {
      setupTests(true)

      it('Should revert if weights.length != adapters.length', async () => {
        await expect(vault["getHypotheticalLiquidityDeltas(address[],uint256[])"](
          [adapter1.address],
          [getBigNumber(5, 17), getBigNumber(5, 17)]
        )).to.be.revertedWith('bad lengths')
      })

      it('Should return weighted amounts that should be deposited per adapter', async () => {
        expect(await vault["getHypotheticalLiquidityDeltas(address[],uint256[])"](
          [adapter1.address, adapter2.address],
          [getBigNumber(5, 17), getBigNumber(5, 17)]
        )).to.deep.eq(
          [ getBigNumber(45, 17), getBigNumber(45, 17) ]
        )
      })

      it('Accounts for existing deposits', async () => {
        await vault.rebalance()
        const wBalance = await wrapper1.balanceOf(vault.address)
        const balanceValue = await adapter1.toUnderlyingAmount(wBalance)
        const totalUnderlying = balanceValue.add(getBigNumber(1))
        const available = totalUnderlying.sub(totalUnderlying.mul(1).div(10))
        const expectedDelta1 = available.mul(getBigNumber(5, 17)).div(getBigNumber(1)).sub(balanceValue)
        const expectedDelta2 = available.mul(getBigNumber(5, 17)).div(getBigNumber(1))
        expect(await vault["getHypotheticalLiquidityDeltas(address[],uint256[])"](
          [adapter1.address, adapter2.address],
          [getBigNumber(5, 17), getBigNumber(5, 17)]
        )).to.deep.eq([ expectedDelta1, expectedDelta2 ])
      })
    })
  
    describe('getBalances', () => {
      setupTests(true)

      it('Should return balances per adapter', async () => {
        expect(await vault.getBalances()).to.deep.eq([ BigNumber.from(0) ]);
        await vault.rebalance()
        const wBalance = await wrapper1.balanceOf(vault.address)
        const balanceValue = await adapter1.toUnderlyingAmount(wBalance)
        expect(await vault.getBalances()).to.deep.eq([ balanceValue ])
      })
    })

    describe('getAPR', () => {
      setupTests(true)

      it('Should return APR accounting for current liquidity deltas and reserveRatio', async () => {
        let apr = await adapter1.getHypotheticalAPR(getBigNumber(9))
        apr = apr.mul(9).div(10)
        expect(await vault.getAPR()).to.eq(apr)
        await vault.rebalance()
        apr = await adapter1.getAPR()
        apr = apr.sub(apr.div(10))
        expect(await vault.getAPR()).to.eq(apr)
      })
    })

    describe('getHypotheticalAPR(uint256[])', () => {
      setupTests(true)

      it('Should revert if weights.length != adapters.length', async () => {
        await expect(vault["getHypotheticalAPR(uint256[])"]([getBigNumber(1), getBigNumber(1)])).to.be.revertedWith('bad lengths')
      })

      it('Should return APR for hypothetical new weights', async () => {
        let apr = await adapter1.getHypotheticalAPR(getBigNumber(45, 17))
        apr = apr.mul(9).div(20)
        expect(await vault["getHypotheticalAPR(uint256[])"]([getBigNumber(5, 17)])).to.eq(apr)
      })

      it('Accounts for deposits', async () => {
        await vault.rebalance()
        const wBalance = await wrapper1.balanceOf(vault.address)
        const balanceValue = await adapter1.toUnderlyingAmount(wBalance)
        const totalUnderlying = balanceValue.add(getBigNumber(1))
        const available = totalUnderlying.sub(totalUnderlying.mul(1).div(10))
        const delta = available.div(2).sub(balanceValue)
        let apr = await adapter1.getHypotheticalAPR(delta)
        apr = apr.mul(9).div(20)
        expect(await vault["getHypotheticalAPR(uint256[])"]([getBigNumber(5, 17)])).to.eq(apr)
      })
    })

    describe('getHypotheticalAPR(address[],uint256[])', () => {
      setupTests(true)

      it('Should revert if weights.length != adapters.length', async () => {
        await expect(vault["getHypotheticalAPR(address[],uint256[])"](
          [adapter1.address],
          [getBigNumber(1), getBigNumber(1)]
        )).to.be.revertedWith('bad lengths')
      })

      it('Should return APR for hypothetical new weights and adapters', async () => {
        let apr1 = (await adapter1.getHypotheticalAPR(getBigNumber(45, 17))).mul(9).div(20)
        let apr2 = (await adapter2.getHypotheticalAPR(getBigNumber(45, 17))).mul(9).div(20)
        let apr = apr1.add(apr2)
        expect(await vault["getHypotheticalAPR(address[],uint256[])"](
          [adapter1.address, adapter2.address],
          [getBigNumber(5, 17), getBigNumber(5, 17)]
        )).to.eq(apr)
      })

      it('Accounts for deposits', async () => {
        await vault.rebalance()
        const wBalance = await wrapper1.balanceOf(vault.address)
        const balanceValue = await adapter1.toUnderlyingAmount(wBalance)
        const totalUnderlying = balanceValue.add(getBigNumber(1))
        const available = totalUnderlying.sub(totalUnderlying.mul(1).div(10))
        const target = available.mul(getBigNumber(5, 17)).div(getBigNumber(1))
        const delta1 = target.sub(balanceValue)
        const delta2 = target
        let apr1 = (await adapter1.getHypotheticalAPR(delta1)).mul(getBigNumber(5, 17)).div(getBigNumber(1))
        let apr2 = (await adapter2.getHypotheticalAPR(delta2)).mul(getBigNumber(5, 17)).div(getBigNumber(1))
        let apr = apr1.add(apr2)
        apr = apr.sub(apr.div(10))
        expect(await vault["getHypotheticalAPR(address[],uint256[])"](
          [adapter1.address, adapter2.address],
          [getBigNumber(5, 17), getBigNumber(5, 17)]
        )).to.eq(apr)
      })
    })

    describe('rebalance', () => {
      setupTests(true)

      it('Should revert if not called by an EOA', async () => {
        const fwd: CallForwarder = await deployContract('CallForwarder')
        await expect(
          fwd.execute(
            vault.address,
            (await vault.populateTransaction.rebalance()).data as string
          )
        ).to.be.revertedWith('!EOA')
      })

      it('Should rebalance to targets', async () => {
        await expect(vault.rebalance())
          .to.emit(underlying, 'Transfer')
          .withArgs(vault.address, adapter1.address, getBigNumber(9))
      })
    })

    describe('rebalanceWithNewWeights', () => {
      setupTests(true)

      it('Should revert if not called by an EOA', async () => {
        const fwd: CallForwarder = await deployContract('CallForwarder')
        await expect(
          fwd.execute(
            vault.address,
            (await vault.populateTransaction.rebalanceWithNewWeights([ getBigNumber(1) ])).data as string
          )
        ).to.be.revertedWith('!EOA')
      })

      it('Should revert if weights do not add to 1e18', async () => {
        await expect(
          vault.rebalanceWithNewWeights([ getBigNumber(5, 16), getBigNumber(96, 16) ])
        ).to.be.revertedWith('weights != 100%')
      })

      it('Should revert if any weights <5%', async () => {
        await expect(
          vault.rebalanceWithNewWeights([ getBigNumber(4, 16), getBigNumber(96, 16) ])
        ).to.be.revertedWith('weight < 5%')
      })

      it('Should revert if new APR not better', async () => {
        await expect(
          vault.rebalanceWithNewWeights([ getBigNumber(5, 17), getBigNumber(5, 17) ])
        ).to.be.revertedWith('!increased')
      })

      it('Should revert if new APR not 5% better', async () => {
        // const depositAmount = await wrapper1.totalSupply()
        const aprNow1 = await adapter1.getAPR()
        const aprNow2 = await adapter2.getAPR()
        const diffFractionE18 = aprNow1.sub(aprNow2).mul(getBigNumber(1)).div(aprNow2);
        const totalValue = await adapter2.totalLiquidity()
        const increaseSupplyBy = totalValue.mul(diffFractionE18).div(getBigNumber(1))
        await sendTokenTo(underlying.address, wallet.address, increaseSupplyBy)
        await underlying.approve(adapter1.address, increaseSupplyBy)
        await adapter1.deposit(increaseSupplyBy)
        console.log(`${formatEther((await adapter1.getAPR()).mul(100))}%`)
        console.log(`${formatEther((await adapter2.getAPR()).mul(100))}%`)
      })
    })
  })
})