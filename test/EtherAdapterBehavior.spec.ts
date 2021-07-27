import { expect } from "chai";
import { ConvertHelper } from "../@types/augmentations";
import { IERC20, IErc20Adapter, IEtherAdapter } from "../typechain";
import { shouldBehaveLikeErc20Adapter } from "./Erc20AdapterBehavior.spec";
import { createBalanceCheckpoint, getContract, getTransactionCost } from "./shared";

export function shouldBehaveLikeEtherAdapterDepositETH() {
  beforeEach(function () {return this.resetTests();})

  it('Should mint wrapper and transfer to caller', async function () {
    const getBalanceChange = await createBalanceCheckpoint(null, this.wallet.address)
    const amountMinted = await this.toWrapped(this.amountDeposited)
    const tx = (await getContract<IEtherAdapter>(this.adapter.address, 'IEtherAdapter')).depositETH({value: this.amountDeposited})
    await expect(tx)
      .to.emit(this.wrapper, 'Transfer')
      .withArgs(this.depositSenderWrapped, this.depositReceiverWrapped, amountMinted)
    const cost = await getTransactionCost(tx)
    expect((await getBalanceChange()).add(cost)).to.eq(this.amountDeposited.mul(-1))
    expect(await this.wrapper.balanceOf(this.depositReceiverWrapped)).to.eq(amountMinted)
  })
}

export function shouldBehaveLikeEtherAdapterWithdrawAsETH() {
  beforeEach(function () {return this.resetTests(true);})

  it('Should burn wrapper and redeem underlying', async function () {
    const balance = await this.wrapper.balanceOf(this.depositReceiverWrapped, { blockTag: 'pending' })
    const getBalanceChange = await createBalanceCheckpoint(null, this.wallet.address)
    const amountUnderlying = await this.toUnderlying(balance)
    const tx = (await getContract<IEtherAdapter>(this.adapter.address, 'IEtherAdapter')).withdrawAsETH(balance)
    const cost = await getTransactionCost(tx)
    expect((await getBalanceChange()).add(cost)).to.eq(amountUnderlying)
  })
}

export function shouldBehaveLikeEtherAdapterWithdrawAllAsEth() {
  beforeEach(function () {return this.resetTests(true);})

  it('Should burn all caller wrapper token and redeem ETH', async function () {
    const wBalance = await this.wrapper.balanceOf(this.depositReceiverWrapped, { blockTag: 'pending' })
    const getBalanceChange = await createBalanceCheckpoint(null, this.wallet.address)
    const expectedChange = await this.toUnderlying(wBalance)
    const tx = await (await getContract<IEtherAdapter>(this.adapter.address, 'IEtherAdapter')).withdrawAllAsETH()
    const balanceChange = await getBalanceChange()
    const cost = await getTransactionCost(tx)
    expect(balanceChange.add(cost)).to.eq(expectedChange)
    expect(await this.wrapper.balanceOf(this.wallet.address)).to.eq(0)
  })
}

export function shouldBehaveLikeEtherAdapterWithdrawUnderlyingAsETH() {
  beforeEach(function () {return this.resetTests(true);})

  it('Should burn wrapper and redeem ETH', async function () {
    const getBalanceChange = await createBalanceCheckpoint(null, this.wallet.address)
    const balanceUnderlying = await this.adapter.balanceUnderlying({ blockTag: 'pending' })
    const tx = await (await getContract<IEtherAdapter>(this.adapter.address, 'IEtherAdapter')).withdrawUnderlyingAsETH(balanceUnderlying)
    const cost = await getTransactionCost(tx)
    expect((await getBalanceChange()).add(cost)).to.eq(balanceUnderlying)
    expect(await this.wrapper.balanceOf(this.adapter.address)).to.eq(0)
  })
}

export function shouldBehaveLikeEtherAdapter(
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
  shouldBehaveLikeErc20Adapter(
    getImplementation,
    initialize,
    converter,
    _underlying,
    _wrapper,
    symbol,
    transferAddressOverrides
  )

  describe('depositETH()', function () {
    shouldBehaveLikeEtherAdapterDepositETH()
  })

  describe('withdrawAsETH()', function () {
    shouldBehaveLikeEtherAdapterWithdrawAsETH()
  })

  describe('withdrawAllAsEth()', function () {
    shouldBehaveLikeEtherAdapterWithdrawAllAsEth()
  })

  describe('withdrawUnderlyingAsETH()', function () {
    shouldBehaveLikeEtherAdapterWithdrawUnderlyingAsETH()
  })
}