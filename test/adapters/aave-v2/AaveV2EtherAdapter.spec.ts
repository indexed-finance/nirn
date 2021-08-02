import { getAddress } from "@ethersproject/address"
import { expect } from "chai"
import { constants } from "ethers"
import { AaveV2Erc20Adapter, IAaveDistributionManager, IERC20, IEtherAdapter, IStakedAave, IWETH } from "../../../typechain"
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
  shouldBehaveLikeEtherAdapterWithdrawAllAsEth,
  shouldBehaveLikeEtherAdapterWithdrawAsETH,
  shouldBehaveLikeEtherAdapterWithdrawUnderlyingAsETH
} from '../../EtherAdapterBehavior.spec'
import { deployContract, getContract, getNextContractAddress, latest, advanceTimeAndBlock, AaveV2Converter, getBigNumber, sendEtherTo, WETH } from '../../shared'

describe('AaveV2EtherAdapter', function () {
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
      async () => (await deployContract('AaveV2EtherAdapter', '0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5', underlying, atoken)) as AaveV2Erc20Adapter,
      async (adapter, underlying, token) => { return undefined as any },
      AaveV2Converter,
      underlying,
      atoken,
      symbol,
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

    shouldBehaveLikeErc20AdapterInitialize()

    shouldBehaveLikeErc20AdapterQueries()

    describe('deposit()', function () {
      shouldBehaveLikeErc20AdapterDeposit()

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

    describe('depositETH', function () {
      shouldBehaveLikeEtherAdapterDepositETH()

      it('If token is incentivized, should claim stkAave and begin cooldown after first deposit', async function () {
        if ((await incentives.getAssetData(this.wrapper.address)).emissionPerSecond.gt(0)) {
          const adapter = await getContract<IEtherAdapter>(this.adapter.address, 'IEtherAdapter')
          await adapter.depositETH({ value: this.amountDeposited.div(2) });
          await advanceTimeAndBlock(60)
          expect(await incentives.getRewardsBalance([this.wrapper.address], userModule)).to.be.gt(0);
          expect(await stkAave.stakersCooldowns(userModule)).to.eq(0)
          await adapter.depositETH({ value: this.amountDeposited.div(2) });
          expect(await incentives.getRewardsBalance([this.wrapper.address], userModule)).to.eq(0);
          expect(await stkAave.stakersCooldowns(userModule)).to.eq(await latest())
        }
      })

      it('If token is incentivized, should claim Aave for user when cooldown is over', async function () {
        if ((await incentives.getAssetData(this.wrapper.address)).emissionPerSecond.gt(0)) {
          const amount = getBigNumber(1)
          await sendEtherTo(this.wallet2.address, amount)
          const adapter = (await getContract<IEtherAdapter>(this.adapter.address, 'IEtherAdapter')).connect(this.wallet2)
          expect(await aave.balanceOf(this.wallet2.address)).to.eq(0)
          await adapter.depositETH({ value: amount.div(3) })
          await advanceTimeAndBlock(60)
          await adapter.depositETH({ value: amount.div(3) })
          await advanceTimeAndBlock(864001)
          await adapter.depositETH({ value: amount.div(3) })
          expect(await aave.balanceOf(this.wallet2.address)).to.be.gt(0)
        }
      })
    })
  
    describe('withdraw()', function () {
      shouldBehaveLikeErc20AdapterWithdraw()

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
  
    describe('withdrawAsETH()', function () {
      shouldBehaveLikeEtherAdapterWithdrawAsETH()

      it('If token is incentivized, should claim stkAave and begin cooldown', async function () {
        if ((await incentives.getAssetData(this.wrapper.address)).emissionPerSecond.gt(0)) {
          const adapter = (await getContract<IEtherAdapter>(this.adapter.address, 'IEtherAdapter'))
          await advanceTimeAndBlock(60)
          expect(await incentives.getRewardsBalance([this.wrapper.address], userModule)).to.be.gt(0);
          expect(await stkAave.stakersCooldowns(userModule)).to.eq(0)
          await adapter.withdrawAsETH(await adapter.balanceWrapped({ blockTag: 'pending' }));
          expect(await incentives.getRewardsBalance([this.wrapper.address], userModule)).to.eq(0);
          expect(await stkAave.stakersCooldowns(userModule)).to.eq(await latest())
        }
      })

      it('If token is incentivized, should claim Aave for user when cooldown is over', async function () {
        if ((await incentives.getAssetData(this.wrapper.address)).emissionPerSecond.gt(0)) {
          const adapter = (await getContract<IEtherAdapter>(this.adapter.address, 'IEtherAdapter'))
          await advanceTimeAndBlock(60)
          const amount = await this.adapter.balanceWrapped({ blockTag: 'pending' })
          await adapter.withdrawAsETH(amount.div(2))
          await advanceTimeAndBlock(864001)
          await adapter.withdrawAsETH(amount.div(2))
          expect(await aave.balanceOf(this.wallet.address)).to.be.gt(0)
        }
      })
    })
  
    describe('withdrawAll()', function () {
      shouldBehaveLikeErc20AdapterWithdrawAll()

      it('If token is incentivized, should claim stkAave and begin cooldown', async function () {
        if ((await incentives.getAssetData(this.wrapper.address)).emissionPerSecond.gt(0)) {
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
  
    describe('withdrawAllAsETH()', function () {
      shouldBehaveLikeEtherAdapterWithdrawAllAsEth()

      it('If token is incentivized, should claim stkAave and begin cooldown', async function () {
        if ((await incentives.getAssetData(this.wrapper.address)).emissionPerSecond.gt(0)) {
          const adapter = (await getContract<IEtherAdapter>(this.adapter.address, 'IEtherAdapter'))
          await advanceTimeAndBlock(60)
          expect(await incentives.getRewardsBalance([this.wrapper.address], userModule)).to.be.gt(0);
          expect(await stkAave.stakersCooldowns(userModule)).to.eq(0)
          await adapter.withdrawAllAsETH();
          expect(await incentives.getRewardsBalance([this.wrapper.address], userModule)).to.eq(0);
          expect(await stkAave.stakersCooldowns(userModule)).to.eq(await latest())
        }
      })

      it('If token is incentivized, should claim Aave for user when cooldown is over', async function () {
        if ((await incentives.getAssetData(this.wrapper.address)).emissionPerSecond.gt(0)) {
          const adapter = (await getContract<IEtherAdapter>(this.adapter.address, 'IEtherAdapter'))
          await advanceTimeAndBlock(60)
          await adapter.withdrawAllAsETH();
          await (await getContract<IWETH>(WETH, 'IWETH')).deposit({value: this.amountDeposited})
          await this.adapter.deposit(this.amountDeposited)
          await advanceTimeAndBlock(864001)
          await adapter.withdrawAllAsETH();
          expect(await aave.balanceOf(this.wallet.address)).to.be.gt(0)
        }
      })
    })
  
    describe('withdrawUnderlying()', function () {
      shouldBehaveLikeErc20AdapterWithdrawUnderlying()

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
  
    describe('withdrawUnderlyingAsETH()', function () {
      shouldBehaveLikeEtherAdapterWithdrawUnderlyingAsETH()

      it('If token is incentivized, should claim stkAave and begin cooldown', async function () {
        if ((await incentives.getAssetData(this.wrapper.address)).emissionPerSecond.gt(0)) {
          const adapter = (await getContract<IEtherAdapter>(this.adapter.address, 'IEtherAdapter'))
          await advanceTimeAndBlock(60)
          expect(await incentives.getRewardsBalance([this.wrapper.address], userModule)).to.be.gt(0);
          expect(await stkAave.stakersCooldowns(userModule)).to.eq(0)
          await adapter.withdrawUnderlyingAsETH(await this.adapter.balanceUnderlying({ blockTag: 'pending' }));
          expect(await incentives.getRewardsBalance([this.wrapper.address], userModule)).to.eq(0);
          expect(await stkAave.stakersCooldowns(userModule)).to.eq(await latest())
        }
      })

      it('If token is incentivized, should claim Aave for user when cooldown is over', async function () {
        if ((await incentives.getAssetData(this.wrapper.address)).emissionPerSecond.gt(0)) {
          const adapter = (await getContract<IEtherAdapter>(this.adapter.address, 'IEtherAdapter'))
          await advanceTimeAndBlock(60)
          const amount = await this.adapter.balanceUnderlying({ blockTag: 'pending' })
          await adapter.withdrawUnderlyingAsETH(amount.div(2))
          await advanceTimeAndBlock(864001)
          await adapter.withdrawUnderlyingAsETH(amount.div(2))
          expect(await aave.balanceOf(this.wallet.address)).to.be.gt(0)
        }
      })
    })
  
    describe('withdrawUnderlyingUpTo()', function () {
      shouldBehaveLikeErc20AdapterWithdrawUnderlying()

      it('If token is incentivized, should claim stkAave and begin cooldown', async function () {
        if ((await incentives.getAssetData(this.wrapper.address)).emissionPerSecond.gt(0)) {
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
  })
  testAdapter(getAddress('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'), getAddress('0x030ba81f1c18d280636f32af80b9aad02cf0854e'), 'WETH');
})
