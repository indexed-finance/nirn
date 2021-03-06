import { expect } from 'chai'
import { BigNumber, constants, Contract, ContractTransaction } from 'ethers'
import { ethers, waffle } from 'hardhat'
import {
  getContract,
  sendTokenTo,
  getBigNumber,
  deployClone,
  sendTokenToFrom,
  getTokenDecimals,
  createSnapshot,
  createBalanceCheckpoint,
  WETH,
  sendEtherToFrom,
  sendEtherTo,
} from './shared'
import { ConvertHelper } from '../@types/augmentations'
import { IERC20, IErc20Adapter, IWETH } from '../typechain'
import { formatEther } from '@ethersproject/units'
import { getAddress } from '@ethersproject/address'
import { Context } from 'mocha'

function relativeDiff(a: BigNumber, b: BigNumber) {
  return parseFloat(formatEther(a.sub(b).abs().mul(getBigNumber(1)).div(b)));
}

export const setupAdapterContext = (
  getImplementation: () => Promise<IErc20Adapter>,
  initialize: (adapter: IErc20Adapter, underlying: IERC20, token: IERC20) => Promise<ContractTransaction>,
  converter: ConvertHelper,
  _underlying: string,
  _wrapper: string,
  symbol: string,
  transferAddressOverrides?: (adapter: IErc20Adapter, underlying: IERC20, token: IERC20) => Promise<{
    depositSenderWrapped?: string
    depositReceiverWrapped?: string
    depositReceiverUnderlying?: string
    withdrawalSenderUnderlying?: string
  }>
) => {
  let restoreSnapshot: () => Promise<void>
  let completeReset: () => Promise<void>

  after(async function () {
    await completeReset()
  })

  before(async function () {
    [this.wallet, this.wallet1, this.wallet2] = waffle.provider.getWallets()
    completeReset = await createSnapshot()
    this.symbol = symbol
    this.initialize = initialize
    this.getImplementation = getImplementation
    this.underlying = await getContract(_underlying, 'IERC20')
    this.wrapper = await getContract(_wrapper, 'IERC20')
    this.decimals = await getTokenDecimals(this.underlying)
    this.converter = converter

    const isETH = (
      this.underlying.address === getAddress(WETH) &&
      !this.converter.useWrappedEther
    );

    this.toUnderlying = (amount: BigNumber) => this.converter.toUnderlying(this.wrapper, amount)
    this.toWrapped = (amount: BigNumber, withdrawUnderlying?: boolean) => this.converter.toWrapped(this.wrapper, amount, withdrawUnderlying)
    this.getTokenAmount = (n) => getBigNumber(n, this.decimals)
    this.getTokens = async (n: number) => {
      let tokenAmount = await this.getTokenAmount(n)
      const supply = await this.underlying.totalSupply();
      if (supply.lt(tokenAmount)) {
        tokenAmount = supply.div(100);
      }
      if (isETH) {
        await sendEtherTo(this.wallet.address, tokenAmount)
        await (await getContract<IWETH>(this.underlying.address, 'IWETH')).deposit({ value: tokenAmount })
      } else {
        await sendTokenTo(_underlying, this.wallet.address, tokenAmount)
      }
      return tokenAmount
    }
    this.getExpectedLiquidity = async () => {
      const liquidityHolder = await this.converter.liquidityHolder(this.wrapper)
      if (isETH) return ethers.provider.getBalance(liquidityHolder)
      return this.underlying.balanceOf(liquidityHolder)
    }

    this.adapter = await getImplementation()
    await initialize(this.adapter, this.underlying, this.wrapper)
    await this.underlying.approve(this.adapter.address, constants.MaxUint256)
    await this.wrapper.approve(this.adapter.address, constants.MaxUint256)

    const overrides = transferAddressOverrides ? await transferAddressOverrides(this.adapter, this.underlying, this.wrapper) : {};
    this.depositSenderWrapped = overrides.depositSenderWrapped || this.adapter.address
    this.depositReceiverWrapped = overrides.depositReceiverWrapped || this.wallet.address
    this.depositReceiverUnderlying = overrides.depositReceiverUnderlying || this.adapter.address
    this.withdrawalSenderUnderlying = overrides.withdrawalSenderUnderlying || this.adapter.address

    restoreSnapshot = await createSnapshot()
    this.resetTests = async (deposit?: boolean) => {
      await restoreSnapshot()
      this.amountDeposited = await this.getTokens(10)
      if (deposit) await this.adapter.deposit(this.amountDeposited)
    }
  })
}

export function shouldBehaveLikeErc20AdapterInitialize() {
  describe('initialize()', function () {
    before(function () {return this.resetTests()})

    it('Should revert if already initialized', async function () {
      await expect(
        this.initialize(this.adapter, this.underlying, this.wrapper)
      ).to.be.reverted;
    })

    it('Should revert if given null addresses', async function () {
      await expect(
        this.initialize(
          await deployClone(await this.getImplementation()),
          new Contract(constants.AddressZero, this.underlying.interface) as IERC20,
          new Contract(constants.AddressZero, this.underlying.interface) as IERC20
        )
      ).to.be.reverted;
    })
  })
}

export function shouldBehaveLikeErc20AdapterDeposit() {
  beforeEach(function () {return this.resetTests();})

  it('Should revert if caller has insufficient balance', async function () {
    await expect(this.adapter.connect(this.wallet1).deposit(getBigNumber(1))).to.be.revertedWith('TH:STF')
  })

  it('Should mint wrapper and transfer to caller', async function () {
    const amountMinted = await this.toWrapped(this.amountDeposited)
    await expect(this.adapter.deposit(this.amountDeposited))
      .to.emit(this.underlying, 'Transfer')
      .withArgs(this.wallet.address, this.depositReceiverUnderlying, this.amountDeposited)
      .to.emit(this.wrapper, 'Transfer')
      .withArgs(this.depositSenderWrapped, this.depositReceiverWrapped, amountMinted)
    expect(await this.underlying.balanceOf(this.wallet.address)).to.eq(0)
    expect(await this.wrapper.balanceOf(this.depositReceiverWrapped)).to.eq(amountMinted)
  })
}

export function shouldBehaveLikeErc20AdapterWithdraw() {
  beforeEach(function () {return this.resetTests(true);})

  it('Should revert if caller has insufficient balance', async function () {
    await expect(this.adapter.connect(this.wallet1).withdraw(getBigNumber(1))).to.be.revertedWith('TH:STF')
  })

  it('Should burn wrapper and redeem underlying', async function () {
    const balance = await this.wrapper.balanceOf(this.depositReceiverWrapped, { blockTag: 'pending' })
    this.amountDeposited = await this.toUnderlying(balance)
    await expect(this.adapter.withdraw(balance))
      .to.emit(this.underlying, 'Transfer')
      .withArgs(this.withdrawalSenderUnderlying, this.wallet.address, this.amountDeposited)
    expect(await this.underlying.balanceOf(this.wallet.address)).to.eq(this.amountDeposited)
  })
}

export function shouldBehaveLikeErc20AdapterWithdrawAll() {
  beforeEach(function () {return this.resetTests(true);})

  it('Should burn all caller wrapper token and redeem underlying', async function () {
    const wBalance = await this.wrapper.balanceOf(this.depositReceiverWrapped, { blockTag: 'pending' })
    const getBalanceChange = await createBalanceCheckpoint(this.underlying, this.wallet.address)
    const expectedChange = await this.toUnderlying(wBalance)
    await this.adapter.withdrawAll()
    const balanceChange = await getBalanceChange()
    expect(balanceChange).to.eq(expectedChange)
    expect(await this.wrapper.balanceOf(this.wallet.address)).to.eq(0)
  })
}

export function shouldBehaveLikeErc20AdapterWithdrawUnderlying() {
  beforeEach(function () {return this.resetTests(true);})

  it('Should revert if caller has insufficient balance', async function () {
    await expect(this.adapter.connect(this.wallet1).withdrawUnderlying(getBigNumber(1))).to.be.revertedWith('TH:STF')
  })

  it('Should burn wrapper and redeem underlying', async function () {
    const balanceUnderlying = await this.adapter.balanceUnderlying({ blockTag: 'pending' })
    await expect(this.adapter.withdrawUnderlying(balanceUnderlying))
      .to.emit(this.underlying, 'Transfer')
      .withArgs(this.withdrawalSenderUnderlying, this.wallet.address, balanceUnderlying)
    expect(await this.underlying.balanceOf(this.wallet.address)).to.eq(balanceUnderlying)
    expect(await this.wrapper.balanceOf(this.adapter.address)).to.eq(0)
  })
}

export function shouldBehaveLikeErc20AdapterWithdrawUnderlyingUpTo() {
  async function sendToken (this: Context, amount: BigNumber) {
    const liquidityHolder = await this.converter.liquidityHolder(this.wrapper)
    if (this.underlying.address === getAddress(WETH) && !this.converter.useWrappedEther) {
      await sendEtherToFrom(liquidityHolder, `0x${'ff'.repeat(20)}`, amount)
    } else {
      await sendTokenToFrom(this.underlying, liquidityHolder, `0x${'ff'.repeat(20)}`, amount)
    }
  }

  beforeEach(async function () {
    await this.resetTests()
    await sendToken.bind(this)(await this.adapter.availableLiquidity({ blockTag: 'pending' }))
    await this.adapter.deposit(this.amountDeposited)
  })

  it('Should revert if caller has insufficient balance', async function () {
    await expect(this.adapter.connect(this.wallet1).withdrawUnderlyingUpTo(getBigNumber(1))).to.be.revertedWith('TH:STF')
  })

  it('Should withdraw min(amount, available)', async function () {
    const balanceUnderlying = await this.adapter.balanceUnderlying({ blockTag: 'pending' })
    const halfBalance = balanceUnderlying.div(2)
    await sendToken.bind(this)(halfBalance)
    const available = await this.adapter.availableLiquidity({ blockTag: 'pending' })
    await expect(this.adapter.withdrawUnderlyingUpTo(balanceUnderlying))
      .to.emit(this.underlying, 'Transfer')
      .withArgs(this.withdrawalSenderUnderlying, this.wallet.address, available)
    expect(await this.underlying.balanceOf(this.wallet.address)).to.eq(available)
    expect(await this.wrapper.balanceOf(this.adapter.address)).to.eq(0)
  })
}

export function shouldBehaveLikeErc20AdapterQueries() {
  describe('settings', function () {
    before(function () {return this.resetTests();})

    it('name()', async function () {
      expect(await this.adapter.name()).to.eq(`${this.converter.protocolName} ${this.symbol} Adapter`)
    })
  
    it('token()', async function () {
      expect(await this.adapter.token()).to.eq(this.wrapper.address)
    })
  
    it('underlying()', async function () {
      expect(await this.adapter.underlying()).to.eq(this.underlying.address)
    })
  })

  describe('availableLiquidity()', function () {
    before(function () {return this.resetTests();})

    it('Increases by amount deposited', async function () {
      const liquidity = await this.adapter.availableLiquidity()
      await this.adapter.deposit(this.amountDeposited)
      const diff = relativeDiff(
        await this.adapter.availableLiquidity(),
        liquidity.add(this.amountDeposited)
      )
      expect(diff).to.be.lt(0.00000001)
    })
  
    it('Decreases by amount withdrawn', async function () {
      const liquidity = await this.adapter.availableLiquidity()
      const balance = await this.adapter.balanceUnderlying({ blockTag: 'pending' })
      await this.adapter.withdrawAll()
      const diff = relativeDiff(
        await this.adapter.availableLiquidity(),
        liquidity.sub(balance)
      )
      expect(diff).to.be.lt(0.00000001)
    })
  })

  describe('toWrappedAmount()', function () {
    before(function() {return this.resetTests(true)})

    it('Returns amount of wrapper for underlying', async function () {
      expect(
        await this.adapter.toWrappedAmount(this.amountDeposited, { blockTag: 'pending' }
      )).to.eq(
        await this.toWrapped(this.amountDeposited)
      )
    })
  })

  describe('toUnderlyingAmount()', () => {
    before(function() {return this.resetTests(true)})

    it('Returns amount of wrapper for underlying', async function () {
      const amountMinted = await this.wrapper.balanceOf(this.wallet.address)
      expect(
        await this.adapter.toUnderlyingAmount(amountMinted, { blockTag: 'pending' })
      ).to.eq(
        await this.toUnderlying(amountMinted)
      )
    })
  })

  describe('balanceWrapped()', () => {
    before(function() {return this.resetTests(true)})

    it('Should return caller balance in wrapper', async function () {
      expect(
        await this.adapter.balanceWrapped({ blockTag: 'pending' })
      ).to.eq(
        await this.wrapper.balanceOf(this.depositReceiverWrapped, { blockTag: 'pending' })
      )
      expect(await this.adapter.connect(this.wallet1).balanceWrapped()).to.eq(0)
    })
  })

  describe('balanceUnderlying()', () => {
    before(function() {return this.resetTests(true)})

    it('Should return caller balance in wrapper', async function () {
      const wBalance = await this.adapter.balanceWrapped({ blockTag: 'pending' })
      expect(await this.adapter.balanceUnderlying({ blockTag: 'pending' })).to.eq(await this.toUnderlying(wBalance))
      expect(await this.adapter.connect(this.wallet1).balanceUnderlying()).to.eq(0)
    })
  })

  describe('getRevenueBreakdown()', () => {
    before(function() {return this.resetTests()})

    it('Should return list of assets and relative interest rates', async function () {
      const breakdown = await this.adapter.getRevenueBreakdown()
      const expectedTokens = [this.underlying.address]
      const expectedAPRs: BigNumber[] = []
      if (this.converter.getRewardsTokenAndAPR) {
        const [rewardsToken, rewardsAPR] = await this.converter.getRewardsTokenAndAPR(this.adapter)
        const apr = await this.adapter.getAPR()
        if (rewardsToken === '') {
          expectedAPRs.push(apr)
        } else {
          expectedTokens.push(rewardsToken)
          const baseAPR = apr.sub(rewardsAPR)
          expectedAPRs.push(baseAPR, rewardsAPR)
        }
      } else {
        expectedAPRs.push(await this.adapter.getAPR()) 
      }
      expect(breakdown.assets).to.deep.eq(expectedTokens)
      expect(breakdown.aprs).to.deep.eq(expectedAPRs)
    })
  })

  describe('getHypotheticalAPR()', () => {
    before(function() {return this.resetTests()})

    it('Positive delta should decrease APR', async function () {
      const apr = await this.adapter.getAPR()
      if (apr.gt(0)) {
        const delta = (await this.adapter.availableLiquidity()).div(10)
        expect(await this.adapter.getHypotheticalAPR(delta)).to.be.lt(apr)
      }
    })

    it('Negative delta should increase APR', async function () {
      const apr = await this.adapter.getAPR()
      if (apr.gt(0)) {
        const delta = (await this.adapter.availableLiquidity()).div(-10)
        expect(await this.adapter.getHypotheticalAPR(delta)).to.be.gt(apr)
      }
    })
  })
}

export function shouldBehaveLikeErc20Adapter(
  getImplementation: () => Promise<IErc20Adapter>,
  initialize: (adapter: IErc20Adapter, underlying: IERC20, token: IERC20) => Promise<any>,
  converter: ConvertHelper,
  _underlying: string,
  _wrapper: string,
  symbol: string,
  transferAddressOverrides?: (adapter: IErc20Adapter, underlying: IERC20, token: IERC20) => Promise<{
    depositSenderWrapped?: string
    depositReceiverWrapped?: string
    depositReceiverUnderlying?: string
    withdrawalSenderUnderlying?: string
  }>
) {
  setupAdapterContext(
    getImplementation,
    initialize,
    converter,
    _underlying,
    _wrapper,
    symbol,
    transferAddressOverrides
  )

  shouldBehaveLikeErc20AdapterInitialize()

  shouldBehaveLikeErc20AdapterQueries()

  describe('deposit()', function () {
    shouldBehaveLikeErc20AdapterDeposit()
  })

  describe('withdraw()', function () {
    shouldBehaveLikeErc20AdapterWithdraw()
  })

  describe('withdrawAll()', function () {
    shouldBehaveLikeErc20AdapterWithdrawAll()
  })

  describe('withdrawUnderlying()', function () {
    shouldBehaveLikeErc20AdapterWithdrawUnderlying()
  })

  describe('withdrawUnderlyingUpTo()', function () {
    shouldBehaveLikeErc20AdapterWithdrawUnderlyingUpTo()
  })
}