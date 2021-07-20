import { expect } from 'chai'
import { ethers } from 'hardhat'
import { getAddress } from "@ethersproject/address"
import { IComptroller, IERC20, IErc20Adapter, TestComptrollerLens } from "../../typechain"
import {
  setupAdapterContext,
  shouldBehaveLikeErc20AdapterDeposit,
  shouldBehaveLikeErc20AdapterInitialize,
  shouldBehaveLikeErc20AdapterQueries,
  shouldBehaveLikeErc20AdapterWithdraw,
  shouldBehaveLikeErc20AdapterWithdrawAll,
  shouldBehaveLikeErc20AdapterWithdrawUnderlying,
  shouldBehaveLikeErc20AdapterWithdrawUnderlyingUpTo
} from "../Erc20AdapterBehavior.spec"
import { advanceBlock, deployContract, getIERC20, CompoundConverter } from '../shared'

describe('CErc20Adapter', () => {
  let comp: IERC20

  before(async () => {
    comp = await getIERC20('0xc00e94cb662c3520282e6f5717214004a7f26888')
  })

  const getLens = () => deployContract<TestComptrollerLens>('TestComptrollerLens')

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
  
    describe('withdraw()', function () {
      shouldBehaveLikeErc20AdapterWithdraw()

      it('Should claim COMP owed to caller if incentivized', async function () {
        await this.resetTests(true)
        const comptroller = (await ethers.getContractAt('IComptroller', '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B')) as IComptroller
        if ((await comptroller.compSpeeds(this.wrapper.address)).gt(0)) {
          await advanceBlock()
          const expectedRewards = await (await getLens()).callStatic.getPendingRewards(this.wallet.address, this.wrapper.address, { blockTag: 'pending' })
          expect(expectedRewards).to.be.gt(0)
          await expect(this.adapter.withdraw(await this.wrapper.balanceOf(this.wallet.address)))
            .to.emit(comp, 'Transfer')
            .withArgs(comptroller.address, this.wallet.address, expectedRewards)
        }
      })
    })
  
    describe('withdrawAll()', function () {
      shouldBehaveLikeErc20AdapterWithdrawAll()

      it('Should claim COMP owed to caller if incentivized', async function () {
        await this.resetTests(true)
        const comptroller = (await ethers.getContractAt('IComptroller', '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B')) as IComptroller
        if ((await comptroller.compSpeeds(this.wrapper.address)).gt(0)) {
          await advanceBlock()
          const expectedRewards = await (await getLens()).callStatic.getPendingRewards(this.wallet.address, this.wrapper.address, { blockTag: 'pending' })
          expect(expectedRewards).to.be.gt(0)
          await expect(this.adapter.withdrawAll())
            .to.emit(comp, 'Transfer')
            .withArgs(comptroller.address, this.wallet.address, expectedRewards)
        }
      })
    })
  
    describe('withdrawUnderlying()', function () {
      shouldBehaveLikeErc20AdapterWithdrawUnderlying()

      it('Should claim COMP owed to caller if incentivized', async function () {
        await this.resetTests(true)
        const comptroller = (await ethers.getContractAt('IComptroller', '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B')) as IComptroller
        if ((await comptroller.compSpeeds(this.wrapper.address)).gt(0)) {
          await advanceBlock()
          const expectedRewards = await (await getLens()).callStatic.getPendingRewards(this.wallet.address, this.wrapper.address, { blockTag: 'pending' })
          expect(expectedRewards).to.be.gt(0)
          await expect(this.adapter.withdrawUnderlying(await this.adapter.balanceUnderlying()))
            .to.emit(comp, 'Transfer')
            .withArgs(comptroller.address, this.wallet.address, expectedRewards)
        }
      })
    })
  
    describe('withdrawUnderlyingUpTo()', function () {
      shouldBehaveLikeErc20AdapterWithdrawUnderlyingUpTo()

      it('Should claim COMP owed to caller if incentivized', async function () {
        await this.resetTests(true)
        const comptroller = (await ethers.getContractAt('IComptroller', '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B')) as IComptroller
        if ((await comptroller.compSpeeds(this.wrapper.address)).gt(0)) {
          await advanceBlock()
          const expectedRewards = await (await getLens()).callStatic.getPendingRewards(this.wallet.address, this.wrapper.address, { blockTag: 'pending' })
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