import { getAddress } from "@ethersproject/address"
import { expect } from "chai"
import { BigNumber, constants } from "ethers"
import { waffle } from "hardhat"
import { AaveV2Erc20Adapter, IERC20 } from "../../typechain"
import { deployContract, getContract, sendTokenTo, getBigNumber, deployClone } from '../shared'


describe('AaveV2Erc20Adapter', () => {
  const [wallet, wallet1] = waffle.provider.getWallets();
  let implementation: AaveV2Erc20Adapter;
  let adapter: AaveV2Erc20Adapter;
  let token: IERC20;
  let aToken: IERC20;

  before('Deploy implementation', async () => {
    implementation = await deployContract('AaveV2Erc20Adapter', '0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5');
  })

  const testAdapter = (underlying: string, atoken: string, symbol: string) => describe(`a${symbol}`, () => {
    let amountMinted: BigNumber;
    
    before(async () => {
      token = await getContract(underlying, 'IERC20')
      aToken = await getContract(atoken, 'IERC20')
      adapter = await deployClone(implementation, 'AaveV2Erc20Adapter');
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
        expect(await adapter.name()).to.eq(`Aave V2 ${symbol} Adapter`);
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
        expect(await adapter.balanceWrapped()).to.be.gte(amountMinted);
        expect(await adapter.connect(wallet1).balanceWrapped()).to.eq(0);
      })
    })
  
    describe('balanceUnderlying()', () => {
      it('Should return caller balance in aToken (aToken convertible 1:1)', async () => {
        expect(await adapter.balanceUnderlying()).to.be.gte(amountMinted);
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
});