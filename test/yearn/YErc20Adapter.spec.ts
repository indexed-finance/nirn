import { getAddress } from "@ethersproject/address"
import { expect } from "chai"
import { BigNumber, constants } from "ethers"
import { waffle } from "hardhat"
import { YErc20Adapter, IVault, IERC20 } from "../../typechain"
import { advanceBlock, deployContract, getContract, sendTokenTo, getBigNumber, deployClone } from '../shared'



describe('YErc20Adapter', () => {
  const [wallet, wallet1] = waffle.provider.getWallets();
  let implementation: YErc20Adapter;
  let adapter: YErc20Adapter;
  let token: IERC20;
  let yToken: IERC20;

  before('Deploy implementation', async () => {
    implementation = await deployContract('YErc20Adapter');
  })

  const testAdapter = (underlying: string, ytoken: string, symbol: string) => describe(`y${symbol}`, () => {
    let amountDeposited: BigNumber;
    let amountMinted: BigNumber;
    
    before(async () => {
      token = await getContract(underlying, 'IERC20')
      yToken = await getContract(ytoken, 'IERC20')
      adapter = await deployClone(implementation, 'YErc20Adapter');
      await adapter["initialize(address,address,string)"](token.address, yToken.address, 'Yearn');
      await token.approve(adapter.address, constants.MaxUint256);
      await yToken.approve(adapter.address, constants.MaxUint256);
      amountDeposited = await getTokens(10)
    })

    const wrappedToUnderlying = async (amount: BigNumber) => {
      const y: IVault = await getContract(yToken.address, 'IVault');
      const rate = await y.getPricePerFullShare();
      return amount.mul(rate).div(getBigNumber(1));
    }

    const underlyingToWrapped = async (amount: BigNumber, roundUp = false) => {
      const y: IVault = await getContract(yToken.address, 'IVault');
      const rate = await y.getPricePerFullShare();
      let q = amount.mul(getBigNumber(1)).div(rate);
      if (roundUp && !q.mul(rate).eq(amount)) {
        q = q.add(1);
      }
      return q;
    }

    async function getTokens(amount: number) {
      const decimals = await (await getContract(underlying, 'IERC20Metadata')).decimals();
      const tokenAmount = getBigNumber(amount, decimals);
      await sendTokenTo(underlying, wallet.address, tokenAmount);
      return tokenAmount;
    }
  
    describe('settings', () => {
      it('name()', async () => {
        expect(await adapter.name()).to.eq(`Yearn ${symbol} Adapter`);
      })
  
      it('token()', async () => {
        expect(await adapter.token()).to.eq(yToken.address);
      })
  
      it('underlying()', async () => {
        expect(await adapter.underlying()).to.eq(token.address);
      })
    })
  
    describe('deposit()', () => {
      it('Should revert if caller has insufficient balance', async () => {
        await expect(adapter.connect(wallet1).deposit(getBigNumber(1))).to.be.revertedWith('TH:STF')
      })
      it('Should mint yToken and transfer to caller', async () => {
        const tx = adapter.deposit(amountDeposited);
        await tx;
        amountMinted = await underlyingToWrapped(amountDeposited);
        console.log('amountMinted', amountMinted.toString(), 'amountDeposited', amountDeposited.toString(), 'adapter.address', adapter.address, 'wallet.address', wallet.address);

        await expect(tx)
          .to.emit(token, 'Transfer')
          .withArgs(wallet.address, adapter.address, amountDeposited)
          .to.emit(yToken, 'Transfer')
          .withArgs(adapter.address, wallet.address, amountMinted);
        expect(await token.balanceOf(wallet.address)).to.eq(0);
        expect(await yToken.balanceOf(wallet.address)).to.eq(amountMinted);
      })
    })

    describe('balanceWrapped()', () => {
      it('Should return caller balance in yToken', async () => {
        const balanceWrapped = await adapter.balanceWrapped();
        console.log('amountMinted', amountMinted.toString(), 'balanceWrapped', balanceWrapped.toString())
        expect(await adapter.balanceWrapped()).to.be.gte(amountMinted);
        expect(await adapter.connect(wallet1).balanceWrapped()).to.eq(0);
      })
    })
  
    describe('balanceUnderlying()', () => {
      it('Should return caller balance in yToken (yToken convertible 1:1)', async () => {
        const y: IVault = await getContract(yToken.address, 'IVault');
        // accrue interest

        const rate = await y.getPricePerFullShare();
        const underlying = await adapter.balanceUnderlying();
        const balance = await adapter.balanceWrapped();
        const currentTotalSupply = await y.totalSupply();
        const yBalance = await y.balance();
        let pricePerFullShare =  balance.mul(yBalance).div(currentTotalSupply);

        let q = amountMinted.mul(pricePerFullShare).div(getBigNumber(1));
        console.log('balanceUnderlying',underlying.toString(), 'totalSupply', currentTotalSupply,' balance', balance, 'rate', rate.toString(), 'amountDeposited', amountDeposited.toString(), 'amountMinted', amountMinted.toString(), 'q', q.toString());
        console.log( 'amountDeposited', amountDeposited.toString());
  
        expect(underlying).to.be.gte(q);
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
  
      it('Should burn yToken and redeem underlying', async () => {
        console.log( 'amountDeposited', amountDeposited.toString());

        const balance = await yToken.balanceOf(wallet.address);
        const tx = adapter.withdraw(balance)
        await tx;
        const amount = await wrappedToUnderlying(balance);
        await expect(tx)
          .to.emit(yToken, 'Transfer')
          .withArgs(wallet.address, adapter.address, balance)
          .to.emit(token, 'Transfer')
          .withArgs(adapter.address, wallet.address, amount);
        expect(await token.balanceOf(wallet.address)).to.eq(amount);
      })
    })
  
    describe('withdrawAll()', () => {

//        console.log('here 0' , amountDeposited)
        before(async () => {
        amountDeposited = await getTokens(10)
        await adapter.deposit(amountDeposited);
      })
  
      it('Should burn all caller Token and redeem underlying', async () => {

        const yBalance = await yToken.balanceOf(wallet.address);
        const balanceBefore = await token.balanceOf(wallet.address);
 
        // console.log('balanceBefore', balanceBefore.toString());

        await adapter.withdrawAll();

        const amount = await wrappedToUnderlying(yBalance)
        const balanceAfter = await token.balanceOf(wallet.address);
        expect(balanceAfter.sub(balanceBefore)).to.eq(amount);
        expect(await yToken.balanceOf(wallet.address)).to.eq(0);
      })
    })
    
    describe('withdrawUnderlying()', () => {
      before(async () => {
        amountDeposited = await getTokens(10)
        await adapter.deposit(amountDeposited);
        await token.transfer(`0x${'11'.repeat(20)}`, await token.balanceOf(wallet.address))
      })
      it('Should revert if caller has insufficient balance', async () => {
        await expect(adapter.connect(wallet1).withdrawUnderlying(getBigNumber(1))).to.be.revertedWith('TH:STF')
      })
  
      it('Should burn iToken and redeem underlying', async () => {
 
        const y: IVault = await getContract(yToken.address, 'IVault');

        const balanceUnderlying = await adapter.balanceUnderlying();
        const balance = await adapter.balanceWrapped();
        const currentTotalSupply = await y.totalSupply();
        const yBalance = await y.balance();
        let pricePerFullShare =  balance.mul(yBalance).div(currentTotalSupply);

        let q = amountMinted.mul(pricePerFullShare).div(getBigNumber(1));


        console.log('balanceUnderlying', balanceUnderlying.toString(), q.toString())
        const tx = adapter.withdrawUnderlying(q)
        await tx;
        const amount = await underlyingToWrapped(q);
        console.log('amount', amount.toString());
        await expect(tx)
          .to.emit(yToken, 'Transfer')
          .withArgs(wallet.address, adapter.address, amount)
          .to.emit(token, 'Transfer')
          .withArgs(adapter.address, wallet.address, q);
      //  expect(await token.balanceOf(wallet.address)).to.eq(balanceUnderlying);
      })
    })
  });

  
 testAdapter(getAddress('0x6b175474e89094c44da98b954eedeac495271d0f'), getAddress('0xacd43e627e64355f1861cec6d3a6688b31a6f952'), 'DAI');
 //testAdapter(getAddress('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'), getAddress('0x597ad1e0c13bfe8025993d9e79c69e1c0233522e'), 'USDC');
 

  
});