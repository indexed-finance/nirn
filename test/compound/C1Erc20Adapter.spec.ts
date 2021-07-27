import { expect } from 'chai'
import { ethers } from 'hardhat'
import { getAddress } from "@ethersproject/address"
import { IComptroller, IERC20, IErc20Adapter, TestComptrollerLens } from "../../typechain"
import {
  setupAdapterContext,
  shouldBehaveLikeErc20AdapterDeposit,
  shouldBehaveLikeErc20AdapterInitialize,
  shouldBehaveLikeErc20AdapterQueries,
} from "../Erc20AdapterBehavior.spec"
import { advanceBlock, deployContract, getIERC20, CompoundConverter, sendTokenToFrom, getBigNumber, createBalanceCheckpoint } from '../shared'


describe('C1Erc20Adapter', () => {
  let comp: IERC20
  let lens: TestComptrollerLens;

  before(async () => {
    comp = await getIERC20('0xc00e94cb662c3520282e6f5717214004a7f26888')
    lens = await deployContract<TestComptrollerLens>('TestComptrollerLens')
  })

  const getPendingRewards = (cToken: string, account: string) => lens.callStatic.getPendingRewards(account, cToken, { blockTag: 'pending' })

  const testAdapter = (_underlying: string, _ctoken: string, symbol: string) => describe(`c${symbol}`, function () {
    setupAdapterContext(
      async () => (await deployContract('C1Erc20Adapter')) as IErc20Adapter,
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
  
    describe('withdrawUnderlying()', function () {
      beforeEach(function () {return this.resetTests(true);})

      it('Should revert if caller has insufficient balance', async function () {
        await expect(this.adapter.connect(this.wallet1).withdrawUnderlying(getBigNumber(1))).to.be.revertedWith('TH:STF')
      })
    
      it('Should burn wrapper and redeem underlying', async function () {
        const balanceUnderlying = await this.adapter.balanceUnderlying({ blockTag: 'pending' })
        let expectedOutput = balanceUnderlying;
        if (this.symbol === 'COMP') {
          expectedOutput = expectedOutput.add(await getPendingRewards(this.wrapper.address, this.wallet.address))
        }
        await expect(this.adapter.withdrawUnderlying(balanceUnderlying))
          .to.emit(this.underlying, 'Transfer')
          .withArgs(this.withdrawalSenderUnderlying, this.wallet.address, balanceUnderlying)
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
          await expect(this.adapter.withdrawUnderlying(await this.adapter.balanceUnderlying()))
            .to.emit(comp, 'Transfer')
            .withArgs(comptroller.address, this.wallet.address, expectedRewards)
        }
      })
    })
  
    describe('withdrawUnderlyingUpTo()', function () {
      beforeEach(async function () {
        await this.resetTests()
        await sendTokenToFrom(this.underlying, await this.converter.liquidityHolder(this.wrapper), `0x${'ff'.repeat(20)}`, await this.adapter.availableLiquidity({ blockTag: 'pending' }))
        await this.adapter.deposit(this.amountDeposited)
      })
    
      it('Should revert if caller has insufficient balance', async function () {
        await expect(this.adapter.connect(this.wallet1).withdrawUnderlyingUpTo(getBigNumber(1))).to.be.revertedWith('TH:STF')
      })
    
      it('Should withdraw min(amount, available)', async function () {
        const balanceUnderlying = await this.adapter.balanceUnderlying({ blockTag: 'pending' })
        const halfBalance = balanceUnderlying.div(2)
        await sendTokenToFrom(this.underlying, await this.converter.liquidityHolder(this.wrapper), `0x${'ff'.repeat(20)}`, halfBalance)
        const available = await this.adapter.availableLiquidity({ blockTag: 'pending' })

        await expect(this.adapter.withdrawUnderlyingUpTo(balanceUnderlying))
          .to.emit(this.underlying, 'Transfer')
          .withArgs(this.withdrawalSenderUnderlying, this.wallet.address, available)
        expect(await this.underlying.balanceOf(this.wallet.address)).to.eq(available)
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

  // Internal supply rate
  testAdapter(getAddress('0x0d8775f648430679a709e98d2b0cb6250d2887ef'), getAddress('0x6c8c6b02e7b2be14d4fa6022dfd6d75921d90e4e'), 'BAT');
  testAdapter(getAddress('0xe41d2489571d322189246dafa5ebde1f4699f498'), getAddress('0xb3319f5d18bc0d84dd1b4825dcde5d5f7266d407'), 'ZRX');
});