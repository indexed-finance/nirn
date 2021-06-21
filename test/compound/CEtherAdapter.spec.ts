import { getAddress } from "@ethersproject/address"
import { expect } from "chai"
import { BigNumber, constants } from "ethers"
import { ethers, waffle } from "hardhat"
import { CEtherAdapter, ICToken, IERC20 } from "../../typechain"
import { deployContract, getContract, sendTokenTo, getBigNumber, deployClone } from '../shared'


describe('CEtherAdapter', () => {
  const [wallet, wallet1] = waffle.provider.getWallets();
  let implementation: CEtherAdapter;
  let adapter: CEtherAdapter;
  let token: IERC20;
  let cToken: IERC20;
  let amountDeposited: BigNumber;
  let amountMinted: BigNumber;

  before('Deploy implementation', async () => {
    implementation = await deployContract('CEtherAdapter');
  })

  before(async () => {
    token = await getContract('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 'IERC20')
    cToken = await getContract('0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5', 'IERC20')
    adapter = await deployClone(implementation, 'CEtherAdapter');
    await adapter.initialize(token.address, cToken.address);
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
    const decimals = await (await getContract('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', 'IERC20Metadata')).decimals();
    const tokenAmount = getBigNumber(amount, decimals);
    await sendTokenTo('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', wallet.address, tokenAmount);
    return tokenAmount;
  }

  describe('settings', () => {
    it('name()', async () => {
      expect(await adapter.name()).to.eq(`Compound ETH Adapter`);
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

  describe('withdrawUnderlying()', () => {
    before(async () => {
      await adapter.deposit(amountDeposited);
      await token.transfer(`0x${'11'.repeat(20)}`, await token.balanceOf(wallet.address))
    })

    it('Should revert if caller has insufficient balance', async () => {
      await expect(adapter.connect(wallet1).withdrawUnderlying(getBigNumber(1))).to.be.revertedWith('TH:STF')
    })

    it('Should burn iToken and redeem underlying', async () => {
      const balanceUnderlying = await adapter.balanceUnderlying();
      const tx = adapter.withdrawUnderlying(balanceUnderlying)
      await tx;
      const amount = await underlyingToWrapped(balanceUnderlying);
      await expect(tx)
        .to.emit(cToken, 'Transfer')
        .withArgs(wallet.address, adapter.address, amount)
        .to.emit(token, 'Transfer')
        .withArgs(adapter.address, wallet.address, balanceUnderlying);
      expect(await token.balanceOf(wallet.address)).to.eq(balanceUnderlying);
    })
  })

  describe('withdrawUnderlyingAsETH()', () => {
    before(async () => {
      await adapter.deposit(amountDeposited);
    })

    it('Should revert if caller has insufficient balance', async () => {
      await expect(adapter.connect(wallet1).withdrawUnderlyingAsETH(getBigNumber(1))).to.be.revertedWith('TH:STF')
    })

    it('Should burn iToken and redeem underlying', async () => {
      const balanceUnderlying = await adapter.balanceUnderlying();
      const balanceBefore = await ethers.provider.getBalance(wallet.address);
      const tx = adapter.withdrawUnderlyingAsETH(balanceUnderlying)
      await tx;
      const amount = await underlyingToWrapped(balanceUnderlying);
      await expect(tx)
        .to.emit(cToken, 'Transfer')
        .withArgs(wallet.address, adapter.address, amount)
      const balanceAfter = await ethers.provider.getBalance(wallet.address);
      expect(balanceAfter.sub(balanceBefore)).to.eq(balanceUnderlying)
    })
  })

  describe('depositETH()', () => {
    it('Should mint aToken and transfer to caller', async () => {
      const tx = adapter.depositETH({ value: amountDeposited })
      await tx
      amountMinted = await underlyingToWrapped(amountDeposited);
      await expect(tx)
        .to.emit(cToken, 'Transfer')
        .withArgs(adapter.address, wallet.address, amountMinted)
      expect(await cToken.balanceOf(wallet.address)).to.eq(amountMinted)
    })
  })

  describe('withdrawAsETH()', () => {
    it('Should mint aToken and transfer to caller', async () => {
      const c: ICToken = await getContract(cToken.address, 'ICToken');
      await c.exchangeRateCurrent();
      const amountReceived = await wrappedToUnderlying(amountMinted)
      const balanceBefore = await ethers.provider.getBalance(wallet.address)
      const tx = adapter.withdrawAsETH(amountMinted)
      await tx;
      await expect(tx)
        .to.emit(cToken, 'Transfer')
        .withArgs(wallet.address, adapter.address, amountMinted)
      const balanceAfter = await ethers.provider.getBalance(wallet.address)
      expect(balanceAfter.sub(balanceBefore)).to.be.gte(amountReceived)
    })
  })
});