import { formatEther } from "@ethersproject/units";
import { expect } from "chai";
import { BigNumber, constants, ContractTransaction } from "ethers";
import { waffle } from "hardhat";
import { AdapterRegistry, TestAdapter, TestNirnVault, TestERC20, TestVault } from "../typechain"
import { createSnapshot, deployContract, getBigNumber } from "./shared";
import { deployTestAdaptersAndRegistry, deployTestERC20, deployTestWrapperAndAdapter } from "./shared/fixtures";

const diff = (expected: BigNumber, actual: BigNumber) => expected.sub(actual).abs();

describe('NirnVault', () => {
  const [wallet, feeRecipient] = waffle.provider.getWallets()

  let underlying: TestERC20
  let registry: AdapterRegistry
  let vault: TestNirnVault
  let adapter1: TestAdapter
  let adapter2: TestAdapter
  let adapter3: TestAdapter
  let wrapper1: TestVault
  let wrapper2: TestVault
  let wrapper3: TestVault
  let restoreSnapshot: () => Promise<void>;

  const deposit = async (amount: BigNumber) => {
    await underlying.mint(wallet.address, amount)
    return vault.deposit(amount)
  }

  before(async () => {
    ({
      underlying,
      adapter1,
      adapter2,
      adapter3,
      wrapper1,
      wrapper2,
      wrapper3,
      registry
    } = await deployTestAdaptersAndRegistry())
    vault = await deployContract('TestNirnVault', registry.address, constants.AddressZero, underlying.address, constants.AddressZero, feeRecipient.address)
    await underlying.approve(vault.address, constants.MaxUint256)
    restoreSnapshot = await createSnapshot()
  })

  const reset = async (withDeposit = false) => {
    await restoreSnapshot();
    if (withDeposit) {
      await deposit(getBigNumber(10))
    }
  }

  const setupTests = (withDeposit = false) => {
    before(() => reset(withDeposit))
  }

  describe('Constructor', () => {
    setupTests()

    it('Should add wrapper to lockedTokens', async () => {
      expect(await vault.lockedTokens(wrapper1.address)).to.be.true
    })

    it('Should set reserveRatio to 10%', async () => {
      expect(await vault.reserveRatio()).to.eq(getBigNumber(1, 17))
    })

    it('Should set feeRecipient to address given in constructor params', async () => {
      expect(await vault.feeRecipient()).to.eq(feeRecipient.address)
    })

    it('Should add highest APR adapter to adapters', async () => {
      const { adapters, weights } = await vault.getAdaptersAndWeights()
      expect(adapters).to.deep.eq([adapter1.address])
      expect(weights).to.deep.eq([getBigNumber(1)])
    })

    it('Should set priceAtLastFee to 1', async () => {
      expect(await vault.priceAtLastFee()).to.eq(getBigNumber(1))
    })

    it('Should set performanceFee to 5%', async () => {
      expect(await vault.performanceFee()).to.eq(getBigNumber(5, 16))
    })

    it('Should set name to Indexed {underlying.name()}', async () => {
      expect(await vault.name()).to.eq('Indexed Test Token')
    })

    it('Should set symbol to n{underlying.symbol()}', async () => {
      expect(await vault.symbol()).to.eq('nTOK')
    })
  })

  describe('Internal functions', () => {
    describe('setAdaptersAndWeight()', () => {
      setupTests()
      let tx: Promise<ContractTransaction>
  
      it('Should approve adapter to spend underlying and wrapper', async () => {
        tx = vault.setAdaptersAndWeightsInternal([adapter2.address], [getBigNumber(1)])
        await expect(tx)
          .to.emit(underlying, 'Approval')
          .withArgs(vault.address, adapter2.address, constants.MaxUint256)
          .to.emit(wrapper2, 'Approval')
          .withArgs(vault.address, adapter2.address, constants.MaxUint256)
      })
  
      it('Should emit AllocationsUpdated', async () => {
        await expect(tx)
          .to.emit(vault, 'AllocationsUpdated')
          .withArgs([adapter2.address], [getBigNumber(1)])
      })
  
      it('Should write packed adapters and weights', async () => {
        const { adapters, weights } = await vault.getAdaptersAndWeights()
        expect(adapters).to.deep.eq([adapter2.address])
        expect(weights).to.deep.eq([getBigNumber(1)])
      })
  
      it('Should mark wrapper as locked', async () => {
        expect(await vault.lockedTokens(wrapper2.address)).to.be.true
      })
    })

    describe('removeAdapters()', () => {
      setupTests()

      it('Should remove adapters at provided indices', async () => {
        await expect(vault.removeAdaptersInternal([0]))
          .to.emit(vault, 'AdapterRemoved')
          .withArgs(adapter1.address)
        const { adapters } = await vault.getAdaptersAndWeights()
        expect(adapters).to.deep.eq([])
      })
    })

    describe('currentDistribution()', () => {
      setupTests(true);

      it('Should set correct parameters for current adapters', async () => {
        const dist = await vault.currentDistributionInternal();
        expect(dist.totalProductiveBalance).to.eq(getBigNumber(9))
        expect(dist._reserveBalance).to.eq(getBigNumber(10))
        expect(dist.params.adapters).to.deep.eq([adapter1.address])
        expect(dist.params.weights).to.deep.eq([getBigNumber(1)])
        expect(dist.params.liquidityDeltas).to.deep.eq([getBigNumber(9)])
        expect(dist.params.balances).to.deep.eq([BigNumber.from(0)])
        let apr = await adapter1.getHypotheticalAPR(getBigNumber(9))
        apr = apr.sub(apr.mul(getBigNumber(1,17)).div(getBigNumber(1)))
        expect(dist.params.netAPR).to.eq(apr)
      })
    })

    describe('withdrawToMatchAmount()', () => {
      setupTests(true)

      it('Should revert if not enough assets can be withdrawn', async () => {
        await vault.rebalance()
        await adapter1.setAvailableLiquidity(0)
        await expect(
          vault.withdrawToMatchAmountInternal(
            [adapter1.address],
            [getBigNumber(1)],
            [getBigNumber(9)],
            getBigNumber(1),
            getBigNumber(2)
          )
        ).to.be.revertedWith('insufficient available balance')
      })

      it('Should remove adapters with weight 0 and full balance withdrawn', async () => {
        await adapter1.setAvailableLiquidity(constants.MaxUint256)
        await expect(
          vault.withdrawToMatchAmountInternal(
            [adapter1.address],
            [0],
            [getBigNumber(9)],
            getBigNumber(0),
            getBigNumber(9)
          )
        )
          .to.emit(vault, 'AdapterRemoved')
          .withArgs(adapter1.address)
        const { adapters, weights } = await vault.getAdaptersAndWeights()
        expect(adapters).to.deep.eq([])
        expect(weights).to.deep.eq([])
      })
    })
  })

  describe('deposit()', () => {
    setupTests()

    it('Should revert if caller has insufficient balance/allowance', async () => {
      await expect(vault.deposit(getBigNumber(1))).to.be.revertedWith('TH:STF')
    })

    it('Should mint 1 vault token per underlying on first deposit', async () => {
      await underlying.mint(wallet.address, getBigNumber(10))
      await underlying.approve(vault.address, constants.MaxUint256);
      await expect(vault.deposit(getBigNumber(10)))
        .to.emit(underlying, 'Transfer')
        .withArgs(wallet.address, vault.address, getBigNumber(10))
        .to.emit(vault, 'Transfer')
        .withArgs(constants.AddressZero, wallet.address, getBigNumber(10))
    })

    it('Should claim fees before deposit', async () => {
      await underlying.mint(vault.address, getBigNumber(10))
      const fees = getBigNumber(5, 17)
      const feeShares = fees.mul(getBigNumber(10)).div(getBigNumber(195, 17))
      const shares = getBigNumber(10)
        .mul(getBigNumber(10).add(feeShares))
        .div(getBigNumber(20))
      await expect(await deposit(getBigNumber(10)))
        .to.emit(underlying, 'Transfer')
        .withArgs(wallet.address, vault.address, getBigNumber(10))
        .to.emit(vault, 'Transfer')
        .withArgs(constants.AddressZero, feeRecipient.address, feeShares)
        .to.emit(vault, 'Transfer')
        .withArgs(constants.AddressZero, wallet.address, shares)
    })
  })
  
  describe('withdraw()', () => {
    beforeEach(() => reset(true))

    it('Should withdraw from vault if it has sufficient reserves', async () => {
      await expect(vault.withdraw(getBigNumber(5)))
        .to.emit(underlying, 'Transfer')
        .withArgs(vault.address, wallet.address, getBigNumber(5))
      expect(await vault.balanceOf(wallet.address)).to.eq(getBigNumber(5))
    })

    it('Should withdraw from adapter if vault has insufficient reserves', async () => {
      await vault.rebalance()
      await expect(vault.withdraw(getBigNumber(5)))
        .to.emit(underlying, 'Transfer')
        .withArgs(adapter1.address, vault.address,getBigNumber(4))
        .to.emit(underlying, 'Transfer')
        .withArgs(vault.address, wallet.address, getBigNumber(5))
      expect(await vault.balanceOf(wallet.address)).to.eq(getBigNumber(5))
    })

    it('Should withdraw from adapters until vault has sufficient balance', async () => {
      await vault.setAdaptersAndWeightsInternal(
        [adapter1.address, adapter2.address],
        [getBigNumber(5, 17), getBigNumber(5, 17)]
      )
      await vault.rebalance()
      await expect(vault.withdraw(getBigNumber(6)))
        .to.emit(underlying, 'Transfer')
        .withArgs(adapter1.address, vault.address,getBigNumber(45, 17))
        .to.emit(underlying, 'Transfer')
        .withArgs(adapter2.address, vault.address,getBigNumber(5, 17))
        .to.emit(underlying, 'Transfer')
        .withArgs(vault.address, wallet.address, getBigNumber(6))
      expect(await vault.balanceOf(wallet.address)).to.eq(getBigNumber(4))
    })

    it('Should claim fees', async () => {
      await underlying.mint(vault.address, getBigNumber(10))
      await vault.rebalance()
      const fees = getBigNumber(5, 17);
      const sharesForFees = fees.mul(getBigNumber(10)).div(getBigNumber(195, 17));
      const underlyingWithdrawn = getBigNumber(5).mul(getBigNumber(20)).div(getBigNumber(10).add(sharesForFees))
      // 100% profit since last time fee was taken
      await expect(vault.withdraw(getBigNumber(5)))
        .to.emit(underlying, 'Transfer')
        .withArgs(adapter1.address, vault.address, underlyingWithdrawn.sub(getBigNumber(2)))
        .to.emit(vault, 'Transfer')
        .withArgs(constants.AddressZero, feeRecipient.address, sharesForFees)
        .to.emit(vault, 'FeesClaimed')
        .withArgs(fees, sharesForFees)
        .to.emit(underlying, 'Transfer')
        .withArgs(vault.address, wallet.address, underlyingWithdrawn)
      expect(
        await vault.priceAtLastFee()
      ).to.eq(
        getBigNumber(20).sub(underlyingWithdrawn).mul(getBigNumber(1)).div(getBigNumber(5).add(sharesForFees))
      )
    })

    it('Should remove adapters with weight 0 if full balance withdrawn', async () => {
      await vault.setAdaptersAndWeightsInternal(
        [adapter1.address, adapter2.address],
        [getBigNumber(5, 17), getBigNumber(5, 17)]
      )
      await vault.rebalance()
      await vault.setAdaptersAndWeightsInternal(
        [adapter1.address, adapter2.address],
        [0, getBigNumber(1)]
      )
      await expect(vault.withdraw(getBigNumber(55, 17)))
        .to.emit(underlying, 'Transfer')
        .withArgs(adapter1.address, vault.address, getBigNumber(45, 17))
      const { adapters, weights } = await vault.getAdaptersAndWeights()
      expect(adapters).to.deep.eq([adapter2.address])
      expect(weights).to.deep.eq([getBigNumber(1)])
      expect(await vault.balanceOf(wallet.address)).to.eq(getBigNumber(45, 17))
    })
  })

  describe('claimFees()', () => {
    beforeEach(() => reset(true))

    it('Should claim fees and update priceAtLastFee', async () => {
      await vault.setPerformanceFee(getBigNumber(1, 17))
      await underlying.mint(vault.address, getBigNumber(100))
      await expect(vault.claimFees())
        .to.emit(vault, 'Transfer')
        .withArgs(constants.AddressZero, feeRecipient.address, getBigNumber(1))
        .to.emit(vault, 'FeesClaimed')
        .withArgs(getBigNumber(10), getBigNumber(1))
      expect(await vault.priceAtLastFee()).to.eq(getBigNumber(10))
    })
  })

  describe('Liquidity delta queries', () => {
    describe('getCurrentLiquidityDeltas()', () => {
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
  })

  describe('Price queries', () => {
    describe('getPricePerFullShare()', () => {
      setupTests(true)
  
      it('Should return amount of underlying per share', async () => {
        expect(await vault.getPricePerFullShare()).to.eq(getBigNumber(1))
        await underlying.mint(vault.address, getBigNumber(10))
        expect(await vault.getPricePerFullShare()).to.eq(getBigNumber(2))
      })
    })
  
    describe('getPricePerFullShareWithFee()', () => {
      setupTests(true)
  
      it('Should return amount of underlying per share after fees', async () => {
        expect(await vault.getPricePerFullShareWithFee()).to.eq(getBigNumber(1))
        await underlying.mint(vault.address, getBigNumber(10))
        expect(await vault.getPricePerFullShareWithFee()).to.eq(getBigNumber(195, 16))
      })
  
      it('Should return amount of underlying per share if no fees owed', async () => {
        await vault.claimFees()
        expect(await vault.getPricePerFullShareWithFee()).to.eq(await vault.getPricePerFullShare())
      })
    })
  })

  describe('Balance queries', () => {
    describe('getBalances()', () => {
      setupTests(true)
  
      it('Should return balances per adapter', async () => {
        expect(await vault.getBalances()).to.deep.eq([ BigNumber.from(0) ]);
        await vault.rebalance()
        const wBalance = await wrapper1.balanceOf(vault.address)
        const balanceValue = await adapter1.toUnderlyingAmount(wBalance)
        expect(await vault.getBalances()).to.deep.eq([ balanceValue ])
      })
    })
  
    describe('balance()', () => {
      setupTests(true)
  
      it('Should return total value in underlying', async () => {
        expect(await vault.balance()).to.deep.eq(getBigNumber(10))
      })
    })
  })

  describe('APR queries', () => {
    describe('getAPR()', () => {
      setupTests(true)
  
      it('Should return APR accounting for current liquidity deltas and reserveRatio', async () => {
        let apr = await adapter1.getHypotheticalAPR(getBigNumber(9))
        apr = apr.sub(apr.mul(getBigNumber(1,17)).div(getBigNumber(1)))
        expect(await vault.getAPR()).to.eq(apr)
        await vault.rebalance()
        apr = await adapter1.getAPR()
        apr = apr.sub(apr.mul(getBigNumber(1,17)).div(getBigNumber(1)))
        expect(diff(await vault.getAPR(), apr)).to.be.lte(1)
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
        let apr1 = (await adapter1.getHypotheticalAPR(getBigNumber(45, 17))).div(2)
        let apr2 = (await adapter2.getHypotheticalAPR(getBigNumber(45, 17))).div(2)
        let apr = apr1.add(apr2)
        apr = apr.sub(apr.mul(1).div(10))
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
  })
})