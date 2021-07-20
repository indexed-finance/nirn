import { expect } from "chai";
import { BigNumber, constants } from "ethers";
import { waffle } from "hardhat";
import { TestAdapter, TestAdapterHelper, TestERC20, TestVault } from "../../typechain"
import { deployContract, getBigNumber, packAdapterAndWeight, sendTokenToFrom } from "../shared";
import { deployTestERC20, deployTestWrapperAndAdapter } from "../shared/fixtures";

const padZero = (hex: string, bits: number) => hex.padStart(bits/4, '0');

describe('AdapterHelper', () => {
  const [wallet] = waffle.provider.getWallets()

  let underlying: TestERC20
  let adapter1: TestAdapter
  let adapter2: TestAdapter
  let wrapper1: TestVault
  let wrapper2: TestVault
  let test: TestAdapterHelper;

  const setupTests = async (withTransfer?: boolean) => {
      underlying = await deployTestERC20(undefined, undefined, getBigNumber(2));
      ({ adapter: adapter1, wrapper: wrapper1 } = await deployTestWrapperAndAdapter(underlying.address, getBigNumber(1, 17)));
      ({ adapter: adapter2, wrapper: wrapper2 } = await deployTestWrapperAndAdapter(underlying.address, getBigNumber(5, 16)));
      await underlying.approve(adapter1.address, getBigNumber(1))
      await underlying.approve(adapter2.address, getBigNumber(1))
      await adapter1.deposit(getBigNumber(1))
      await adapter2.deposit(getBigNumber(1))
      test = await deployContract('TestAdapterHelper');
      await test.approve(adapter1.address)
      await test.approve(adapter2.address)
      if (withTransfer) {
        await wrapper1.transfer(test.address, await wrapper1.balanceOf(wallet.address))
        await wrapper2.transfer(test.address, await wrapper2.balanceOf(wallet.address))
      }
  }

  before(async () => {
    await setupTests();
  })

  describe('packAdapterAndWeight()', () => {
    it('Returns tightly packed (address,uint96)', async () => {
      expect(await test.packAdapterAndWeight(adapter1.address, getBigNumber(1)))
      .to.eq(packAdapterAndWeight(adapter1.address, getBigNumber(1)))
    })
  })

  describe('packAdaptersAndWeights()', () => {
    it('Returns tightly packed (address,uint96)[]', async () => {
      expect(await test.packAdaptersAndWeights([adapter1.address], [getBigNumber(1)]))
      .to.deep.eq(
        [packAdapterAndWeight(adapter1.address, getBigNumber(1))]
      )
    })
  })

  describe('unpackAdapterAndWeight()', () => {
    it('Decodes tightly packed (address,uint96)', async () => {
      const { adapter, weight } = await test.unpackAdapterAndWeight(
        packAdapterAndWeight(adapter1.address, getBigNumber(1))
      );
      expect(adapter).to.eq(adapter1.address);
      expect(weight).to.eq(getBigNumber(1));
    })
  })

  describe('unpackAdaptersAndWeights()', () => {
    it('Decodes tightly packed (address,uint96)[]', async () => {
      const { adapters, weights } = await test.unpackAdaptersAndWeights([
        adapter1.address
        .concat(padZero(getBigNumber(1).toHexString().slice(2), 96))
        .toLowerCase()
      ]);
      expect(adapters).to.deep.eq([adapter1.address]);
      expect(weights).to.deep.eq([getBigNumber(1)]);
    })
  })

  describe('getNetAPR()', () => {
    it('Returns weighted APR for adapter with 100% weight', async () => {
      expect(await test.getNetAPR(
        [adapter1.address],
        [getBigNumber(1)],
        [0],
      )).to.eq(getBigNumber(1, 17))
    })

    it('Returns weighted APR for adapters with 50% weight each', async () => {
      expect(await test.getNetAPR(
        [adapter1.address, adapter2.address],
        [getBigNumber(5, 17), getBigNumber(5, 17)],
        [0, 0],
      )).to.eq(getBigNumber(1, 17).div(2).add(getBigNumber(5,16).div(2)))
    })

    it('Accounts for liquidity deltas', async () => {
      expect(await test.getNetAPR(
        [adapter1.address, adapter2.address],
        [getBigNumber(5, 17), getBigNumber(5, 17)],
        [getBigNumber(1), getBigNumber(1)],
      )).to.eq(getBigNumber(1, 17).div(4).add(getBigNumber(5,16).div(4)))
    })
  })

  describe('getBalances()', () => {
    it('Returns array of balanceUnderlying results', async () => {
      expect(await test.getBalances([adapter1.address, adapter2.address]))
        .to.deep.eq([BigNumber.from(0), BigNumber.from(0)])
      await wrapper1.transfer(test.address, await wrapper1.balanceOf(wallet.address))
      await wrapper2.transfer(test.address, await wrapper2.balanceOf(wallet.address))
      expect(await test.getBalances([adapter1.address, adapter2.address]))
        .to.deep.eq([
          getBigNumber(1),
          getBigNumber(1)
        ])
    })
  })

  describe('getExcludedAdapterIndices()', () => {
    it('Should return nothing when arrays are the same', async () => {
      expect(await test.getExcludedAdapterIndices([adapter1.address, adapter2.address], [adapter1.address, adapter2.address]))
      .to.deep.eq([])
    })

    it('Should return indices of adapters in array 1 which are not in array 2', async () => {
      expect(await test.getExcludedAdapterIndices([adapter1.address, adapter2.address], []))
      .to.deep.eq([BigNumber.from(0), BigNumber.from(1)])
    })
  })
  
  describe('rebalance()', () => {
    beforeEach(async () => {
      await setupTests(true);
    })

    it('Should execute all withdrawals before deposits', async () => {
      await expect(
        test.rebalance(
          [adapter1.address, adapter2.address],
          [getBigNumber(5, 17), getBigNumber(5, 17)],
          [getBigNumber(1).mul(-1), getBigNumber(1)],
          0
        )
      )
        .to.emit(underlying, 'Transfer')
        .withArgs(adapter1.address, test.address, getBigNumber(1))
        .to.emit(underlying, 'Transfer')
        .withArgs(test.address, adapter2.address, getBigNumber(1))
    })

    describe('Should only deposit up to the total amount withdrawn + reserves', () => {
      it('With reserves = 0', async () => {
        await adapter1.setAvailableLiquidity(getBigNumber(5, 17))
        await expect(
          test.rebalance(
            [adapter1.address, adapter2.address],
            [getBigNumber(5, 17), getBigNumber(5, 17)],
            [getBigNumber(1).mul(-1), getBigNumber(1)],
            0
          )
        )
          .to.emit(underlying, 'Transfer')
          .withArgs(adapter1.address, test.address, getBigNumber(5, 17))
          .to.emit(underlying, 'Transfer')
          .withArgs(test.address, adapter2.address, getBigNumber(5, 17))
      })

      it('With withdrawals = 0', async () => {
        await adapter1.setAvailableLiquidity(0)
        await underlying.mint(test.address, getBigNumber(1))
        await expect(
          test.rebalance(
            [adapter1.address, adapter2.address],
            [getBigNumber(5, 17), getBigNumber(5, 17)],
            [getBigNumber(1).mul(-1), getBigNumber(1)],
            getBigNumber(1)
          )
        )
          .to.emit(underlying, 'Transfer')
          .withArgs(test.address, adapter2.address, getBigNumber(1))
      })
    })

    it('Should stop depositing when funds run out', async () => {
      // Stop at adapter2, don't throw on null address
      await expect(
        test.rebalance(
          [adapter1.address, adapter2.address, constants.AddressZero],
          [getBigNumber(5, 17), getBigNumber(5, 17), getBigNumber(1)],
          [getBigNumber(1).mul(-1), getBigNumber(1), getBigNumber(1)],
          0
        )
      ).to.not.be.reverted;
    })
  })
})