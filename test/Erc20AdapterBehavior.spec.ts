import { expect } from 'chai'
import { BigNumber, constants, Contract, ContractTransaction } from 'ethers'
import { waffle } from 'hardhat'
import { getContract, sendTokenTo, getBigNumber, deployClone, parseTokenAmount, resetFork, sendTokenToFrom, getTokenSymbol, getTokenDecimals } from './shared'
import { ConvertHelper } from './shared/conversion'
import { IERC20, IErc20Adapter } from '../typechain'

export const setupAdapterContext = (
  getImplementation: () => Promise<IErc20Adapter>,
  initialize: (adapter: IErc20Adapter, underlying: IERC20, token: IERC20) => Promise<ContractTransaction>,
  converter: ConvertHelper,
  _underlying: string,
  _wrapper: string,
  transferAddressOverrides?: (adapter: IErc20Adapter, underlying: IERC20, token: IERC20) => Promise<{
    depositSenderWrapped?: string
    depositReceiverWrapped?: string
    depositReceiverUnderlying?: string
    withdrawalSenderUnderlying?: string
  }>
) => {
  before(async function () {
    [this.wallet, this.wallet1, this.wallet2] = waffle.provider.getWallets()
    this.underlying = await getContract(_underlying, 'IERC20')
    this.wrapper = await getContract(_wrapper, 'IERC20')
    this.decimals = await getTokenDecimals(this.underlying)
    this.converter = converter
    this.toUnderlying = (amount: BigNumber) => this.converter.toUnderlying(this.wrapper, amount)
    this.toWrapped = (amount: BigNumber, withdrawUnderlying?: boolean) => this.converter.toWrapped(this.wrapper, amount, withdrawUnderlying)
    this.getTokenAmount = (n) => getBigNumber(n, this.decimals)
    this.getTokens = async (n: number) => {
      const tokenAmount = await this.getTokenAmount(n)
      await sendTokenTo(_underlying, this.wallet.address, tokenAmount)
      return tokenAmount
    }
    this.resetTests = async (deposit?: boolean) => {
      this.initialize = initialize
      this.getImplementation = getImplementation
      await resetFork();
      this.adapter = await deployClone(await getImplementation())
      await initialize(this.adapter, this.underlying, this.wrapper)
      await this.underlying.approve(this.adapter.address, constants.MaxUint256)
      await this.wrapper.approve(this.adapter.address, constants.MaxUint256)
      const overrides = transferAddressOverrides ? await transferAddressOverrides(this.adapter, this.underlying, this.wrapper) : {};
      this.depositSenderWrapped = overrides.depositSenderWrapped || this.adapter.address
      this.depositReceiverWrapped = overrides.depositReceiverWrapped || this.wallet.address
      this.depositReceiverUnderlying = overrides.depositReceiverUnderlying || this.adapter.address
      this.withdrawalSenderUnderlying = overrides.withdrawalSenderUnderlying || this.adapter.address
      this.amountDeposited = await this.getTokens(10)
      if (deposit) await this.adapter.deposit(this.amountDeposited)
    }
  })
}

export function shouldBehaveLikeAdapterInitialize() {
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

export function shouldBehaveLikeAdapterDeposit() {
  beforeEach(function () {return this.resetTests();})

  it('Should revert if caller has insufficient balance', async function () {
    await expect(this.adapter.connect(this.wallet1).deposit(getBigNumber(1))).to.be.revertedWith('TH:STF')
  })

  it('Should mint wrapper and transfer to caller', async function () {
    const amountMinted = await this.toWrapped(this.amountDeposited)
    const tx = await this.adapter.deposit(this.amountDeposited)
    await expect(tx)
      .to.emit(this.underlying, 'Transfer')
      .withArgs(this.wallet.address, this.depositReceiverUnderlying, this.amountDeposited)
      .to.emit(this.wrapper, 'Transfer')
      .withArgs(this.depositSenderWrapped, this.depositReceiverWrapped, amountMinted)
    expect(await this.underlying.balanceOf(this.wallet.address)).to.eq(0)
    expect(await this.wrapper.balanceOf(this.depositReceiverWrapped)).to.eq(amountMinted)
  })
}

export function shouldBehaveLikeAdapterWithdraw() {
  beforeEach(function () {return this.resetTests(true);})

  it('Should revert if caller has insufficient balance', async function () {
    await expect(this.adapter.connect(this.wallet1).withdraw(getBigNumber(1))).to.be.revertedWith('TH:STF')
  })

  it('Should burn wrapper and redeem underlying', async function () {
    const balance = await this.wrapper.balanceOf(this.depositReceiverWrapped)
    this.amountDeposited = await this.toUnderlying(balance)
    await expect(this.adapter.withdraw(balance))
      .to.emit(this.underlying, 'Transfer')
      .withArgs(this.withdrawalSenderUnderlying, this.wallet.address, this.amountDeposited)
    expect(await this.underlying.balanceOf(this.wallet.address)).to.eq(this.amountDeposited)
  })
}

export function shouldBehaveLikeAdapterWithdrawAll() {
  beforeEach(function () {return this.resetTests(true);})

  it('Should burn all caller wrapper token and redeem underlying', async function () {
    const wBalance = await this.wrapper.balanceOf(this.depositReceiverWrapped, { blockTag: 'pending' })
    const balanceBefore = await this.underlying.balanceOf(this.wallet.address)
    this.amountDeposited = await this.toUnderlying(wBalance)
    await this.adapter.withdrawAll()
    const balanceAfter = await this.underlying.balanceOf(this.wallet.address)
    expect(balanceAfter.sub(balanceBefore)).to.eq(this.amountDeposited)
    expect(await this.wrapper.balanceOf(this.wallet.address)).to.eq(0)
  })
}

export function shouldBehaveLikeAdapterWithdrawUnderlying() {
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

export function shouldBehaveLikeAdapterWithdrawUnderlyingUpTo() {
  beforeEach(async function () {
    await this.resetTests()
    await sendTokenToFrom(this.underlying, await this.converter.liquidityHolder(this.wrapper), `0x${'ff'.repeat(20)}`, await this.adapter.availableLiquidity())
    await this.adapter.deposit(this.amountDeposited)
  })

  it('Should revert if caller has insufficient balance', async function () {
    await expect(this.adapter.connect(this.wallet1).withdrawUnderlyingUpTo(getBigNumber(1))).to.be.revertedWith('TH:STF')
  })

  it('Should withdraw min(amount, available)', async function () {
    const balanceUnderlying = await this.adapter.balanceUnderlying({ blockTag: 'pending' })
    const halfBalance = balanceUnderlying.div(2)
    await sendTokenToFrom(this.underlying, await this.converter.liquidityHolder(this.wrapper), `0x${'ff'.repeat(20)}`, halfBalance)
    const available = await this.adapter.availableLiquidity()
    await expect(this.adapter.withdrawUnderlyingUpTo(balanceUnderlying))
      .to.emit(this.underlying, 'Transfer')
      .withArgs(this.withdrawalSenderUnderlying, this.wallet.address, available)
    expect(await this.underlying.balanceOf(this.wallet.address)).to.eq(available)
    expect(await this.wrapper.balanceOf(this.adapter.address)).to.eq(0)
  })
}

export function shouldBehaveLikeAdapterQueries() {
  describe('settings', function () {
    before(function () {return this.resetTests();})
    it('name()', async function () {
      expect(await this.adapter.name()).to.eq(`${this.converter.protocolName} ${await getTokenSymbol(this.underlying)} Adapter`)
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
      expect(await this.adapter.availableLiquidity()).to.eq(liquidity.add(this.amountDeposited))
    })
  
    it('Decreases by amount withdrawn', async function () {
      const liquidity = await this.adapter.availableLiquidity()
      const balance = await this.adapter.balanceUnderlying({ blockTag: 'pending' })
      await this.adapter.withdrawAll()
      expect(await this.adapter.availableLiquidity()).to.eq(liquidity.sub(balance))
    })
  })

  describe('toWrappedAmount', function () {
    before(function() {return this.resetTests(true)})

    it('Returns amount of wrapper for underlying', async function () {
      expect(
        await this.adapter.toWrappedAmount(this.amountDeposited, { blockTag: 'pending' }
      )).to.eq(
        await this.toWrapped(this.amountDeposited)
      )
    })
  })

  describe('toUnderlyingAmount', () => {
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

  describe('getHypotheticalAPR()', () => {
    before(function() {return this.resetTests()})

    it('Positive delta should decrease APR', async function () {
      const apr = await this.adapter.getAPR()
      if (apr.gt(0)) {
        const delta = (await this.underlying.balanceOf(await this.converter.liquidityHolder(this.wrapper))).div(10)
        expect(await this.adapter.getHypotheticalAPR(delta)).to.be.lt(apr)
      }
    })

    it('Negative delta should increase APR', async function () {
      const apr = await this.adapter.getAPR()
      if (apr.gt(0)) {
        const delta = (await this.underlying.balanceOf(await this.converter.liquidityHolder(this.wrapper))).div(-10)
        expect(await this.adapter.getHypotheticalAPR(delta)).to.be.gt(apr)
      }
    })
  })
}

export function shouldBehaveLikeAdapter(
  getImplementation: () => Promise<IErc20Adapter>,
  initialize: (adapter: IErc20Adapter, underlying: IERC20, token: IERC20) => Promise<any>,
  converter: ConvertHelper,
  _underlying: string,
  _wrapper: string,
  transferAddressOverrides?: (adapter: IErc20Adapter, underlying: IERC20, token: IERC20) => Promise<{
    depositSenderWrapped?: string
    depositReceiverWrapped?: string
    depositReceiverUnderlying?: string
    withdrawalSenderUnderlying?: string
  }>
  // depositSenderWrappedOverride?: (adapter: IErc20Adapter, underlying: IERC20, token: IERC20) => string,
  // withdrawalSenderOverride?: (adapter: IErc20Adapter, underlying: IERC20, token: IERC20) => string
) {
  setupAdapterContext(
    getImplementation,
    initialize,
    converter,
    _underlying,
    _wrapper,
    transferAddressOverrides
  )

  shouldBehaveLikeAdapterInitialize()

  shouldBehaveLikeAdapterQueries()

  describe('deposit()', function () {
    shouldBehaveLikeAdapterDeposit()
  })

  describe('withdraw()', function () {
    shouldBehaveLikeAdapterWithdraw()
  })

  describe('withdrawAll()', function () {
    shouldBehaveLikeAdapterWithdrawAll()
  })

  describe('withdrawUnderlying()', function () {
    shouldBehaveLikeAdapterWithdrawUnderlying()
  })

  describe('withdrawUnderlyingUpTo()', function () {
    shouldBehaveLikeAdapterWithdrawUnderlyingUpTo()
  })

  // shouldBehaveLikeAdapterWithdraw()
}