import { expect } from 'chai'
import { BigNumber, constants } from 'ethers'
import { waffle } from 'hardhat'
import { getContract, sendTokenTo, getBigNumber, deployClone, parseTokenAmount } from './shared'
import { ConvertHelper } from './shared/conversion'
import { IERC20, IErc20Adapter } from '../typechain'

export const behavesLikeErc20Adapter = <IAdapter extends IErc20Adapter>(
  getImplementation: () => IAdapter,
  initialize: (adapter: IAdapter, underlying: IERC20, token: IERC20, ...args: any[]) => Promise<any>,
  protocolBalance: (adapter: IAdapter, underlying: IERC20, token: IERC20, ...args: any[]) => Promise<BigNumber>,
  converter: ConvertHelper,
  _underlying: string,
  _wrapper: string,
  protocolName: string,
  symbolPrefix: string,
  symbol: string,
  depositSenderOverride?: (adapter: IAdapter, underlying: IERC20, token: IERC20, ...args: any[]) => string,
  withdrawalSenderOverride?: (adapter: IAdapter, underlying: IERC20, token: IERC20, ...args: any[]) => string,
  ...rest: any[]
) =>
  describe(`${symbolPrefix}${symbol} Adapter Behaves Like Erc20Adapter`, () => {
    const [wallet, wallet1] = waffle.provider.getWallets()
    let adapter: IAdapter
    let underlying: IERC20
    let wrapper: IERC20
    let amountDeposited: BigNumber
    let amountMinted: BigNumber
    let depositSender: string;
    let withdrawalSender: string;

    const toUnderlying = (amount: BigNumber) => converter.toUnderlying(wrapper, amount)
    const toWrapped = (amount: BigNumber, withdrawUnderlying?: boolean) => converter.toWrapped(wrapper, amount, withdrawUnderlying)

    before(async () => {
      underlying = await getContract(_underlying, 'IERC20')
      wrapper = await getContract(_wrapper, 'IERC20')
      adapter = await deployClone(getImplementation(), 'CErc20Adapter')
      await initialize(adapter, underlying, wrapper, ...rest)
      await underlying.approve(adapter.address, constants.MaxUint256)
      await wrapper.approve(adapter.address, constants.MaxUint256)
      amountDeposited = await getTokens(10)
      depositSender = depositSenderOverride
        ? depositSenderOverride(adapter, underlying, wrapper, ...rest)
        : adapter.address;
      withdrawalSender = withdrawalSenderOverride
        ? withdrawalSenderOverride(adapter, underlying, wrapper, ...rest)
        : adapter.address;
    })

    async function getTokens(amount: number) {
      const tokenAmount = await parseTokenAmount(underlying, amount);
      await sendTokenTo(underlying.address, wallet.address, tokenAmount)
      return tokenAmount
    }

    describe('settings', () => {
      it('name()', async () => {
        expect(await adapter.name()).to.eq(`${protocolName} ${symbol} Adapter`)
      })

      it('token()', async () => {
        expect(await adapter.token()).to.eq(wrapper.address)
      })

      it('underlying()', async () => {
        expect(await adapter.underlying()).to.eq(underlying.address)
      })
    })

    describe('toWrappedAmount', () => {
      it('Returns amount of wrapper for underlying', async () => {
        expect(await adapter.toWrappedAmount(amountDeposited, { blockTag: 'pending' })).to.eq(
          await toWrapped(amountDeposited)
        )
      })
    })

    describe('toUnderlyingAmount', () => {
      it('Returns amount of wrapper for underlying', async () => {
        expect(await adapter.toUnderlyingAmount(amountDeposited, { blockTag: 'pending' })).to.eq(
          await toUnderlying(amountDeposited)
        )
      })
    })

    describe('deposit()', () => {
      it('Should revert if caller has insufficient balance', async () => {
        await expect(adapter.connect(wallet1).deposit(getBigNumber(1))).to.be.revertedWith('TH:STF')
      })

      it('Should mint wrapper and transfer to caller', async () => {
        amountMinted = await toWrapped(amountDeposited)
        const tx = await adapter.deposit(amountDeposited)
        await expect(tx)
          .to.emit(underlying, 'Transfer')
          .withArgs(wallet.address, adapter.address, amountDeposited)
          .to.emit(wrapper, 'Transfer')
          .withArgs(depositSender, wallet.address, amountMinted)
        expect(await underlying.balanceOf(wallet.address)).to.eq(0)
        expect(await wrapper.balanceOf(wallet.address)).to.eq(amountMinted)
      })
    })

    describe('balanceWrapped()', () => {
      it('Should return caller balance in cToken', async () => {
        expect(await adapter.balanceWrapped()).to.be.gte(amountMinted)
        expect(await adapter.connect(wallet1).balanceWrapped()).to.eq(0)
      })
    })

    describe('balanceUnderlying()', () => {
      it('Should return caller balance in wrapper', async () => {
        const wBalance = await adapter.balanceWrapped({ blockTag: 'pending' })
        expect(await adapter.balanceUnderlying({ blockTag: 'pending' })).to.eq(await toUnderlying(wBalance))
        expect(await adapter.connect(wallet1).balanceUnderlying()).to.eq(0)
      })
    })

    describe('getHypotheticalAPR()', () => {
      it('Positive delta should decrease APR', async () => {
        const apr = await adapter.getAPR()
        if (apr.gt(0)) {
          const delta = (await protocolBalance(adapter, underlying, wrapper, ...rest)).div(10);
          expect(await adapter.getHypotheticalAPR(delta)).to.be.lt(apr);
        }
      })

      it('Negative delta should increase APR', async () => {
        const apr = await adapter.getAPR()
        if (apr.gt(0)) {
          const delta = (await protocolBalance(adapter, underlying, wrapper, ...rest)).div(-10);
          expect(await adapter.getHypotheticalAPR(delta)).to.be.gt(apr);
        }
      })
    })

    describe('withdraw()', () => {
      it('Should revert if caller has insufficient balance', async () => {
        await expect(adapter.connect(wallet1).withdraw(getBigNumber(1))).to.be.revertedWith('TH:STF')
      })

      it('Should burn wrapper and redeem underlying', async () => {
        const balance = await wrapper.balanceOf(wallet.address)
        amountDeposited = await toUnderlying(balance)
        const tx = await adapter.withdraw(balance)
        await expect(tx)
          .to.emit(wrapper, 'Transfer')
          .withArgs(wallet.address, adapter.address, balance)
          .to.emit(underlying, 'Transfer')
          .withArgs(withdrawalSender, wallet.address, amountDeposited)
        expect(await underlying.balanceOf(wallet.address)).to.eq(amountDeposited)
      })
    })

    describe('withdrawAll()', () => {
      before(async () => {
        await adapter.deposit(amountDeposited)
      })

      it('Should burn all caller wrapper token and redeem underlying', async () => {
        const wBalance = await wrapper.balanceOf(wallet.address, { blockTag: 'pending' })
        const balanceBefore = await underlying.balanceOf(wallet.address)
        amountDeposited = await toUnderlying(wBalance)
        await adapter.withdrawAll()
        const balanceAfter = await underlying.balanceOf(wallet.address)
        expect(balanceAfter.sub(balanceBefore)).to.eq(amountDeposited)
        expect(await wrapper.balanceOf(wallet.address)).to.eq(0)
      })
    })

    async function clearBalance(_token: IERC20) {
      const balance = await _token.balanceOf(wallet.address);
      if (balance.gt(0)) await _token.transfer(`0x${'11'.repeat(20)}`, balance);
    }

    describe('withdrawUnderlying()', () => {
      before(async () => {
        await adapter.deposit(amountDeposited);
        await clearBalance(underlying);
      })

      it('Should revert if caller has insufficient balance', async () => {
        await expect(adapter.connect(wallet1).withdrawUnderlying(getBigNumber(1))).to.be.revertedWith('TH:STF')
      })

      it('Should burn wrapper and redeem underlying', async () => {
        const balanceUnderlying = await adapter.balanceUnderlying({ blockTag: 'pending' })
        const amount = await toWrapped(balanceUnderlying, true)
        const tx = await adapter.withdrawUnderlying(balanceUnderlying)
        await expect(tx)
          .to.emit(wrapper, 'Transfer')
          .withArgs(wallet.address, adapter.address, amount)
          .to.emit(underlying, 'Transfer')
          .withArgs(withdrawalSender, wallet.address, balanceUnderlying)
        expect(await underlying.balanceOf(wallet.address)).to.eq(balanceUnderlying)
        expect(await wrapper.balanceOf(adapter.address)).to.eq(0)
      })
    })
  })
