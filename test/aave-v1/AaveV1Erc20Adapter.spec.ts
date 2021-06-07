import { getAddress } from "@ethersproject/address"
import { expect } from "chai"
import { BigNumber, constants } from "ethers"
import { waffle } from "hardhat"
import { AaveV1Erc20Adapter, IERC20 } from "../../typechain"
import { deployContract, getContract, sendTokenTo, getBigNumber, deployClone } from '../shared'


describe('AaveV1Erc20Adapter', () => {
  const [wallet, wallet1] = waffle.provider.getWallets();
  let implementation: AaveV1Erc20Adapter;
  let adapter: AaveV1Erc20Adapter;
  let token: IERC20;
  let aToken: IERC20;

  before('Deploy implementation', async () => {
    implementation = await deployContract('AaveV1Erc20Adapter', '0x24a42fD28C976A61Df5D00D0599C34c4f90748c8');
  })

  const testAdapter = (underlying: string, atoken: string, symbol: string) => describe(`a${symbol}`, () => {
    let amountMinted: BigNumber;
    
    before(async () => {
      token = await getContract(underlying, 'IERC20')
      aToken = await getContract(atoken, 'IERC20')
      adapter = await deployClone(implementation, 'AaveV1Erc20Adapter');
      await adapter.initialize(token.address, aToken.address);
      await token.approve(adapter.address, constants.MaxUint256);
      await aToken.approve(adapter.address, constants.MaxUint256);
      amountMinted = await getTokens(10)
    })

    async function getTokens(amount: number) {
      const decimals = await (await getContract(underlying, 'IERC20Metadata')).decimals();
      const tokenAmount = getBigNumber(amount, decimals);
      await sendTokenTo(underlying, wallet.address, tokenAmount);
      return tokenAmount;
    }
  
    describe('settings', () => {
      it('name()', async () => {
        expect(await adapter.name()).to.eq(`Aave V1 ${symbol} Adapter`);
      })
  
      it('token()', async () => {
        expect(await adapter.token()).to.eq(aToken.address);
      })
  
      it('underlying()', async () => {
        expect(await adapter.underlying()).to.eq(token.address);
      })
    })
  
    describe('deposit()', () => {
      it('Should revert if caller has insufficient balance', async () => {
        await expect(adapter.connect(wallet1).deposit(getBigNumber(1))).to.be.revertedWith('TH:STF')
      })
  
      it('Should mint aToken and transfer to caller', async () => {
        await expect(adapter.deposit(amountMinted))
          .to.emit(token, 'Transfer')
          .withArgs(wallet.address, adapter.address, amountMinted)
          .to.emit(aToken, 'Transfer')
          .withArgs(adapter.address, wallet.address, amountMinted);
        expect(await token.balanceOf(wallet.address)).to.eq(0);
        expect(await aToken.balanceOf(wallet.address)).to.eq(amountMinted);
      })
    })
  
    describe('balanceWrapped()', () => {
      it('Should return caller balance in aToken', async () => {
        expect(await adapter.balanceWrapped()).to.eq(amountMinted);
        expect(await adapter.connect(wallet1).balanceWrapped()).to.eq(0);
      })
    })
  
    describe('balanceUnderlying()', () => {
      it('Should return caller balance in aToken (aToken convertible 1:1)', async () => {
        expect(await adapter.balanceUnderlying()).to.eq(amountMinted);
        expect(await adapter.connect(wallet1).balanceUnderlying()).to.eq(0);
      })
    })
  
    describe('getHypotheticalAPR()', () => {
      it('Positive should decrease APR', async () => {
        const apr = await adapter.getAPR();
        if (apr.gt(0)) {
          expect(await adapter.getHypotheticalAPR(getBigNumber(1))).to.be.lt(apr);
        }
      })
  
      it('Negative should increase APR', async () => {
        const apr = await adapter.getAPR();
        if (apr.gt(0)) {
          expect(await adapter.getHypotheticalAPR(getBigNumber(1).mul(-1))).to.be.gt(apr);
        }
      })
    })
  
    describe('withdraw()', () => {
      it('Should revert if caller has insufficient balance', async () => {
        await expect(adapter.connect(wallet1).withdraw(getBigNumber(1))).to.be.revertedWith('TH:STF')
      })
  
      it('Should burn aToken and redeem underlying', async () => {
        const balance = await aToken.balanceOf(wallet.address);
        await expect(adapter.withdraw(balance))
          .to.emit(aToken, 'Transfer')
          .withArgs(wallet.address, adapter.address, balance)
          .to.emit(token, 'Transfer')
          .withArgs(adapter.address, wallet.address, balance);
        expect(await token.balanceOf(wallet.address)).to.eq(balance);
      })
    })
  
    describe('withdrawAll()', () => {
      before(async () => {
        amountMinted = await getTokens(10)
        await adapter.deposit(amountMinted);
      })
  
      it('Should burn all caller aToken and redeem underlying', async () => {
        const balance = await aToken.balanceOf(wallet.address);
        await adapter.withdrawAll();
        expect(await token.balanceOf(wallet.address)).to.be.gte(balance);
        expect(await aToken.balanceOf(wallet.address)).to.eq(0);
      })
    })
  });

  testAdapter(getAddress('0x6b175474e89094c44da98b954eedeac495271d0f'), getAddress('0xfc1e690f61efd961294b3e1ce3313fbd8aa4f85d'), 'DAI');
  testAdapter(getAddress('0x0000000000085d4780b73119b644ae5ecd22b376'), getAddress('0x4da9b813057d04baef4e5800e36083717b4a0341'), 'TUSD');
  testAdapter(getAddress('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'), getAddress('0x9ba00d6856a4edf4665bca2c2309936572473b7e'), 'USDC');
  testAdapter(getAddress('0xdac17f958d2ee523a2206206994597c13d831ec7'), getAddress('0x71fc860f7d3a592a4a98740e39db31d25db65ae8'), 'USDT');
  testAdapter(getAddress('0x57ab1ec28d129707052df4df418d58a2d46d5f51'), getAddress('0x625ae63000f46200499120b906716420bd059240'), 'sUSD');
  testAdapter(getAddress('0x0d8775f648430679a709e98d2b0cb6250d2887ef'), getAddress('0xe1ba0fb44ccb0d11b80f92f4f8ed94ca3ff51d00'), 'BAT');
  testAdapter(getAddress('0x514910771af9ca656af840dff83e8264ecf986ca'), getAddress('0xa64bd6c70cb9051f6a9ba1f163fdc07e0dfb5f84'), 'LINK');
  testAdapter(getAddress('0xdd974d5c2e2928dea5f71b9825b8b646686bd200'), getAddress('0x9d91be44c06d373a8a226e1f3b146956083803eb'), 'KNC');
  testAdapter(getAddress('0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2'), getAddress('0x7deb5e830be29f91e298ba5ff1356bb7f8146998'), 'MKR');
  testAdapter(getAddress('0x0f5d2fb29fb7d3cfee444a200298f468908cc942'), getAddress('0x6fce4a401b6b80ace52baaefe4421bd188e76f6f'), 'MANA');
  testAdapter(getAddress('0xe41d2489571d322189246dafa5ebde1f4699f498'), getAddress('0x6fb0855c404e09c47c3fbca25f08d4e41f9f062f'), 'ZRX');
  testAdapter(getAddress('0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f'), getAddress('0x328c4c80bc7aca0834db37e6600a6c49e12da4de'), 'SNX');
  testAdapter(getAddress('0x2260fac5e5542a773aa44fbcfedf7c193bc2c599'), getAddress('0xfc4b8ed459e00e5400be803a9bb3954234fd50e3'), 'WBTC');
  testAdapter(getAddress('0x4fabb145d64652a948d72533023f6e7a623c7c53'), getAddress('0x6ee0f7bb50a54ab5253da0667b0dc2ee526c30a8'), 'BUSD');
  testAdapter(getAddress('0xf629cbd94d3791c9250152bd8dfbdf380e2a3b9c'), getAddress('0x712db54daa836b53ef1ecbb9c6ba3b9efb073f40'), 'ENJ');
  testAdapter(getAddress('0x408e41876cccdc0f92210600ef50372656052a38'), getAddress('0x69948cc03f478b95283f7dbf1ce764d0fc7ec54c'), 'REN');
  testAdapter(getAddress('0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e'), getAddress('0x12e51e77daaa58aa0e9247db7510ea4b46f9bead'), 'YFI');
  testAdapter(getAddress('0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9'), getAddress('0xba3d9687cf50fe253cd2e1cfeede1d6787344ed5'), 'AAVE');
  testAdapter(getAddress('0x1f9840a85d5af5bf1d1762f925bdaddc4201f984'), getAddress('0xb124541127a0a657f056d9dd06188c4f1b0e5aab'), 'UNI');
});