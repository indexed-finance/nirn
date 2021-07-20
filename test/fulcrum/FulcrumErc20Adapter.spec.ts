import { getAddress } from "@ethersproject/address"
import { formatEther } from "@ethersproject/units"
import { expect } from "chai"
import { constants } from "ethers"
import { FulcrumErc20Adapter } from "../../typechain"
import {
  setupAdapterContext,
  shouldBehaveLikeErc20AdapterInitialize,
  shouldBehaveLikeErc20AdapterQueries,
  shouldBehaveLikeErc20AdapterDeposit,
  shouldBehaveLikeErc20AdapterWithdraw,
  shouldBehaveLikeErc20AdapterWithdrawAll,
  shouldBehaveLikeErc20AdapterWithdrawUnderlying
} from "../Erc20AdapterBehavior.spec"
import { deployContract, FulcrumConverter, getBigNumber, sendTokenTo, sendTokenToFrom } from '../shared'

describe('FulcrumErc20Adapter', () => {
  const testAdapter = (_underlying: string, _ctoken: string, symbol: string) => describe(`i${symbol}`, function () {
    setupAdapterContext(
      async () => (await deployContract('FulcrumErc20Adapter')) as FulcrumErc20Adapter,
      async (adapter, underlying, token) => adapter.initialize(underlying.address, token.address),
      FulcrumConverter,
      _underlying,
      _ctoken,
      symbol,
      async (adapter, underlying, wrapper) => ({
        depositSenderWrapped: constants.AddressZero,
        withdrawalSenderUnderlying: wrapper.address
      })
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
      beforeEach(async function () {
        await this.resetTests()
        const total = await this.adapter.availableLiquidity()
        await sendTokenTo(this.underlying.address, this.wallet.address, total)
        const available = await this.adapter.availableLiquidity()
        await this.adapter.deposit(this.amountDeposited)
        await sendTokenToFrom(this.underlying, await this.converter.liquidityHolder(this.wrapper), `0x${'ff'.repeat(20)}`, available)
        await this.adapter.deposit(total)
      })
    
      it('Should revert if caller has insufficient balance', async function () {
        await expect(this.adapter.connect(this.wallet1).withdrawUnderlyingUpTo(getBigNumber(1))).to.be.revertedWith('TH:STF');
      })
    
      // Most Fulcrum tokens make it difficult or impossible to have iTokens worth more than availableLiquidity
      // so this test will usually fail. 
      it('Should withdraw min(amount, available)', async function () {
        const balanceUnderlying = await this.adapter.balanceUnderlying({ blockTag: 'pending' })
        await sendTokenToFrom(this.underlying, await this.converter.liquidityHolder(this.wrapper), `0x${'ff'.repeat(20)}`, balanceUnderlying.mul(2).div(10))
        const available = await this.adapter.availableLiquidity({ blockTag: 'pending' })
        const expectedOutput = await this.toUnderlying(await this.toWrapped(available))
        await expect(this.adapter.withdrawUnderlyingUpTo(balanceUnderlying))
          .to.emit(this.underlying, 'Transfer')
          .withArgs(this.withdrawalSenderUnderlying, this.wallet.address, expectedOutput)
        expect(await this.underlying.balanceOf(this.wallet.address)).to.eq(expectedOutput)
        expect(await this.wrapper.balanceOf(this.adapter.address)).to.eq(0)
      })
    })
  })

  // Broken
  // testAdapter(getAddress('0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e'), getAddress('0x7f3fe9d492a9a60aebb06d82cba23c6f32cad10b'), 'YFI');
  // testAdapter(getAddress('0x80fb784b7ed66730e8b1dbd9820afd29931aab03'), getAddress('0xab45bf58c6482b87da85d6688c4d9640e093be98'), 'LEND');

  // Add test for FulcrumEtherAdapter
  // testAdapter(getAddress('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'), getAddress('0xb983e01458529665007ff7e0cddecdb74b967eb6'), 'ETH');
  testAdapter(getAddress('0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9'), getAddress('0x0cae8d91e0b1b7bd00d906e990c3625b2c220db1'), 'AAVE');
  testAdapter(getAddress('0x6b175474e89094c44da98b954eedeac495271d0f'), getAddress('0x6b093998d36f2c7f0cc359441fbb24cc629d5ff0'), 'DAI');
  testAdapter(getAddress('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'), getAddress('0x32e4c68b3a4a813b710595aeba7f6b7604ab9c15'), 'USDC');
  testAdapter(getAddress('0x2260fac5e5542a773aa44fbcfedf7c193bc2c599'), getAddress('0x2ffa85f655752fb2acb210287c60b9ef335f5b6e'), 'WBTC');
  testAdapter(getAddress('0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2'), getAddress('0x9189c499727f88f8ecc7dc4eea22c828e6aac015'), 'MKR');
  testAdapter(getAddress('0xc00e94cb662c3520282e6f5717214004a7f26888'), getAddress('0x6d29903bc2c4318b59b35d97ab98ab9ec08ed70d'), 'COMP');
  testAdapter(getAddress('0xdd974d5c2e2928dea5f71b9825b8b646686bd200'), getAddress('0x687642347a9282be8fd809d8309910a3f984ac5a'), 'KNC');
  testAdapter(getAddress('0x56d811088235f11c8920698a204a5010a788f4b3'), getAddress('0x18240bd9c07fa6156ce3f3f61921cc82b2619157'), 'BZRX');
  testAdapter(getAddress('0x514910771af9ca656af840dff83e8264ecf986ca'), getAddress('0x463538705e7d22aa7f03ebf8ab09b067e1001b54'), 'LINK');
  testAdapter(getAddress('0xdac17f958d2ee523a2206206994597c13d831ec7'), getAddress('0x7e9997a38a439b2be7ed9c9c4628391d3e055d48'), 'USDT');
  testAdapter(getAddress('0x1f9840a85d5af5bf1d1762f925bdaddc4201f984'), getAddress('0x0a625fcec657053fe2d9fffdeb1dbb4e412cf8a8'), 'UNI');
  testAdapter(getAddress('0xbbbbca6a901c926f240b89eacb641d8aec7aeafd'), getAddress('0x3da0e01472dee3746b4d324a65d7edfaeca9aa4f'), 'LRC');
});