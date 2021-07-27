import { expect } from 'chai'
import { ethers } from 'hardhat'
import { getAddress } from "@ethersproject/address"
import { IComptroller, IERC20, IErc20Adapter, IEtherAdapter, TestComptrollerLens } from "../../../typechain"
import {
  setupAdapterContext,
  shouldBehaveLikeErc20AdapterDeposit,
  shouldBehaveLikeErc20AdapterInitialize,
  shouldBehaveLikeErc20AdapterQueries,
  shouldBehaveLikeErc20AdapterWithdraw,
  shouldBehaveLikeErc20AdapterWithdrawAll,
  shouldBehaveLikeErc20AdapterWithdrawUnderlying,
} from "../../Erc20AdapterBehavior.spec"
import {
  shouldBehaveLikeEtherAdapterDepositETH,
  shouldBehaveLikeEtherAdapterWithdrawAsETH,
} from "../../EtherAdapterBehavior.spec"
import { advanceBlock, deployContract, getIERC20, CompoundConverter, getBigNumber, createBalanceCheckpoint, sendEtherToFrom, getTransactionCost, getContract } from '../../shared'


describe('CEtherAdapter', () => {
  let comp: IERC20
  let lens: TestComptrollerLens;

  before(async () => {
    comp = await getIERC20('0xc00e94cb662c3520282e6f5717214004a7f26888')
    lens = await deployContract<TestComptrollerLens>('TestComptrollerLens')
  })

  const getPendingRewards = (cToken: string, account: string) => lens.callStatic.getPendingRewards(account, cToken, { blockTag: 'pending' })

  const testAdapter = (_underlying: string, _ctoken: string, symbol: string) => describe(`c${symbol}`, function () {
    setupAdapterContext(
      async () => (await deployContract('CEtherAdapter')) as IErc20Adapter,
      async (adapter, underlying, token) => adapter.initialize(underlying.address, token.address),
      CompoundConverter,
      _underlying,
      _ctoken,
      symbol,
    )

    shouldBehaveLikeErc20AdapterInitialize()

    shouldBehaveLikeErc20AdapterQueries()

    describe('deposit()', function () {
      shouldBehaveLikeErc20AdapterDeposit()
    })

    describe('depositETH()', function () {
      shouldBehaveLikeEtherAdapterDepositETH()
    })
  
    describe('withdraw()', () => {
      shouldBehaveLikeErc20AdapterWithdraw()

      it('Should revert if caller has insufficient balance', async function () {
        await expect(this.adapter.connect(this.wallet1).withdraw(getBigNumber(1))).to.be.revertedWith('TH:STF')
      })
    
      it('Should burn wrapper and redeem underlying', async function () {
        const balance = await this.wrapper.balanceOf(this.depositReceiverWrapped, { blockTag: 'pending' })
        const balanceValue = await this.toUnderlying(balance)
        let expectedOutput = balanceValue
        if (this.symbol === 'COMP') {
          expectedOutput = expectedOutput.add(await getPendingRewards(this.wrapper.address, this.wallet.address))
        }
        await expect(this.adapter.withdraw(balance))
          .to.emit(this.underlying, 'Transfer')
          .withArgs(this.withdrawalSenderUnderlying, this.wallet.address, balanceValue)
        expect(await this.underlying.balanceOf(this.wallet.address)).to.eq(expectedOutput)
      })

      it('Should claim COMP owed to caller if incentivized', async function () {
        await this.resetTests(true)
        const comptroller = (await ethers.getContractAt('IComptroller', '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B')) as IComptroller
        if ((await comptroller.compSpeeds(this.wrapper.address)).gt(0)) {
          await advanceBlock()
          const expectedRewards = await getPendingRewards(this.wrapper.address, this.wallet.address)
          expect(expectedRewards).to.be.gt(0)
          await expect(this.adapter.withdraw(await this.wrapper.balanceOf(this.wallet.address)))
            .to.emit(comp, 'Transfer')
            .withArgs(comptroller.address, this.wallet.address, expectedRewards)
        }
      })
    })

    describe('withdrawAsETH()', function () {
      shouldBehaveLikeEtherAdapterWithdrawAsETH()

      it('Should revert if caller has insufficient balance', async function () {
        await expect(this.adapter.connect(this.wallet1).withdrawAsETH(getBigNumber(1))).to.be.revertedWith('TH:STF')
      })
    
      it('Should burn wrapper and redeem ETH', async function () {
        const getBalanceChange = await createBalanceCheckpoint(null, this.wallet.address)
        const balance = await this.wrapper.balanceOf(this.depositReceiverWrapped, { blockTag: 'pending' })
        const balanceValue = await this.toUnderlying(balance)
        const tx = this.adapter.withdrawAsETH(balance)
        await expect(tx)
          .to.emit(this.wrapper, 'Transfer')
          .withArgs(this.wallet.address, this.adapter.address, balance)
        const cost = await getTransactionCost(tx)
        expect((await getBalanceChange()).add(cost)).to.eq(balanceValue)
      })

      it('Should claim COMP owed to caller if incentivized', async function () {
        await this.resetTests(true)
        const comptroller = (await ethers.getContractAt('IComptroller', '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B')) as IComptroller
        if ((await comptroller.compSpeeds(this.wrapper.address)).gt(0)) {
          await advanceBlock()
          const expectedRewards = await getPendingRewards(this.wrapper.address, this.wallet.address)
          expect(expectedRewards).to.be.gt(0)
          await expect(this.adapter.withdrawAsETH(await this.wrapper.balanceOf(this.wallet.address)))
            .to.emit(comp, 'Transfer')
            .withArgs(comptroller.address, this.wallet.address, expectedRewards)
        }
      })
    })
  
    describe('withdrawAll()', function () {
      shouldBehaveLikeErc20AdapterWithdrawAll()

      it('Should burn all caller wrapper token and redeem underlying', async function () {
        const wBalance = await this.wrapper.balanceOf(this.depositReceiverWrapped, { blockTag: 'pending' })
        const getBalanceChange = await createBalanceCheckpoint(this.underlying, this.wallet.address)
        let expectedOutput = await this.toUnderlying(wBalance)
        await this.adapter.withdrawAll()
        const balanceChange = await getBalanceChange()
        expect(balanceChange).to.eq(expectedOutput)
        expect(await this.wrapper.balanceOf(this.wallet.address)).to.eq(0)
      })

      it('Should claim COMP owed to caller if incentivized', async function () {
        await this.resetTests(true)
        const comptroller = (await ethers.getContractAt('IComptroller', '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B')) as IComptroller
        if ((await comptroller.compSpeeds(this.wrapper.address)).gt(0)) {
          await advanceBlock()
          const expectedRewards = await getPendingRewards(this.wrapper.address, this.wallet.address)
          expect(expectedRewards).to.be.gt(0)
          await expect(this.adapter.withdrawAll())
            .to.emit(comp, 'Transfer')
            .withArgs(comptroller.address, this.wallet.address, expectedRewards)
        }
      })
    })

    describe('withdrawAllAsETH()', function () {
      beforeEach(function () {return this.resetTests(true);})

      it('Should burn all caller wrapper token and redeem underlying', async function () {
        const wBalance = await this.wrapper.balanceOf(this.depositReceiverWrapped, { blockTag: 'pending' })
        const getBalanceChange = await createBalanceCheckpoint(null, this.wallet.address)
        let expectedOutput = await this.toUnderlying(wBalance)
        const tx = await (await getContract<IEtherAdapter>(this.adapter.address, 'IEtherAdapter')).withdrawAllAsETH()
        const cost = await getTransactionCost(tx)
        const balanceChange = await getBalanceChange()
        expect(balanceChange.add(cost)).to.eq(expectedOutput)
        expect(await this.wrapper.balanceOf(this.wallet.address)).to.eq(0)
      })

      it('Should claim COMP owed to caller if incentivized', async function () {
        await this.resetTests(true)
        const comptroller = (await ethers.getContractAt('IComptroller', '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B')) as IComptroller
        if ((await comptroller.compSpeeds(this.wrapper.address)).gt(0)) {
          await advanceBlock()
          const expectedRewards = await getPendingRewards(this.wrapper.address, this.wallet.address)
          expect(expectedRewards).to.be.gt(0)
          await expect(this.adapter.withdrawAll())
            .to.emit(comp, 'Transfer')
            .withArgs(comptroller.address, this.wallet.address, expectedRewards)
        }
      })
    })
  
    describe('withdrawUnderlying()', function () {
      shouldBehaveLikeErc20AdapterWithdrawUnderlying()

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

      it('Should claim COMP owed to caller if incentivized', async function () {
        await this.resetTests(true)
        const comptroller = (await ethers.getContractAt('IComptroller', '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B')) as IComptroller
        if ((await comptroller.compSpeeds(this.wrapper.address)).gt(0)) {
          await advanceBlock()
          const expectedRewards = await getPendingRewards(this.wrapper.address, this.wallet.address)
          expect(expectedRewards).to.be.gt(0)
          await expect(this.adapter.withdrawUnderlying(await this.adapter.balanceUnderlying()))
            .to.emit(comp, 'Transfer')
            .withArgs(comptroller.address, this.wallet.address, expectedRewards)
        }
      })
    })
  
    describe('withdrawUnderlyingAsEth()', function () {
      shouldBehaveLikeEtherAdapterWithdrawAsETH()

      it('Should revert if caller has insufficient balance', async function () {
        await expect(this.adapter.connect(this.wallet1).withdrawUnderlying(getBigNumber(1))).to.be.revertedWith('TH:STF')
      })
    
      it('Should burn wrapper and redeem underlying', async function () {
        const balanceUnderlying = await this.adapter.balanceUnderlying({ blockTag: 'pending' })
        const getBalanceChange = await createBalanceCheckpoint(null, this.wallet.address)
        const tx = await (
          await getContract<IEtherAdapter>(this.adapter.address, 'IEtherAdapter')
        ).withdrawUnderlyingAsETH(balanceUnderlying)
        const ethChange = (await getBalanceChange()).add(await getTransactionCost(tx))
        expect(ethChange).to.eq(balanceUnderlying)
        expect(await this.adapter.balanceWrapped()).to.be.lte(1)
        expect(await this.wrapper.balanceOf(this.adapter.address)).to.eq(0)
      })

      it('Should claim COMP owed to caller if incentivized', async function () {
        await this.resetTests(true)
        const comptroller = (await ethers.getContractAt('IComptroller', '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B')) as IComptroller
        if ((await comptroller.compSpeeds(this.wrapper.address)).gt(0)) {
          await advanceBlock()
          const expectedRewards = await getPendingRewards(this.wrapper.address, this.wallet.address)
          expect(expectedRewards).to.be.gt(0)
          const tx = (
            await getContract<IEtherAdapter>(this.adapter.address, 'IEtherAdapter')
          ).withdrawUnderlyingAsETH(await this.adapter.balanceUnderlying())
          await expect(tx)
            .to.emit(comp, 'Transfer')
            .withArgs(comptroller.address, this.wallet.address, expectedRewards)
        }
      })
    })
  
    describe('withdrawUnderlyingUpTo()', function () {
      beforeEach(async function () {
        await this.resetTests()
        await sendEtherToFrom(await this.converter.liquidityHolder(this.wrapper), `0x${'ff'.repeat(20)}`, await this.adapter.availableLiquidity({ blockTag: 'pending' }))
        await this.adapter.deposit(this.amountDeposited)
      })
    
      it('Should revert if caller has insufficient balance', async function () {
        await expect(this.adapter.connect(this.wallet1).withdrawUnderlyingUpTo(getBigNumber(1))).to.be.revertedWith('TH:STF')
      })
    
      it('Should withdraw min(amount, available)', async function () {
        const balanceUnderlying = await this.adapter.balanceUnderlying({ blockTag: 'pending' })
        const halfBalance = balanceUnderlying.div(2)
        await sendEtherToFrom(await this.converter.liquidityHolder(this.wrapper), `0x${'ff'.repeat(20)}`, halfBalance)
        const available = await this.adapter.availableLiquidity({ blockTag: 'pending' })
        let expectedOutput = available;
        if (this.symbol === 'COMP') {
          expectedOutput = expectedOutput.add(await getPendingRewards(this.wrapper.address, this.wallet.address))
        }
        await expect(this.adapter.withdrawUnderlyingUpTo(balanceUnderlying))
          .to.emit(this.underlying, 'Transfer')
          .withArgs(this.withdrawalSenderUnderlying, this.wallet.address, available)
        expect(await this.underlying.balanceOf(this.wallet.address)).to.eq(expectedOutput)
        expect(await this.wrapper.balanceOf(this.adapter.address)).to.eq(0)
      })

      it('Should claim COMP owed to caller if incentivized', async function () {
        await this.resetTests(true)
        const comptroller = (await ethers.getContractAt('IComptroller', '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B')) as IComptroller
        if ((await comptroller.compSpeeds(this.wrapper.address)).gt(0)) {
          await advanceBlock()
          const expectedRewards = await getPendingRewards(this.wrapper.address, this.wallet.address)
          expect(expectedRewards).to.be.gt(0)
          await expect(this.adapter.withdrawUnderlyingUpTo(await this.adapter.balanceUnderlying()))
            .to.emit(comp, 'Transfer')
            .withArgs(comptroller.address, this.wallet.address, expectedRewards)
        }
      })
    })
  })

  testAdapter(getAddress('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'), getAddress('0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5'), 'ETH');
});