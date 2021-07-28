import { expect } from "chai";
import { BigNumber, constants, ContractTransaction } from "ethers";
import { waffle } from "hardhat";
import { AdapterRegistry, TestAdapter, TestNirnVault, TestERC20, TestVault, CallForwarder, TestRewardsSeller } from "../typechain"
import { createBalanceCheckpoint, createSnapshot, deployContract, getBigNumber } from "./shared";
import { deployTestAdaptersAndRegistry, deployTestERC20, deployTestWrapperAndAdapter } from "./shared/fixtures";

const diff = (expected: BigNumber, actual: BigNumber) => expected.sub(actual).abs();
const ONE_E18 = getBigNumber(1)
const FIVE_E18 = getBigNumber(5)
const TEN_E18 = getBigNumber(10)
const toReserve = (n: BigNumber) => n.div(10)

describe('NirnVault', () => {
  const [wallet, wallet1, protocolAdapter, feeRecipient] = waffle.provider.getWallets()

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
    vault = await deployContract('TestNirnVault', registry.address, constants.AddressZero)
    await vault.initialize(underlying.address, constants.AddressZero, feeRecipient.address)
    await underlying.approve(vault.address, constants.MaxUint256)
    restoreSnapshot = await createSnapshot()
  })

  const reset = async (withDeposit = false, rebalance = false) => {
    await restoreSnapshot()
    if (withDeposit) {
      await deposit(TEN_E18)
      if (rebalance) await vault.rebalance()
    }
  }

  const setupTests = (withDeposit = false) => {
    before(() => reset(withDeposit))
  }

  describe('Constructor & Initializer', () => {
    setupTests()

    it('Should not allow second initialization', async () => {
      await expect(
        vault.initialize(underlying.address, constants.AddressZero, feeRecipient.address)
      ).to.be.revertedWith('already initialized')
    })

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
      expect(weights).to.deep.eq([ONE_E18])
    })

    it('Should set priceAtLastFee to 1', async () => {
      expect(await vault.priceAtLastFee()).to.eq(ONE_E18)
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
        tx = vault.setAdaptersAndWeightsInternal([adapter2.address], [ONE_E18])
        await expect(tx)
          .to.emit(underlying, 'Approval')
          .withArgs(vault.address, adapter2.address, constants.MaxUint256)
          .to.emit(wrapper2, 'Approval')
          .withArgs(vault.address, adapter2.address, constants.MaxUint256)
      })
  
      it('Should emit AllocationsUpdated', async () => {
        await expect(tx)
          .to.emit(vault, 'AllocationsUpdated')
          .withArgs([adapter2.address], [ONE_E18])
      })
  
      it('Should write packed adapters and weights', async () => {
        const { adapters, weights } = await vault.getAdaptersAndWeights()
        expect(adapters).to.deep.eq([adapter2.address])
        expect(weights).to.deep.eq([ONE_E18])
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

      it('Should return correct params before any deposits are made to adapters', async () => {
        const dist = await vault.currentDistributionInternal();
        expect(dist.totalProductiveBalance).to.eq(getBigNumber(9))
        expect(dist._reserveBalance).to.eq(TEN_E18)
        expect(dist.params.adapters).to.deep.eq([adapter1.address])
        expect(dist.params.weights).to.deep.eq([ONE_E18])
        expect(dist.params.liquidityDeltas).to.deep.eq([getBigNumber(9)])
        expect(dist.params.balances).to.deep.eq([BigNumber.from(0)])
        let apr = await adapter1.getHypotheticalAPR(getBigNumber(9))
        apr = apr.sub(apr.mul(getBigNumber(1,17)).div(ONE_E18))
        expect(dist.params.netAPR).to.eq(apr)
      })

      it('Should return correct params after deposits are made to adapters', async () => {
        await vault.rebalance()
        const dist = await vault.currentDistributionInternal();
        expect(dist.totalProductiveBalance).to.eq(getBigNumber(9))
        expect(dist._reserveBalance).to.eq(ONE_E18)
        expect(dist.params.adapters).to.deep.eq([adapter1.address])
        expect(dist.params.weights).to.deep.eq([ONE_E18])
        expect(dist.params.liquidityDeltas).to.deep.eq([BigNumber.from(0)])
        expect(dist.params.balances).to.deep.eq([getBigNumber(9)])
        let apr = await adapter1.getAPR()
        apr = apr.sub(apr.mul(getBigNumber(1,17)).div(ONE_E18))
        expect(dist.params.netAPR).to.eq(apr)
      })
    })

    describe('balanceSheetInternal()', () => {
      setupTests(true);

      it('Should return correct params before deposits are made to adapters', async () => {
        const sheet = await vault.balanceSheetInternal();
        expect(sheet.totalBalance).to.eq(TEN_E18)
        expect(sheet.totalProductiveBalance).to.eq(getBigNumber(9))
        expect(sheet.reserveBalance).to.eq(TEN_E18)
        expect(sheet.balances).to.deep.eq([BigNumber.from(0)])
      })

      it('Should return correct params after deposits are made to adapters', async () => {
        await vault.rebalance()
        const sheet = await vault.balanceSheetInternal();
        expect(sheet.totalBalance).to.eq(TEN_E18)
        expect(sheet.totalProductiveBalance).to.eq(getBigNumber(9))
        expect(sheet.reserveBalance).to.eq(ONE_E18)
        expect(sheet.balances).to.deep.eq([getBigNumber(9)])
      })
    })

    describe('processProposedDistributionInternal()', () => {
      beforeEach(() => reset(true))
      
      it('Should revert if new distribution does not improve APR', async () => {
        await vault.rebalance()
        const { params: currentParams, totalProductiveBalance } = await vault.currentDistributionInternal()
        await expect(
          vault.processProposedDistributionInternal(
            currentParams,
            totalProductiveBalance,
            [adapter2.address],
            [ONE_E18]
          )
        ).to.be.revertedWith('!increased')
      })

      it('Should revert if new distribution gives insufficient improvement', async () => {
        await vault.rebalance()
        await adapter2.setAnnualInterest((await adapter1.annualInterest()).mul(102).div(100))
        // Mint 1 token so APR calculation does not divide by zero
        await adapter2.mintTo(`0x${'ff'.repeat(20)}`, ONE_E18)
        const { params: currentParams, totalProductiveBalance } = await vault.currentDistributionInternal()
        await expect(
          vault.processProposedDistributionInternal(
            currentParams,
            totalProductiveBalance,
            [adapter2.address],
            [ONE_E18]
          )
        ).to.be.revertedWith('insufficient improvement')
      })

      it('Should include removed adapters in the end of the new params', async () => {
        await vault.rebalance()
        await adapter2.setAnnualInterest((await adapter1.annualInterest()).mul(106).div(100))
        const { params: currentParams, totalProductiveBalance } = await vault.currentDistributionInternal()
        const newParams = await vault.processProposedDistributionInternal(
          currentParams,
          totalProductiveBalance,
          [adapter2.address],
          [ONE_E18]
        )
        expect(newParams.adapters).to.deep.eq([adapter2.address, adapter1.address])
        expect(newParams.balances).to.deep.eq([getBigNumber(0), getBigNumber(9)])
        expect(newParams.liquidityDeltas).to.deep.eq([getBigNumber(9), getBigNumber(-9)])
        expect(newParams.weights).to.deep.eq([ONE_E18, BigNumber.from(0)])
      })
    })

    describe('withdrawToMatchAmount()', () => {
      beforeEach(() => reset(true))

      it('Should revert if not enough assets can be withdrawn', async () => {
        await vault.rebalance()
        await adapter1.setAvailableLiquidity(0)
        await expect(
          vault.withdrawToMatchAmountInternal(
            [adapter1.address],
            [ONE_E18],
            [getBigNumber(9)],
            ONE_E18,
            getBigNumber(2),
            0
          )
        ).to.be.revertedWith('insufficient available balance')
      })

      it('Should not revert if balance is insufficient to withdraw new reserves', async () => {
        await vault.rebalance()
        await expect(
          vault.withdrawToMatchAmountInternal(
            [adapter1.address],
            [ONE_E18],
            [getBigNumber(9)],
            ONE_E18,
            getBigNumber(2),
            getBigNumber(12),
          )
        ).to.not.be.reverted
      })

      it('Should skip adapters with 0 balance', async () => {
        await vault.rebalance()
        await expect(
          vault.withdrawToMatchAmountInternal(
            [adapter2.address, adapter1.address],
            [1, 1],
            [0, getBigNumber(9)],
            getBigNumber(1),
            getBigNumber(2),
            0
          )
        )
          .to.emit(underlying, 'Transfer')
          .withArgs(adapter1.address, vault.address, ONE_E18)
      })

      it('Should remove adapters with weight 0 and full balance withdrawn', async () => {
        await vault.rebalance()
        await adapter1.setAvailableLiquidity(constants.MaxUint256)
        await expect(
          vault.withdrawToMatchAmountInternal(
            [adapter1.address],
            [0],
            [getBigNumber(9)],
            getBigNumber(0),
            getBigNumber(9),
            0
          )
        )
          .to.emit(vault, 'AdapterRemoved')
          .withArgs(adapter1.address)
        const { adapters, weights } = await vault.getAdaptersAndWeights()
        expect(adapters).to.deep.eq([])
        expect(weights).to.deep.eq([])
      })

      it('Should stop once enough has been withdrawn', async () => {
        await vault.rebalance()
        await underlying.mint(wallet.address, TEN_E18)
        await adapter2.deposit(TEN_E18)
        await wrapper2.transfer(vault.address, await wrapper2.balanceOf(wallet.address))
        const getBalanceChange1 = await createBalanceCheckpoint(wrapper1, vault.address)
        const getBalanceChange2 = await createBalanceCheckpoint(wrapper2, vault.address)
        await vault.withdrawToMatchAmountInternal(
          [adapter1.address, adapter2.address],
          [1, 1],
          [getBigNumber(9), TEN_E18],
          ONE_E18,
          TEN_E18,
          0
        )
        expect(await getBalanceChange1()).to.eq(getBigNumber(-9))
        expect(await getBalanceChange2()).to.eq(0)
      })

      it('Should try to withdraw new reserves', async () => {
        await vault.rebalance()
        await underlying.mint(wallet.address, TEN_E18)
        await adapter2.deposit(TEN_E18)
        await wrapper2.transfer(vault.address, await wrapper2.balanceOf(wallet.address))
        const getBalanceChange1 = await createBalanceCheckpoint(wrapper1, vault.address)
        const getBalanceChange2 = await createBalanceCheckpoint(wrapper2, vault.address)
        await vault.withdrawToMatchAmountInternal(
          [adapter1.address, adapter2.address],
          [1, 1],
          [getBigNumber(9), TEN_E18],
          ONE_E18,
          getBigNumber(9),
          ONE_E18
        )
        expect(await getBalanceChange1()).to.eq(getBigNumber(-9))
        expect(await getBalanceChange2()).to.eq(0)
      })

      it('Should not go to additional adapters to withdraw new reserves if remainder has been met', async () => {
        await vault.rebalance()
        await underlying.mint(wallet.address, TEN_E18)
        await adapter2.deposit(TEN_E18)
        await wrapper2.transfer(vault.address, await wrapper2.balanceOf(wallet.address))
        const getBalanceChange1 = await createBalanceCheckpoint(wrapper1, vault.address)
        const getBalanceChange2 = await createBalanceCheckpoint(wrapper2, vault.address)
        await vault.withdrawToMatchAmountInternal(
          [adapter1.address, adapter2.address],
          [1, 1],
          [getBigNumber(9), TEN_E18],
          ONE_E18,
          getBigNumber(9),
          getBigNumber(2)
        )
        expect(await getBalanceChange1()).to.eq(getBigNumber(-9))
        expect(await getBalanceChange2()).to.eq(0)
      })
    })
  })

  describe('Configuration controls', () => {
    beforeEach(() => reset(true))

    describe('setMaximumUnderlying()', () => {
      it('Should revert if caller is not owner', async () => {
        await expect(
          vault.connect(wallet1).setMaximumUnderlying(0)
        ).to.be.revertedWith('Ownable: caller is not the owner')
      })

      it('Should let owner set maximum underlying', async () => {
        await vault.setMaximumUnderlying(ONE_E18)
        expect(await vault.maximumUnderlying()).to.eq(ONE_E18)
      })

      it('Should emit SetMaximumUnderlying', async () => {
        await expect(vault.setMaximumUnderlying(ONE_E18))
          .to.emit(vault, 'SetMaximumUnderlying')
          .withArgs(ONE_E18)
      })
    })

    describe('setPerformanceFee()', () => {
      it('Should revert if caller is not owner', async () => {
        await expect(
          vault.connect(wallet1).setPerformanceFee(0)
        ).to.be.revertedWith('Ownable: caller is not the owner')
      })

      it('Should revert if performance fee > 20%', async () => {
        await expect(
          vault.setPerformanceFee(getBigNumber(3, 17))
        ).to.be.revertedWith('fee > 20%')
      })

      it('Should let owner set performance fee', async () => {
        await vault.setPerformanceFee(getBigNumber(1, 17))
        expect(await vault.performanceFee()).to.eq(getBigNumber(1, 17))
      })

      it('Should claim current fees before changing performanceFee', async () => {
        await underlying.mint(vault.address, getBigNumber(10))
        const fees = getBigNumber(10).mul(getBigNumber(5, 16)).div(getBigNumber(1))
        const feeShares = fees.mul(TEN_E18).div(getBigNumber(20).sub(fees))
        await expect(
          vault.setPerformanceFee(getBigNumber(1, 17))
        )
          .to.emit(vault, 'Transfer')
          .withArgs(constants.AddressZero, feeRecipient.address, feeShares)
          .to.emit(vault, 'FeesClaimed')
          .withArgs(fees, feeShares)
      })

      it('Should emit SetPerformanceFee', async () => {
        await expect(vault.setPerformanceFee(getBigNumber(1, 17)))
          .to.emit(vault, 'SetPerformanceFee')
          .withArgs(getBigNumber(1, 17))
      })
    })

    describe('setReserveRatio()', () => {
      it('Should revert if caller is not owner', async () => {
        await expect(
          vault.connect(wallet1).setReserveRatio(0)
        ).to.be.revertedWith('Ownable: caller is not the owner')
      })

      it('Should revert if reserve ratio > 20%', async () => {
        await expect(
          vault.setReserveRatio(getBigNumber(3, 17))
        ).to.be.revertedWith('reserve > 20%')
      })

      it('Should let owner set reserve ratio', async () => {
        await vault.setReserveRatio(getBigNumber(2, 17))
        expect(await vault.reserveRatio()).to.eq(getBigNumber(2, 17))
      })

      it('Should emit SetReserveRatio', async () => {
        await expect(vault.setReserveRatio(getBigNumber(1, 17)))
          .to.emit(vault, 'SetReserveRatio')
          .withArgs(getBigNumber(1, 17))
      })
    })

    describe('setFeeRecipient()', () => {
      it('Should revert if caller is not owner', async () => {
        await expect(
          vault.connect(wallet1).setFeeRecipient(constants.AddressZero)
        ).to.be.revertedWith('Ownable: caller is not the owner')
      })

      it('Should let owner set fee recipient', async () => {
        await vault.setFeeRecipient(wallet.address)
        expect(await vault.feeRecipient()).to.eq(wallet.address)
      })

      it('Should emit SetFeeRecipient', async () => {
        await expect(vault.setFeeRecipient(wallet.address))
          .to.emit(vault, 'SetFeeRecipient')
          .withArgs(wallet.address)
      })
    })

    describe('setRewardsSeller()', () => {
      it('Should revert if caller is not owner', async () => {
        await expect(
          vault.connect(wallet1).setRewardsSeller(constants.AddressZero)
        ).to.be.revertedWith('Ownable: caller is not the owner')
      })

      it('Should let owner set rewards seller', async () => {
        await vault.setRewardsSeller(wallet.address)
        expect(await vault.rewardsSeller()).to.eq(wallet.address)
      })

      it('Should emit SetRewardsSeller', async () => {
        await expect(vault.setRewardsSeller(wallet.address))
          .to.emit(vault, 'SetRewardsSeller')
          .withArgs(wallet.address)
      })
    })
  })

  describe('sellRewards()', () => {
    let rewardsSeller: TestRewardsSeller
    let token: TestERC20

    before(async () => {
      await reset(true)
      rewardsSeller = await deployContract('TestRewardsSeller')
      token = await deployTestERC20()
    })

    it('Should revert if token is locked', async () => {
      await expect(vault.sellRewards(wrapper1.address, '0x00'))
        .to.be.revertedWith('token locked')
    })

    it('Should revert if token is underlying', async () => {
      await expect(vault.sellRewards(underlying.address, '0x00'))
        .to.be.revertedWith('token locked')
    })

    it('Should revert if rewards seller is not set', async () => {
      await expect(vault.sellRewards(token.address, '0x00'))
        .to.be.revertedWith('null seller')
    })

    it('Should transfer tokens to seller and invoke sellRewards', async () => {
      await token.mint(vault.address, getBigNumber(1))
      await vault.setRewardsSeller(rewardsSeller.address)
      await expect(vault.sellRewards(token.address, '0x00'))
        .to.emit(token, 'Transfer')
        .withArgs(vault.address, rewardsSeller.address, getBigNumber(1))
        .to.emit(rewardsSeller, 'RewardsSold')
        .withArgs(wallet.address, token.address, underlying.address, '0x00')
    })
  })

  describe('withdrawFromUnusedAdapter()', () => {
    beforeEach(() => reset(true))

    it('Should revert if adapter is not unused', async () => {
      await expect(vault.withdrawFromUnusedAdapter(adapter1.address))
        .to.be.revertedWith('!unused')
    })

    it('Should revert if adapter not registered', async () => {
      const {adapter: newAdapter} = await deployTestWrapperAndAdapter(underlying.address)
      await expect(vault.withdrawFromUnusedAdapter(newAdapter.address))
        .to.be.revertedWith('!approved')
    })

    it('Should withdraw from valid unused adapter', async () => {
      await adapter2.mintTo(vault.address, getBigNumber(1))
      await expect(vault.withdrawFromUnusedAdapter(adapter2.address))
        .to.emit(wrapper2, 'Approval')
        .withArgs(vault.address, adapter2.address, constants.MaxUint256)
        .to.emit(underlying, 'Transfer')
        .withArgs(adapter2.address, vault.address, getBigNumber(1))
        .to.emit(wrapper2, 'Approval')
        .withArgs(vault.address, adapter2.address, 0)
    })
  })

  describe('deposit()', () => {
    beforeEach(() => reset())

    it('Should revert if caller has insufficient balance/allowance', async () => {
      await expect(vault.deposit(ONE_E18)).to.be.revertedWith('TH:STF')
    })

    it('Should revert if new underlying amount exceeds maximum', async () => {
      await underlying.mint(wallet.address, ONE_E18)
      await vault.setMaximumUnderlying(getBigNumber(5, 17))
      await expect(vault.deposit(ONE_E18)).to.be.revertedWith('maximumUnderlying')
    })

    it('Should not revert if new underlying amount is less than maximum', async () => {
      await underlying.mint(wallet.address, ONE_E18)
      await vault.setMaximumUnderlying(TEN_E18)
      await expect(vault.deposit(ONE_E18)).to.not.be.reverted
    })

    it('Should mint 1 vault token per underlying on first deposit', async () => {
      await underlying.mint(wallet.address, TEN_E18)
      await underlying.approve(vault.address, constants.MaxUint256);
      await expect(vault.deposit(TEN_E18))
        .to.emit(underlying, 'Transfer')
        .withArgs(wallet.address, vault.address, TEN_E18)
        .to.emit(vault, 'Transfer')
        .withArgs(constants.AddressZero, wallet.address, TEN_E18)
    })

    it('Should claim fees before deposit', async () => {
      await deposit(TEN_E18)
      await underlying.mint(vault.address, TEN_E18)
      const fees = getBigNumber(5, 17)
      const feeShares = fees.mul(TEN_E18).div(getBigNumber(195, 17))
      const shares = TEN_E18
        .mul(TEN_E18.add(feeShares))
        .div(getBigNumber(20))
      await expect(await deposit(TEN_E18))
        .to.emit(underlying, 'Transfer')
        .withArgs(wallet.address, vault.address, TEN_E18)
        .to.emit(vault, 'FeesClaimed')
        .withArgs(fees, feeShares)
        .to.emit(vault, 'Transfer')
        .withArgs(constants.AddressZero, feeRecipient.address, feeShares)
        .to.emit(vault, 'Transfer')
        .withArgs(constants.AddressZero, wallet.address, shares)
    })
  })
  
  describe('withdraw()', () => {
    beforeEach(() => reset(true))

    it('Should send from vault if it has sufficient reserves', async () => {
      await expect(vault.withdraw(FIVE_E18))
        .to.emit(underlying, 'Transfer')
        .withArgs(vault.address, wallet.address, FIVE_E18)
      expect(await vault.balanceOf(wallet.address)).to.eq(FIVE_E18)
    })

    it('Should withdraw from adapters if vault has insufficient reserves, and should try to replenish new reserves', async () => {
      await vault.rebalance()
      const newReserves = toReserve(FIVE_E18)
      await expect(vault.withdraw(FIVE_E18))
        .to.emit(underlying, 'Transfer')
        .withArgs(adapter1.address, vault.address, getBigNumber(4).add(newReserves))
        .to.emit(underlying, 'Transfer')
        .withArgs(vault.address, wallet.address, FIVE_E18)
      expect(await vault.balanceOf(wallet.address)).to.eq(FIVE_E18)
    })

    it('Should withdraw from adapters until vault has sufficient balance', async () => {
      await vault.setAdaptersAndWeightsInternal(
        [adapter1.address, adapter2.address],
        [getBigNumber(5, 17), getBigNumber(5, 17)]
      )
      await vault.rebalance()
      const newReserves = toReserve(getBigNumber(4))
      await expect(vault.withdraw(getBigNumber(6)))
        .to.emit(underlying, 'Transfer')
        .withArgs(adapter1.address, vault.address, getBigNumber(45, 17))
        .to.emit(underlying, 'Transfer')
        .withArgs(adapter2.address, vault.address, getBigNumber(5, 17).add(newReserves))
        .to.emit(underlying, 'Transfer')
        .withArgs(vault.address, wallet.address, getBigNumber(6))
      expect(await vault.balanceOf(wallet.address)).to.eq(getBigNumber(4))
    })

    it('Should claim fees if any are owed', async () => {
      await underlying.mint(vault.address, TEN_E18)
      await vault.rebalance()
      const fees = getBigNumber(5, 17)
      const sharesForFees = fees.mul(TEN_E18).div(getBigNumber(195, 17))
      const underlyingWithdrawn = FIVE_E18.mul(getBigNumber(20)).div(TEN_E18.add(sharesForFees))
      const newReserves = toReserve(getBigNumber(20).sub(underlyingWithdrawn))
      await expect(vault.withdraw(FIVE_E18))
        .to.emit(underlying, 'Transfer')
        .withArgs(adapter1.address, vault.address, underlyingWithdrawn.add(newReserves).sub(getBigNumber(2)))
        .to.emit(vault, 'Transfer')
        .withArgs(constants.AddressZero, feeRecipient.address, sharesForFees)
        .to.emit(vault, 'FeesClaimed')
        .withArgs(fees, sharesForFees)
        .to.emit(underlying, 'Transfer')
        .withArgs(vault.address, wallet.address, underlyingWithdrawn)
      expect(
        await vault.priceAtLastFee()
      ).to.eq(
        getBigNumber(20).sub(underlyingWithdrawn).mul(ONE_E18).div(FIVE_E18.add(sharesForFees))
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
        [0, ONE_E18]
      )
      await expect(vault.withdraw(getBigNumber(55, 17)))
        .to.emit(underlying, 'Transfer')
        .withArgs(adapter1.address, vault.address, getBigNumber(45, 17))
      const { adapters, weights } = await vault.getAdaptersAndWeights()
      expect(adapters).to.deep.eq([adapter2.address])
      expect(weights).to.deep.eq([ONE_E18])
      expect(await vault.balanceOf(wallet.address)).to.eq(getBigNumber(45, 17))
    })
  })
  
  describe('withdrawUnderlying()', () => {
    beforeEach(() => reset(true))

    it('Should send from vault if it has sufficient reserves', async () => {
      await expect(vault.withdrawUnderlying(FIVE_E18))
        .to.emit(underlying, 'Transfer')
        .withArgs(vault.address, wallet.address, FIVE_E18)
      expect(await vault.balanceOf(wallet.address)).to.eq(FIVE_E18)
    })

    it('Should withdraw from adapters if vault has insufficient reserves, and should try to replenish new reserves', async () => {
      await vault.rebalance()
      const newReserves = toReserve(FIVE_E18)
      await expect(vault.withdrawUnderlying(FIVE_E18))
        .to.emit(underlying, 'Transfer')
        .withArgs(adapter1.address, vault.address, getBigNumber(4).add(newReserves))
        .to.emit(underlying, 'Transfer')
        .withArgs(vault.address, wallet.address, FIVE_E18)
      expect(await vault.balanceOf(wallet.address)).to.eq(FIVE_E18)
    })

    it('Should withdraw from adapters until vault has sufficient balance', async () => {
      await vault.setAdaptersAndWeightsInternal(
        [adapter1.address, adapter2.address],
        [getBigNumber(5, 17), getBigNumber(5, 17)]
      )
      await vault.rebalance()
      const newReserves = toReserve(getBigNumber(4))
      await expect(vault.withdrawUnderlying(getBigNumber(6)))
        .to.emit(underlying, 'Transfer')
        .withArgs(adapter1.address, vault.address, getBigNumber(45, 17))
        .to.emit(underlying, 'Transfer')
        .withArgs(adapter2.address, vault.address, getBigNumber(5, 17).add(newReserves))
        .to.emit(underlying, 'Transfer')
        .withArgs(vault.address, wallet.address, getBigNumber(6))
      expect(await vault.balanceOf(wallet.address)).to.eq(getBigNumber(4))
    })

    it('Should claim fees if any are owed', async () => {
      await underlying.mint(vault.address, TEN_E18)
      await vault.rebalance()
      const amount = FIVE_E18
      const fees = getBigNumber(5, 17)
      const sharesForFees = fees.mul(TEN_E18).div(getBigNumber(195, 17))
      const newReserves = toReserve(getBigNumber(15))
      const underlyingWithdrawn = amount.add(newReserves).sub(getBigNumber(2))
      const sharesBurned = amount.mul(TEN_E18.add(sharesForFees)).div(getBigNumber(20))
      await expect(vault.withdrawUnderlying(amount))
        .to.emit(underlying, 'Transfer')
        .withArgs(adapter1.address, vault.address, underlyingWithdrawn)
        .to.emit(vault, 'Transfer')
        .withArgs(constants.AddressZero, feeRecipient.address, sharesForFees)
        .to.emit(vault, 'Transfer')
        .withArgs(wallet.address, constants.AddressZero, sharesBurned)
        .to.emit(vault, 'FeesClaimed')
        .withArgs(fees, sharesForFees)
        .to.emit(underlying, 'Transfer')
        .withArgs(vault.address, wallet.address, amount)
      expect(
        await vault.priceAtLastFee()
      ).to.eq(
        getBigNumber(20).mul(ONE_E18).div(getBigNumber(10).add(sharesForFees))
      )
      expect(
        diff(
          await vault.getPricePerFullShare(),
          await vault.priceAtLastFee()
        )
      ).to.be.lte(1)
    })

    it('Should remove adapters with weight 0 if full balance withdrawn', async () => {
      await vault.setAdaptersAndWeightsInternal(
        [adapter1.address, adapter2.address],
        [getBigNumber(5, 17), getBigNumber(5, 17)]
      )
      await vault.rebalance()
      await vault.setAdaptersAndWeightsInternal(
        [adapter1.address, adapter2.address],
        [0, ONE_E18]
      )
      await expect(vault.withdrawUnderlying(getBigNumber(55, 17)))
        .to.emit(underlying, 'Transfer')
        .withArgs(adapter1.address, vault.address, getBigNumber(45, 17))
      const { adapters, weights } = await vault.getAdaptersAndWeights()
      expect(adapters).to.deep.eq([adapter2.address])
      expect(weights).to.deep.eq([ONE_E18])
      expect(await vault.balanceOf(wallet.address)).to.eq(getBigNumber(45, 17))
    })
  })

  describe('fees', () => {
    beforeEach(() => reset(true))

    describe('claimFees()', () => {
      it('Should claim fees and update priceAtLastFee', async () => {
        await vault.setPerformanceFee(getBigNumber(1, 17))
        await underlying.mint(vault.address, getBigNumber(100))
        await expect(vault.claimFees())
          .to.emit(vault, 'Transfer')
          .withArgs(constants.AddressZero, feeRecipient.address, ONE_E18)
          .to.emit(vault, 'FeesClaimed')
          .withArgs(TEN_E18, ONE_E18)
        expect(await vault.priceAtLastFee()).to.eq(TEN_E18)
      })
    })

    describe('getPendingFees', () => {
      it('Should return 0 when no fees owed', async () => {
        expect(await vault.getPendingFees()).to.eq(0)
      })

      it('Should return performance fee times profit since last claim', async () => {
        await underlying.mint(vault.address, getBigNumber(10))
        expect(await vault.getPendingFees()).to.eq(getBigNumber(5, 17))
      })
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
          vault["getHypotheticalLiquidityDeltas(uint256[])"]([getBigNumber(5, 17), ONE_E18])
        ).to.be.revertedWith('bad lengths')
      })
  
      it('Should return weighted amounts that should be deposited per adapter', async () => {
        expect(await vault["getHypotheticalLiquidityDeltas(uint256[])"]([getBigNumber(5, 17)])).to.deep.eq([ getBigNumber(45, 17) ])
      })
  
      it('Should return current deltas if given current weights', async () => {
        expect(await vault["getHypotheticalLiquidityDeltas(uint256[])"]([ONE_E18])).to.deep.eq(await vault.getCurrentLiquidityDeltas())
      })
  
      it('Accounts for existing deposits', async () => {
        await vault.rebalance()
        const wBalance = await wrapper1.balanceOf(vault.address)
        const balanceValue = await adapter1.toUnderlyingAmount(wBalance)
        const totalUnderlying = balanceValue.add(ONE_E18)
        const available = totalUnderlying.sub(totalUnderlying.mul(1).div(10))
        const expectedDelta = available.mul(getBigNumber(5, 17)).div(ONE_E18).sub(balanceValue)
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
        const totalUnderlying = balanceValue.add(ONE_E18)
        const available = totalUnderlying.sub(totalUnderlying.mul(1).div(10))
        const expectedDelta1 = available.mul(getBigNumber(5, 17)).div(ONE_E18).sub(balanceValue)
        const expectedDelta2 = available.mul(getBigNumber(5, 17)).div(ONE_E18)
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
        expect(await vault.getPricePerFullShare()).to.eq(ONE_E18)
        await underlying.mint(vault.address, TEN_E18)
        expect(await vault.getPricePerFullShare()).to.eq(getBigNumber(2))
      })
    })
  
    describe('getPricePerFullShareWithFee()', () => {
      setupTests(true)
  
      it('Should return amount of underlying per share after fees', async () => {
        expect(await vault.getPricePerFullShareWithFee()).to.eq(ONE_E18)
        await underlying.mint(vault.address, TEN_E18)
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
        expect(await vault.balance()).to.deep.eq(TEN_E18)
      })
    })
  })

  describe('APR queries', () => {
    describe('getAPR()', () => {
      setupTests(true)
  
      it('Should return APR accounting for current liquidity deltas and reserveRatio', async () => {
        let apr = await adapter1.getHypotheticalAPR(getBigNumber(9))
        apr = apr.sub(apr.mul(getBigNumber(1,17)).div(ONE_E18))
        expect(await vault.getAPR()).to.eq(apr)
        await vault.rebalance()
        apr = await adapter1.getAPR()
        apr = apr.sub(apr.mul(getBigNumber(1,17)).div(ONE_E18))
        expect(diff(await vault.getAPR(), apr)).to.be.lte(1)
      })
    })

    describe('getAPRs()', () => {
      setupTests(true)

      it('Should return APRs of adapters accounting for liquidity deltas', async () => {
        await vault.setAdaptersAndWeightsInternal(
          [adapter1.address, adapter2.address],
          [getBigNumber(5, 17), getBigNumber(5, 17)]
        )
        let apr1 = await adapter1.getHypotheticalAPR(getBigNumber(45, 17))
        let apr2 = await adapter2.getHypotheticalAPR(getBigNumber(45, 17))
        expect(await vault.getAPRs()).to.deep.eq([apr1, apr2])
      })
    })
  
    describe('getHypotheticalAPR(uint256[])', () => {
      setupTests(true)
  
      it('Should revert if weights.length != adapters.length', async () => {
        await expect(vault["getHypotheticalAPR(uint256[])"]([ONE_E18, ONE_E18])).to.be.revertedWith('bad lengths')
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
        const totalUnderlying = balanceValue.add(ONE_E18)
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
          [ONE_E18, ONE_E18]
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
        const totalUnderlying = balanceValue.add(ONE_E18)
        const available = totalUnderlying.sub(totalUnderlying.mul(1).div(10))
        const target = available.mul(getBigNumber(5, 17)).div(ONE_E18)
        const delta1 = target.sub(balanceValue)
        const delta2 = target
        let apr1 = (await adapter1.getHypotheticalAPR(delta1)).mul(getBigNumber(5, 17)).div(ONE_E18)
        let apr2 = (await adapter2.getHypotheticalAPR(delta2)).mul(getBigNumber(5, 17)).div(ONE_E18)
        let apr = apr1.add(apr2)
        apr = apr.sub(apr.div(10))
        expect(await vault["getHypotheticalAPR(address[],uint256[])"](
          [adapter1.address, adapter2.address],
          [getBigNumber(5, 17), getBigNumber(5, 17)]
        )).to.eq(apr)
      })
    })
  })

  describe('rebalance()', () => {
    beforeEach(() => reset(true))

    it('Should revert if called by contract other than eoaSafeCaller', async () => {
      const callForwarder = await deployContract<CallForwarder>('CallForwarder')
      await expect(
        callForwarder.execute(
          vault.address,
          vault.interface.getSighash('rebalance')
        )
      ).to.be.revertedWith('!EOA')
    })

    it('Should remove adapters with weight 0 and full balance withdrawn', async () => {
      await vault.rebalance()
      await vault.setAdaptersAndWeightsInternal(
        [adapter2.address, adapter1.address],
        [0, getBigNumber(1)]
      )
      await adapter2.mintTo(vault.address, getBigNumber(1))
      await expect(vault.rebalance())
        .to.emit(underlying, 'Transfer')
        .withArgs(adapter2.address, vault.address, getBigNumber(1))
        .to.emit(underlying, 'Transfer')
        .withArgs(vault.address, adapter1.address, getBigNumber(9, 17))
        .to.emit(vault, 'AdapterRemoved')
        .withArgs(adapter2.address)
    })

    it('Should execute withdrawals before deposits', async () => {
      await vault.rebalance()
      await vault.setAdaptersAndWeightsInternal(
        [adapter1.address, adapter2.address],
        [getBigNumber(5, 17), getBigNumber(5, 17)],
      )
      await expect(vault.rebalance())
        .to.emit(underlying, 'Transfer')
        .withArgs(adapter1.address, vault.address, getBigNumber(45, 17))
        .to.emit(underlying, 'Transfer')
        .withArgs(vault.address, adapter2.address, getBigNumber(45, 17))
    })

    describe('Should only deposit up to the total amount withdrawn + reserves', () => {
      it('With reserves = 0', async () => {
        await vault.rebalance()
        await vault.setAdaptersAndWeightsInternal(
          [adapter1.address, adapter2.address],
          [getBigNumber(5, 17), getBigNumber(5, 17)],
        )
        await vault.withdraw(getBigNumber(1))
        await adapter1.setAvailableLiquidity(getBigNumber(5, 17))
        await expect(vault.rebalance())
          .to.emit(underlying, 'Transfer')
          .withArgs(adapter1.address, vault.address, getBigNumber(5, 17))
          .to.emit(underlying, 'Transfer')
          .withArgs(vault.address, adapter2.address, getBigNumber(5, 17))
      })

      it('With withdrawals = 0', async () => {
        await vault.rebalance()
        await vault.setAdaptersAndWeightsInternal(
          [adapter1.address, adapter2.address],
          [getBigNumber(5, 17), getBigNumber(5, 17)],
        )
        await adapter1.setAvailableLiquidity(0)
        await expect(vault.rebalance())
          .to.emit(underlying, 'Transfer')
          .withArgs(vault.address, adapter2.address, getBigNumber(1))
      })
    })

    it('Should emit Rebalanced', async () => {
      await expect(vault.rebalance()).to.emit(vault, 'Rebalanced')
    })
  })

  describe('rebalanceWithNewWeights()', () => {
    beforeEach(async () => {
      await reset(true)
      await vault.setAdaptersAndWeightsInternal(
        [adapter1.address, adapter2.address],
        [getBigNumber(5, 17), getBigNumber(5, 17)]
      )
    })

    describe('Improvement validation', async () => {
      it('Should revert if new distribution does not improve APR', async () => {
        expect(
          vault.rebalanceWithNewWeights(
            [getBigNumber(4, 17), getBigNumber(6, 17)]
          )
        ).to.be.revertedWith('!increased')
      })
  
      it('Should revert if new distribution gives insufficient improvement', async () => {
        await adapter2.setAnnualInterest((await adapter1.annualInterest()).mul(102).div(100))
        await expect(
          vault.rebalanceWithNewWeights(
            [getBigNumber(49, 16), getBigNumber(51, 16)]
          )
        ).to.be.revertedWith('insufficient improvement')
      })
    })

    describe('Weight validation', () => {
      it('Should revert if wrong # of weights is given', async () => {
        await expect(
          vault.rebalanceWithNewWeights(
            [getBigNumber(1)]
          )
        ).to.be.revertedWith('bad lengths')
      })

      it('Should revert if weight is zero for adapter with >0 weight currently', async () => {
        await expect(
          vault.rebalanceWithNewWeights(
            [getBigNumber(1), 0]
          )
        ).to.be.revertedWith('can not set null weight')
      })

      it('Should not revert if weight is zero for adapter with 0 weight currently', async () => {
        await vault.setAdaptersAndWeightsInternal(
          [adapter1.address, adapter2.address, adapter3.address],
          [getBigNumber(5, 17), getBigNumber(5, 17), 0]
        )
        await expect(
          vault.rebalanceWithNewWeights(
            [getBigNumber(6, 17), getBigNumber(4, 17), 0]
          )
        ).to.not.be.reverted
      })

      it('Should revert if any weight is less than 5%', async () => {
        await expect(
          vault.rebalanceWithNewWeights(
            [getBigNumber(4, 16), getBigNumber(4, 17)]
          )
        ).to.be.revertedWith('weight < 5%')
      })

      it('Should revert if weights do not equal 1', async () => {
        await expect(
          vault.rebalanceWithNewWeights(
            [getBigNumber(4, 17), getBigNumber(4, 17)]
          )
        ).to.be.revertedWith('weights != 100%')
      })
    })

    it('Should remove adapters with weight 0 which can be withdrawn', async () => {
      await vault.setAdaptersAndWeightsInternal(
        [adapter1.address, adapter2.address, adapter3.address],
        [getBigNumber(5, 17), getBigNumber(5, 17), 0]
      )
      await adapter3.mintTo(vault.address, getBigNumber(10))
      await expect(
        vault.rebalanceWithNewWeights([getBigNumber(6, 17), getBigNumber(4, 17), 0])
      )
        .to.emit(underlying, 'Transfer')
        .withArgs(adapter3.address, vault.address, getBigNumber(10))
        .to.emit(underlying, 'Transfer')
        .withArgs(vault.address, adapter1.address, getBigNumber(108, 17))
        .to.emit(underlying, 'Transfer')
        .withArgs(vault.address, adapter2.address, getBigNumber(72, 17))
        .to.emit(vault, 'AdapterRemoved')
        .withArgs(adapter3.address)
      const {adapters, weights} = await vault.getAdaptersAndWeights()
      expect(adapters).to.deep.eq([adapter1.address, adapter2.address])
      expect(weights).to.deep.eq([getBigNumber(6, 17), getBigNumber(4, 17)])
    })
  })

  describe('rebalanceWithNewAdapters()', () => {
    beforeEach(async () => {
      await reset(true)
    })

    describe('Improvement validation', async () => {
      it('Should revert if new distribution does not improve APR', async () => {
        expect(
          vault.rebalanceWithNewAdapters(
            [adapter1.address, adapter2.address],
            [getBigNumber(4, 17), getBigNumber(6, 17)]
          )
        ).to.be.revertedWith('!increased')
      })
  
      it('Should revert if new distribution gives insufficient improvement', async () => {
        await vault.setAdaptersAndWeightsInternal(
          [adapter1.address, adapter2.address],
          [getBigNumber(5, 17), getBigNumber(5, 17)]
        )
        await adapter2.setAnnualInterest((await adapter1.annualInterest()).mul(102).div(100))
        await expect(
          vault.rebalanceWithNewAdapters(
            [adapter1.address, adapter2.address],
            [getBigNumber(5, 17), getBigNumber(5, 17)]
          )
        ).to.be.revertedWith('insufficient improvement')
      })
    })

    describe('Adapter and weight validation', () => {
      it('Should revert if any adapter is not registered', async () => {
        const newAdapter = await deployContract('TestAdapter', underlying.address, wrapper1.address, getBigNumber(1))
        await expect(
          vault.rebalanceWithNewAdapters(
            [adapter1.address, newAdapter.address],
            [getBigNumber(4, 17), getBigNumber(4, 17)]
          )
        ).to.be.revertedWith('!approved')
      })

      it('Should revert if adapter has wrong underlying token', async () => {
        const {adapter: newAdapter} = await deployTestWrapperAndAdapter((await deployTestERC20()).address)
        await registry.connect(protocolAdapter).addTokenAdapter(newAdapter.address)
        await expect(
          vault.rebalanceWithNewAdapters(
            [adapter1.address, newAdapter.address],
            [getBigNumber(4, 17), getBigNumber(4, 17)]
          )
        ).to.be.revertedWith('bad adapter')
      })

      it('Should revert if duplicate adapters given', async () => {
        await expect(
          vault.rebalanceWithNewAdapters(
            [adapter1.address, adapter1.address],
            [getBigNumber(5, 17), getBigNumber(5, 17)]
          )
        ).to.be.revertedWith('duplicate adapter')
      })

      it('Should revert if lengths do not match', async () => {
        await expect(
          vault.rebalanceWithNewAdapters(
            [adapter1.address, adapter2.address],
            [getBigNumber(1)]
          )
        ).to.be.revertedWith('bad lengths')
      })

      it('Should revert if any weight is less than 5%', async () => {
        await expect(
          vault.rebalanceWithNewAdapters(
            [adapter1.address, adapter2.address],
            [getBigNumber(4, 16), getBigNumber(4, 17)]
          )
        ).to.be.revertedWith('weight < 5%')
      })

      it('Should revert if weights do not equal 1', async () => {
        await expect(
          vault.rebalanceWithNewAdapters(
            [adapter1.address, adapter2.address],
            [getBigNumber(4, 17), getBigNumber(4, 17)]
          )
        ).to.be.revertedWith('weights != 100%')
      })
    })

    it('Should accept new distribution which results in acceptable improvement', async () => {
      await adapter2.setAnnualInterest(await adapter1.annualInterest())
      await vault.rebalanceWithNewAdapters(
        [adapter1.address, adapter2.address],
        [getBigNumber(5, 17), getBigNumber(5, 17)]
      )
      const { adapters, weights } = await vault.getAdaptersAndWeights()
      expect(adapters).to.deep.eq([adapter1.address, adapter2.address])
      expect(weights).to.deep.eq([getBigNumber(5, 17), getBigNumber(5, 17)])
    })

    it('Should remove un-included adapters if balance can be fully withdrawn', async () => {
      await vault.rebalance()
      await adapter2.setAnnualInterest(getBigNumber(1))
      await expect(
        vault.rebalanceWithNewAdapters([adapter2.address], [getBigNumber(1)])
      )
        .to.emit(vault, 'AdapterRemoved')
        .withArgs(adapter1.address)

      const { adapters, weights } = await vault.getAdaptersAndWeights()
      expect(adapters).to.deep.eq([adapter2.address])
      expect(weights).to.deep.eq([getBigNumber(1)])
    })

    it('Should keep un-included adapters with weight 0 if balance can not be fully withdrawn', async () => {
      await vault.rebalance()
      await adapter1.setAvailableLiquidity(getBigNumber(8))
      await adapter2.setAnnualInterest(getBigNumber(1))
      await expect(
        vault.rebalanceWithNewAdapters([adapter2.address], [getBigNumber(1)])
      )
        .to.emit(underlying, 'Transfer')
        .withArgs(adapter1.address, vault.address, getBigNumber(8))
        .to.emit(underlying, 'Transfer')
        .withArgs(vault.address, adapter2.address, getBigNumber(9))

      const { adapters, weights } = await vault.getAdaptersAndWeights()
      expect(adapters).to.deep.eq([adapter2.address, adapter1.address])
      expect(weights).to.deep.eq([getBigNumber(1), BigNumber.from(0)])
    })
  })
})