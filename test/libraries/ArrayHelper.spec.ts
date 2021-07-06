import { keccak256 } from "@ethersproject/keccak256";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { TestArrayHelper } from "../../typechain"
import { deployContract } from "../shared";

const toAddress = (n: number) => `0x${n.toString().repeat(40)}`;
const toHash = (n: number) => keccak256(Buffer.from(n.toString()));

describe('DynamicArrays', () => {
  let test: TestArrayHelper;

  before(async () => {
    test = await deployContract('TestArrayHelper');
  })

  it('sum()', async () => {
    expect(await test.sum([11, 22, 33])).to.eq(66);
  })

  describe('mremove(uint256[],index)', () => {
    it('Should remove an element before last', async () => {
      expect(await test["mremove(uint256[],uint256)"](
        [5,4,3,2,1], 3
      )).to.deep.eq([5,4,3,1].map(BigNumber.from))
    })

    it('Should remove last element', async () => {
      expect(await test["mremove(uint256[],uint256)"](
        [5,4,3,2,1], 4
      )).to.deep.eq([5,4,3,2].map(BigNumber.from))
    })
  })

  describe('mremove(address[],index)', () => {
    it('Should remove an element before last', async () => {
      expect(await test["mremove(address[],uint256)"](
        [5,4,3,2,1].map(toAddress), 3
      )).to.deep.eq(
        [5,4,3,1].map(toAddress)
      )
    })

    it('Should remove last element', async () => {
      expect(await test["mremove(address[],uint256)"](
        [5,4,3,2,1].map(toAddress), 4
      )).to.deep.eq(
        [5,4,3,2].map(toAddress)
      )
    })
  })

  describe('mremove(IErc20Adapter[],index)', () => {
    it('Should remove an element before last', async () => {
      expect(await test.mremoveAdapters(
        [5,4,3,2,1].map(toAddress), 3
      )).to.deep.eq(
        [5,4,3,1].map(toAddress)
      )
    })

    it('Should remove last element', async () => {
      expect(await test.mremoveAdapters(
        [5,4,3,2,1].map(toAddress), 4
      )).to.deep.eq(
        [5,4,3,2].map(toAddress)
      )
    })
  })

  describe('remove(bytes32[] storage,index)', () => {
    it('Should remove an element before last', async () => {
      await test.setBytes32Array([5,4,3,2,1].map(toHash))
      await test.removeBytes32(3)
      expect(await test.getBytes32Array())
        .to.deep.eq([5,4,3,1].map(toHash))
    })

    it('Should remove last element', async () => {
      await test.setBytes32Array([5,4,3,2,1].map(toHash))
      await test.removeBytes32(4)
      expect(await test.getBytes32Array())
        .to.deep.eq([5,4,3,2].map(toHash))
    })
  })

  describe('remove(address[] storage,index)', () => {
    it('Should remove an element before last', async () => {
      await test.setAddressArray([5,4,3,2,1].map(toAddress))
      await test.removeAddress(3)
      expect(await test.getAddressArray())
        .to.deep.eq([5,4,3,1].map(toAddress))
    })

    it('Should remove last element', async () => {
      await test.setAddressArray([5,4,3,2,1].map(toAddress))
      await test.removeAddress(4)
      expect(await test.getAddressArray())
        .to.deep.eq([5,4,3,2].map(toAddress))
    })
  })

  describe('indexOf()', () => {
    it('Should revert if element not found', async () => {
      await expect(test.indexOf([5,4,3,2,1].map(toAddress), toAddress(6)))
        .to.be.revertedWith('element not found')
    })

    it('Should return index of element', async () => {
      expect(await test.indexOf([5,4,3,2,1].map(toAddress), toAddress(3)))
        .to.eq(2)
    })
  })

  describe('sortByDescendingScore()', () => {
    it('Should sort the array of scores in descending order while maintaining relationship between adapters and scores', async () => {
      const {
        '0': addresses,
        '1': scores
      } = await test.sortByDescendingScore(
        [5,2,4,1].map(toAddress),
        [5,2,4,1]
      )
      expect(addresses).to.deep.eq([5,4,2,1].map(toAddress))
      expect(scores).to.deep.eq([5,4,2,1].map(BigNumber.from))
    })
  })

  describe('toArray()', () => {
    it('Should convert a set to an array', async () => {
      await test.setAddressSet([5,4,3,2,1].map(toAddress));
      expect(await test.toArray()).to.deep.eq([5,4,3,2,1].map(toAddress))
    })
  })
})