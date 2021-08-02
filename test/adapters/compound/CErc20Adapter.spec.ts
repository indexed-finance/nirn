import { expect } from 'chai'
import { ethers } from 'hardhat'
import { getAddress } from "@ethersproject/address"
import { IComptroller, IERC20, IErc20Adapter, TestComptrollerLens } from "../../../typechain"
import {
  setupAdapterContext,
  shouldBehaveLikeErc20AdapterDeposit,
  shouldBehaveLikeErc20AdapterInitialize,
  shouldBehaveLikeErc20AdapterQueries,
} from "../../Erc20AdapterBehavior.spec"
import { advanceBlock, deployContract, getIERC20, CompoundConverter, sendTokenToFrom, getBigNumber, createBalanceCheckpoint } from '../../shared'

describe('CErc20Adapter', () => {
  let comp: IERC20
  let lens: TestComptrollerLens;

  before(async () => {
    comp = await getIERC20('0xc00e94cb662c3520282e6f5717214004a7f26888')
    lens = await deployContract<TestComptrollerLens>('TestComptrollerLens')
  })

  const getPendingRewards = (cToken: string, account: string) => lens.callStatic.getPendingRewards(account, cToken, { blockTag: 'pending' })

  const testAdapter = (_underlying: string, _ctoken: string, symbol: string) => describe(`c${symbol}`, function () {
    setupAdapterContext(
      async () => (await deployContract('CErc20Adapter')) as IErc20Adapter,
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
      beforeEach(function () {return this.resetTests(true);})

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
      beforeEach(function () {return this.resetTests(true);})

      it('Should burn all caller wrapper token and redeem underlying', async function () {
        const wBalance = await this.wrapper.balanceOf(this.depositReceiverWrapped, { blockTag: 'pending' })
        const getBalanceChange = await createBalanceCheckpoint(this.underlying, this.wallet.address)
        let expectedOutput = await this.toUnderlying(wBalance)
        if (this.symbol === 'COMP') {
          expectedOutput = expectedOutput.add(await getPendingRewards(this.wrapper.address, this.wallet.address))
        }
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

  testAdapter(getAddress('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'), getAddress('0x39aa39c021dfbae8fac545936693ac917d5e7563'), 'USDC');
  testAdapter(getAddress('0xdac17f958d2ee523a2206206994597c13d831ec7'), getAddress('0xf650c3d88d12db855b8bf7d11be6c55a4e07dcc9'), 'USDT');
  testAdapter(getAddress('0x6b175474e89094c44da98b954eedeac495271d0f'), getAddress('0x5d3a536e4d6dbd6114cc1ead35777bab948e3643'), 'DAI');
  testAdapter(getAddress('0x1f9840a85d5af5bf1d1762f925bdaddc4201f984'), getAddress('0x35a18000230da775cac24873d00ff85bccded550'), 'UNI');
  testAdapter(getAddress('0xc00e94cb662c3520282e6f5717214004a7f26888'), getAddress('0x70e36f6bf80a52b3b46b3af8e106cc0ed743e8e4'), 'COMP');
  testAdapter(getAddress('0x2260fac5e5542a773aa44fbcfedf7c193bc2c599'), getAddress('0xccf4429db6322d5c611ee964527d42e5d685dd6a'), 'WBTC');
  testAdapter(getAddress('0x0000000000085d4780b73119b644ae5ecd22b376'), getAddress('0x12392f67bdf24fae0af363c24ac620a2f67dad86'), 'TUSD');
  testAdapter(getAddress('0x514910771af9ca656af840dff83e8264ecf986ca'), getAddress('0xface851a4921ce59e912d19329929ce6da6eb0c7'), 'LINK');
});