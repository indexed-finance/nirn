import { getAddress } from "@ethersproject/address"
import { expect } from "chai"
import { constants } from "ethers"
import { AaveV2Erc20Adapter, IAaveDistributionManager, IERC20, IStakedAave } from "../../typechain"
import {
  setupAdapterContext,
  shouldBehaveLikeAdapterDeposit,
  shouldBehaveLikeAdapterInitialize,
  shouldBehaveLikeAdapterQueries,
  shouldBehaveLikeAdapterWithdraw,
  shouldBehaveLikeAdapterWithdrawAll,
  shouldBehaveLikeAdapterWithdrawUnderlying
} from "../Erc20AdapterBehavior.spec"
import { deployContract, getContract, getNextContractAddress, latest, advanceTimeAndBlock, AaveV2Converter } from '../shared'

describe('AaveV2Erc20Adapter', function () {
  let aave: IERC20
  let stkAave: IStakedAave
  let incentives: IAaveDistributionManager
  let userModule: string

  before(async function () {
    aave = await getContract('0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9', 'IERC20')
    incentives = await getContract('0xd784927Ff2f95ba542BfC824c8a8a98F3495f6b5', 'IAaveDistributionManager')
    stkAave = await getContract('0x4da27a545c0c5B758a6BA100e3a049001de870f5', 'IStakedAave')
  })

  const testAdapter = (underlying: string, atoken: string, symbol: string) => describe(`a${symbol}`, function () {
    setupAdapterContext(
      async () => (await deployContract('AaveV2Erc20Adapter', '0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5')) as AaveV2Erc20Adapter,
      async (adapter, underlying, token) => (adapter as AaveV2Erc20Adapter).initialize(underlying.address, token.address),
      AaveV2Converter,
      underlying,
      atoken,
      async (adapter, underlying, wrapper) => {
        userModule = await getNextContractAddress(adapter.address)
        return {
          depositSenderWrapped: constants.AddressZero,
          depositReceiverWrapped: userModule,
          depositReceiverUnderlying: userModule,
          withdrawalSenderUnderlying: wrapper.address,
        }
      }
    )

    shouldBehaveLikeAdapterInitialize()

    shouldBehaveLikeAdapterQueries()

    describe('deposit()', function () {
      shouldBehaveLikeAdapterDeposit()

      it('If token is incentivized, should claim stkAave and begin cooldown after first deposit', async function () {
        if ((await incentives.getAssetData(this.wrapper.address)).emissionPerSecond.gt(0)) {
          await this.adapter.deposit(this.amountDeposited.div(2));
          await advanceTimeAndBlock(60)
          expect(await incentives.getRewardsBalance([this.wrapper.address], userModule)).to.be.gt(0);
          expect(await stkAave.stakersCooldowns(userModule)).to.eq(0)
          await this.adapter.deposit(this.amountDeposited.div(2));
          expect(await incentives.getRewardsBalance([this.wrapper.address], userModule)).to.eq(0);
          expect(await stkAave.stakersCooldowns(userModule)).to.eq(await latest())
        }
      })

      it('If token is incentivized, should claim Aave for user when cooldown is over', async function () {
        if ((await incentives.getAssetData(this.wrapper.address)).emissionPerSecond.gt(0)) {
          let amount = await this.getTokens(1);
          expect(await aave.balanceOf(this.wallet2.address)).to.eq(0)
          await this.underlying.transfer(this.wallet2.address, amount)
          await this.underlying.connect(this.wallet2).approve(this.adapter.address, constants.MaxUint256)
          await this.adapter.connect(this.wallet2).deposit(amount.div(3))
          await advanceTimeAndBlock(60)
          await this.adapter.connect(this.wallet2).deposit(amount.div(3))
          await advanceTimeAndBlock(864001)
          await this.adapter.connect(this.wallet2).deposit(amount.div(3))
          expect(await aave.balanceOf(this.wallet2.address)).to.be.gt(0)
          await aave.connect(this.wallet2).transfer(this.wallet1.address, await aave.balanceOf(this.wallet2.address))
        }
      })
    })
  
    describe('withdraw()', function () {
      shouldBehaveLikeAdapterWithdraw()

      it('If token is incentivized, should claim stkAave and begin cooldown', async function () {
        if ((await incentives.getAssetData(this.wrapper.address)).emissionPerSecond.gt(0)) {
          // await this.adapter.deposit(this.amountDeposited.div(2));
          await advanceTimeAndBlock(60)
          expect(await incentives.getRewardsBalance([this.wrapper.address], userModule)).to.be.gt(0);
          expect(await stkAave.stakersCooldowns(userModule)).to.eq(0)
          await this.adapter.withdraw(await this.adapter.balanceWrapped({ blockTag: 'pending' }));
          expect(await incentives.getRewardsBalance([this.wrapper.address], userModule)).to.eq(0);
          expect(await stkAave.stakersCooldowns(userModule)).to.eq(await latest())
        }
      })

      it('If token is incentivized, should claim Aave for user when cooldown is over', async function () {
        if ((await incentives.getAssetData(this.wrapper.address)).emissionPerSecond.gt(0)) {
          await advanceTimeAndBlock(60)
          const amount = await this.adapter.balanceWrapped({ blockTag: 'pending' })
          await this.adapter.withdraw(amount.div(2))
          await advanceTimeAndBlock(864001)
          await this.adapter.withdraw(amount.div(2))
          expect(await aave.balanceOf(this.wallet.address)).to.be.gt(0)
        }
      })
    })
  
    describe('withdrawUnderlying()', function () {
      shouldBehaveLikeAdapterWithdrawUnderlying()

      it('If token is incentivized, should claim stkAave and begin cooldown', async function () {
        if ((await incentives.getAssetData(this.wrapper.address)).emissionPerSecond.gt(0)) {
          // await this.adapter.deposit(this.amountDeposited.div(2));
          await advanceTimeAndBlock(60)
          expect(await incentives.getRewardsBalance([this.wrapper.address], userModule)).to.be.gt(0);
          expect(await stkAave.stakersCooldowns(userModule)).to.eq(0)
          await this.adapter.withdrawUnderlying(await this.adapter.balanceUnderlying({ blockTag: 'pending' }));
          expect(await incentives.getRewardsBalance([this.wrapper.address], userModule)).to.eq(0);
          expect(await stkAave.stakersCooldowns(userModule)).to.eq(await latest())
        }
      })

      it('If token is incentivized, should claim Aave for user when cooldown is over', async function () {
        if ((await incentives.getAssetData(this.wrapper.address)).emissionPerSecond.gt(0)) {
          await advanceTimeAndBlock(60)
          const amount = await this.adapter.balanceUnderlying({ blockTag: 'pending' })
          await this.adapter.withdrawUnderlying(amount.div(2))
          await advanceTimeAndBlock(864001)
          await this.adapter.withdrawUnderlying(amount.div(2))
          expect(await aave.balanceOf(this.wallet.address)).to.be.gt(0)
        }
      })
    })
  
    describe('withdrawUnderlyingUpTo()', function () {
      shouldBehaveLikeAdapterWithdrawUnderlying()

      it('If token is incentivized, should claim stkAave and begin cooldown', async function () {
        if ((await incentives.getAssetData(this.wrapper.address)).emissionPerSecond.gt(0)) {
          // await this.adapter.deposit(this.amountDeposited.div(2));
          await advanceTimeAndBlock(60)
          expect(await incentives.getRewardsBalance([this.wrapper.address], userModule)).to.be.gt(0);
          expect(await stkAave.stakersCooldowns(userModule)).to.eq(0)
          await this.adapter.withdrawUnderlyingUpTo(await this.adapter.balanceUnderlying({ blockTag: 'pending' }));
          expect(await incentives.getRewardsBalance([this.wrapper.address], userModule)).to.eq(0);
          expect(await stkAave.stakersCooldowns(userModule)).to.eq(await latest())
        }
      })

      it('If token is incentivized, should claim Aave for user when cooldown is over', async function () {
        if ((await incentives.getAssetData(this.wrapper.address)).emissionPerSecond.gt(0)) {
          await advanceTimeAndBlock(60)
          const amount = await this.adapter.balanceUnderlying({ blockTag: 'pending' })
          await this.adapter.withdrawUnderlyingUpTo(amount.div(2))
          await advanceTimeAndBlock(864001)
          await this.adapter.withdrawUnderlyingUpTo(amount.div(2))
          expect(await aave.balanceOf(this.wallet.address)).to.be.gt(0)
        }
      })
    })
  
    describe('withdrawAll()', function () {
      shouldBehaveLikeAdapterWithdrawAll()

      it('If token is incentivized, should claim stkAave and begin cooldown', async function () {
        if ((await incentives.getAssetData(this.wrapper.address)).emissionPerSecond.gt(0)) {
          // await this.adapter.deposit(this.amountDeposited.div(2));
          await advanceTimeAndBlock(60)
          expect(await incentives.getRewardsBalance([this.wrapper.address], userModule)).to.be.gt(0);
          expect(await stkAave.stakersCooldowns(userModule)).to.eq(0)
          await this.adapter.withdrawAll();
          expect(await incentives.getRewardsBalance([this.wrapper.address], userModule)).to.eq(0);
          expect(await stkAave.stakersCooldowns(userModule)).to.eq(await latest())
        }
      })

      it('If token is incentivized, should claim Aave for user when cooldown is over', async function () {
        if ((await incentives.getAssetData(this.wrapper.address)).emissionPerSecond.gt(0)) {
          await advanceTimeAndBlock(60)
          await this.adapter.withdrawAll();
          await this.adapter.deposit(await this.underlying.balanceOf(this.wallet.address))
          await advanceTimeAndBlock(864001)
          await this.adapter.withdrawAll();
          expect(await aave.balanceOf(this.wallet.address)).to.be.gt(0)
        }
      })
    })
  })

  testAdapter(getAddress('0xdac17f958d2ee523a2206206994597c13d831ec7'), getAddress('0x3ed3b47dd13ec9a98b44e6204a523e766b225811'), 'USDT');
  testAdapter(getAddress('0x2260fac5e5542a773aa44fbcfedf7c193bc2c599'), getAddress('0x9ff58f4ffb29fa2266ab25e75e2a8b3503311656'), 'WBTC');
  testAdapter(getAddress('0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e'), getAddress('0x5165d24277cd063f5ac44efd447b27025e888f37'), 'YFI');
  testAdapter(getAddress('0xe41d2489571d322189246dafa5ebde1f4699f498'), getAddress('0xdf7ff54aacacbff42dfe29dd6144a69b629f8c9e'), 'ZRX');
  testAdapter(getAddress('0x1f9840a85d5af5bf1d1762f925bdaddc4201f984'), getAddress('0xb9d7cb55f463405cdfbe4e90a6d2df01c2b92bf1'), 'UNI');
  testAdapter(getAddress('0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9'), getAddress('0xffc97d72e13e01096502cb8eb52dee56f74dad7b'), 'AAVE');
  testAdapter(getAddress('0x0d8775f648430679a709e98d2b0cb6250d2887ef'), getAddress('0x05ec93c0365baaeabf7aeffb0972ea7ecdd39cf1'), 'BAT');
  testAdapter(getAddress('0x4fabb145d64652a948d72533023f6e7a623c7c53'), getAddress('0xa361718326c15715591c299427c62086f69923d9'), 'BUSD');
  testAdapter(getAddress('0x6b175474e89094c44da98b954eedeac495271d0f'), getAddress('0x028171bca77440897b824ca71d1c56cac55b68a3'), 'DAI');
  testAdapter(getAddress('0xf629cbd94d3791c9250152bd8dfbdf380e2a3b9c'), getAddress('0xac6df26a590f08dcc95d5a4705ae8abbc88509ef'), 'ENJ');
  testAdapter(getAddress('0xdd974d5c2e2928dea5f71b9825b8b646686bd200'), getAddress('0x39c6b3e42d6a679d7d776778fe880bc9487c2eda'), 'KNC');
  testAdapter(getAddress('0x514910771af9ca656af840dff83e8264ecf986ca'), getAddress('0xa06bc25b5805d5f8d82847d191cb4af5a3e873e0'), 'LINK');
  testAdapter(getAddress('0x0f5d2fb29fb7d3cfee444a200298f468908cc942'), getAddress('0xa685a61171bb30d4072b338c80cb7b2c865c873e'), 'MANA');
  testAdapter(getAddress('0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2'), getAddress('0xc713e5e149d5d0715dcd1c156a020976e7e56b88'), 'MKR');
  testAdapter(getAddress('0x408e41876cccdc0f92210600ef50372656052a38'), getAddress('0xcc12abe4ff81c9378d670de1b57f8e0dd228d77a'), 'REN');
  testAdapter(getAddress('0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f'), getAddress('0x35f6b052c598d933d69a4eec4d04c73a191fe6c2'), 'SNX');
  testAdapter(getAddress('0x57ab1ec28d129707052df4df418d58a2d46d5f51'), getAddress('0x6c5024cd4f8a59110119c56f8933403a539555eb'), 'sUSD');
  testAdapter(getAddress('0x0000000000085d4780b73119b644ae5ecd22b376'), getAddress('0x101cc05f4a51c0319f570d5e146a8c625198e636'), 'TUSD');
  testAdapter(getAddress('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'), getAddress('0xbcca60bb61934080951369a648fb03df4f96263c'), 'USDC');
  testAdapter(getAddress('0xd533a949740bb3306d119cc777fa900ba034cd52'), getAddress('0x8dae6cb04688c62d939ed9b68d32bc62e49970b1'), 'CRV');
  testAdapter(getAddress('0x056fd409e1d7a124bd7017459dfea2f387b6d5cd'), getAddress('0xd37ee7e4f452c6638c96536e68090de8cbcdb583'), 'GUSD');
  testAdapter(getAddress('0xba100000625a3754423978a60c9317c58a424e3d'), getAddress('0x272f97b7a56a387ae942350bbc7df5700f8a4576'), 'BAL');
  testAdapter(getAddress('0x8798249c2e607446efb7ad49ec89dd1865ff4272'), getAddress('0xf256cc7847e919fac9b808cc216cac87ccf2f47a'), 'xSUSHI');
  testAdapter(getAddress('0xd5147bc8e386d91cc5dbe72099dac6c9b99276f5'), getAddress('0x514cd6756ccbe28772d4cb81bc3156ba9d1744aa'), 'renFIL');
})