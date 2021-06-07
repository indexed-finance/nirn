import { getAddress } from "@ethersproject/address"
import { expect } from "chai"
import { BigNumber, constants } from "ethers"
import { waffle } from "hardhat"
import { CErc20Adapter, ICToken, IERC20 } from "../../typechain"
import { advanceBlock, deployContract, getContract, sendTokenTo, getBigNumber, deployClone } from '../shared'


describe('CErc20Adapter', () => {
  const [wallet, wallet1] = waffle.provider.getWallets();
  let implementation: CErc20Adapter;
  let adapter: CErc20Adapter;
  let token: IERC20;
  let cToken: IERC20;

  before('Deploy implementation', async () => {
    implementation = await deployContract('CErc20Adapter');
  })

  const testAdapter = (underlying: string, ctoken: string, symbol: string) => describe(`a${symbol}`, () => {
    let amountDeposited: BigNumber;
    let amountMinted: BigNumber;
    
    before(async () => {
      token = await getContract(underlying, 'IERC20')
      cToken = await getContract(ctoken, 'IERC20')
      adapter = await deployClone(implementation, 'CErc20Adapter');
      await adapter["initialize(address,address,string)"](token.address, cToken.address, 'Compound');
      await token.approve(adapter.address, constants.MaxUint256);
      await cToken.approve(adapter.address, constants.MaxUint256);
      amountDeposited = await getTokens(10)
    })

    const wrappedToUnderlying = async (amount: BigNumber) => {
      const c: ICToken = await getContract(cToken.address, 'ICToken');
      const rate = await c.exchangeRateStored();
      return amount.mul(rate).div(getBigNumber(1));
    }

    const underlyingToWrapped = async (amount: BigNumber) => {
      const c: ICToken = await getContract(cToken.address, 'ICToken');
      const rate = await c.exchangeRateStored();
      return amount.mul(getBigNumber(1)).div(rate);
    }

    async function getTokens(amount: number) {
      const decimals = await (await getContract(underlying, 'IERC20Metadata')).decimals();
      const tokenAmount = getBigNumber(amount, decimals);
      await sendTokenTo(underlying, wallet.address, tokenAmount);
      return tokenAmount;
    }
  
    describe('settings', () => {
      it('name()', async () => {
        expect(await adapter.name()).to.eq(`Compound ${symbol} Adapter`);
      })
  
      it('token()', async () => {
        expect(await adapter.token()).to.eq(cToken.address);
      })
  
      it('underlying()', async () => {
        expect(await adapter.underlying()).to.eq(token.address);
      })
    })
  
    describe('deposit()', () => {
      it('Should revert if caller has insufficient balance', async () => {
        await expect(adapter.connect(wallet1).deposit(getBigNumber(1))).to.be.revertedWith('TH:STF')
      })
  
      it('Should mint cToken and transfer to caller', async () => {
        const tx = adapter.deposit(amountDeposited);
        await tx;
        amountMinted = await underlyingToWrapped(amountDeposited);
        await expect(tx)
          .to.emit(token, 'Transfer')
          .withArgs(wallet.address, adapter.address, amountDeposited)
          .to.emit(cToken, 'Transfer')
          .withArgs(adapter.address, wallet.address, amountMinted);
        expect(await token.balanceOf(wallet.address)).to.eq(0);
        expect(await cToken.balanceOf(wallet.address)).to.eq(amountMinted);
      })
    })

    describe('balanceWrapped()', () => {
      it('Should return caller balance in cToken', async () => {
        expect(await adapter.balanceWrapped()).to.be.gte(amountMinted);
        expect(await adapter.connect(wallet1).balanceWrapped()).to.eq(0);
      })
    })
  
    describe('balanceUnderlying()', () => {
      it('Should return caller balance in cToken (cToken convertible 1:1)', async () => {
        const c: ICToken = await getContract(cToken.address, 'ICToken');
        // accrue interest
        await c.exchangeRateCurrent();
        expect(await adapter.balanceUnderlying()).to.be.gte(amountDeposited);
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
  
      it('Should burn cToken and redeem underlying', async () => {
        const balance = await cToken.balanceOf(wallet.address);
        const tx = adapter.withdraw(balance)
        await tx;
        const amount = await wrappedToUnderlying(balance);
        await expect(tx)
          .to.emit(cToken, 'Transfer')
          .withArgs(wallet.address, adapter.address, balance)
          .to.emit(token, 'Transfer')
          .withArgs(adapter.address, wallet.address, amount);
        expect(await token.balanceOf(wallet.address)).to.eq(amount);
      })
    })
  
    describe('withdrawAll()', () => {
      before(async () => {
        await adapter.deposit(amountDeposited);
      })
  
      it('Should burn all caller cToken and redeem underlying', async () => {
        const cBalance = await cToken.balanceOf(wallet.address);
        const balanceBefore = await token.balanceOf(wallet.address);
        await adapter.withdrawAll();
        const amount = await wrappedToUnderlying(cBalance)
        const balanceAfter = await token.balanceOf(wallet.address);
        expect(balanceAfter.sub(balanceBefore)).to.eq(amount);
        expect(await cToken.balanceOf(wallet.address)).to.eq(0);
      })
    })
  });

  // Paused
  // testAdapter(getAddress('0x1985365e9f78359a9b6ad760e32412f4a445e862'), getAddress('0x158079ee67fce2f58472a96584a73c7ab9ac95c1'), 'REP');
  // testAdapter(getAddress('0x2260fac5e5542a773aa44fbcfedf7c193bc2c599'), getAddress('0xc11b1268c1a384e55c48c2391d8d480264a3a7f4'), 'WBTC');
  // testAdapter(getAddress('0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359'), getAddress('0xf5dce57282a584d2746faf1593d3121fcac444dc'), 'DAI');

  // Internal supply rate
  // testAdapter(getAddress('0x0d8775f648430679a709e98d2b0cb6250d2887ef'), getAddress('0x6c8c6b02e7b2be14d4fa6022dfd6d75921d90e4e'), 'BAT');
  // testAdapter(getAddress('0xe41d2489571d322189246dafa5ebde1f4699f498'), getAddress('0xb3319f5d18bc0d84dd1b4825dcde5d5f7266d407'), 'ZRX');

  testAdapter(getAddress('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'), getAddress('0x39aa39c021dfbae8fac545936693ac917d5e7563'), 'USDC');
  testAdapter(getAddress('0xdac17f958d2ee523a2206206994597c13d831ec7'), getAddress('0xf650c3d88d12db855b8bf7d11be6c55a4e07dcc9'), 'USDT');
  // testAdapter(getAddress('0x6b175474e89094c44da98b954eedeac495271d0f'), getAddress('0x5d3a536e4d6dbd6114cc1ead35777bab948e3643'), 'DAI');
  // testAdapter(getAddress('0x1f9840a85d5af5bf1d1762f925bdaddc4201f984'), getAddress('0x35a18000230da775cac24873d00ff85bccded550'), 'UNI');
  // testAdapter(getAddress('0xc00e94cb662c3520282e6f5717214004a7f26888'), getAddress('0x70e36f6bf80a52b3b46b3af8e106cc0ed743e8e4'), 'COMP');
  // testAdapter(getAddress('0x2260fac5e5542a773aa44fbcfedf7c193bc2c599'), getAddress('0xccf4429db6322d5c611ee964527d42e5d685dd6a'), 'WBTC');
  // testAdapter(getAddress('0x0000000000085d4780b73119b644ae5ecd22b376'), getAddress('0x12392f67bdf24fae0af363c24ac620a2f67dad86'), 'TUSD');
  // testAdapter(getAddress('0x514910771af9ca656af840dff83e8264ecf986ca'), getAddress('0xface851a4921ce59e912d19329929ce6da6eb0c7'), 'LINK');
});