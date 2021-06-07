import { getAddress } from '@ethersproject/address'
import { expect } from 'chai'
import { BigNumber, constants } from 'ethers'
import { ethers, waffle } from 'hardhat'
import { AaveV2EtherAdapter, IERC20 } from '../../typechain'
import { deployContract, getContract, sendTokenTo, getBigNumber, deployClone } from '../shared'

describe('AaveV2EtherAdapter', () => {
  const [wallet, wallet1] = waffle.provider.getWallets()
  let implementation: AaveV2EtherAdapter
  let adapter: AaveV2EtherAdapter
  let token: IERC20
  let aToken: IERC20
  let amountMinted: BigNumber

  before('Deploy implementation', async () => {
    implementation = await deployContract('AaveV2EtherAdapter', '0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5')
    token = await getContract('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 'IERC20')
    aToken = await getContract('0x030ba81f1c18d280636f32af80b9aad02cf0854e', 'IERC20')
    adapter = await deployClone(implementation, 'AaveV2EtherAdapter');
    await adapter.initialize(token.address, aToken.address)
    await token.approve(adapter.address, constants.MaxUint256)
    await aToken.approve(adapter.address, constants.MaxUint256)
    amountMinted = await getTokens(10)
  })

  async function getTokens(amount: number) {
    const tokenAmount = getBigNumber(amount)
    await sendTokenTo('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', wallet.address, tokenAmount)
    return tokenAmount
  }

  describe('settings', () => {
    it('name()', async () => {
      expect(await adapter.name()).to.eq(`Aave V2 ETH Adapter`)
    })

    it('token()', async () => {
      expect(await adapter.token()).to.eq(aToken.address)
    })

    it('underlying()', async () => {
      expect(await adapter.underlying()).to.eq(token.address)
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
        .withArgs(adapter.address, wallet.address, amountMinted)
      expect(await token.balanceOf(wallet.address)).to.eq(0)
      expect(await aToken.balanceOf(wallet.address)).to.eq(amountMinted)
    })
  })

  describe('balanceWrapped()', () => {
    it('Should return caller balance in aToken', async () => {
      expect(await adapter.balanceWrapped()).to.eq(amountMinted)
      expect(await adapter.connect(wallet1).balanceWrapped()).to.eq(0)
    })
  })

  describe('balanceUnderlying()', () => {
    it('Should return caller balance in aToken (aToken convertible 1:1)', async () => {
      expect(await adapter.balanceUnderlying()).to.eq(amountMinted)
      expect(await adapter.connect(wallet1).balanceUnderlying()).to.eq(0)
    })
  })

  describe('getHypotheticalAPR()', () => {
    it('Positive should decrease APR', async () => {
      const apr = await adapter.getAPR()
      expect(await adapter.getHypotheticalAPR(getBigNumber(1))).to.be.lt(apr)
    })

    it('Negative should increase APR', async () => {
      const apr = await adapter.getAPR()
      expect(await adapter.getHypotheticalAPR(getBigNumber(1).mul(-1))).to.be.gt(apr)
    })
  })

  describe('withdraw()', () => {
    it('Should revert if caller has insufficient balance', async () => {
      await expect(adapter.connect(wallet1).withdraw(getBigNumber(1))).to.be.revertedWith('TH:STF')
    })

    it('Should burn aToken and redeem underlying', async () => {
      const balance = await aToken.balanceOf(wallet.address)
      await expect(adapter.withdraw(balance))
        .to.emit(aToken, 'Transfer')
        .withArgs(wallet.address, adapter.address, balance)
        .to.emit(token, 'Transfer')
        .withArgs(adapter.address, wallet.address, balance)
      expect(await token.balanceOf(wallet.address)).to.eq(balance)
    })
  })

  describe('withdrawAll()', () => {
    before(async () => {
      amountMinted = await getTokens(10)
      await adapter.deposit(amountMinted)
    })

    it('Should burn all caller aToken and redeem underlying', async () => {
      const balance = await aToken.balanceOf(wallet.address)
      await adapter.withdrawAll()
      expect(await token.balanceOf(wallet.address)).to.be.gte(balance)
      expect(await aToken.balanceOf(wallet.address)).to.eq(0)
    })
  })

  describe('depositETH()', () => {
    it('Should mint aToken and transfer to caller', async () => {
      await expect(adapter.depositETH({ value: amountMinted }))
        .to.emit(aToken, 'Transfer')
        .withArgs(adapter.address, wallet.address, amountMinted)
      expect(await aToken.balanceOf(wallet.address)).to.eq(amountMinted)
    })
  })

  describe('withdrawAsETH()', () => {
    it('Should mint aToken and transfer to caller', async () => {
      const balanceBefore = await ethers.provider.getBalance(wallet.address)
      await expect(adapter.withdrawAsETH(amountMinted))
        .to.emit(aToken, 'Transfer')
        .withArgs(adapter.address, wallet.address, amountMinted)
      const balanceAfter = await ethers.provider.getBalance(wallet.address)
      expect(balanceAfter.sub(balanceBefore)).to.eq(amountMinted)
    })
  })
})
