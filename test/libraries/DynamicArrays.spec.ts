import { expect } from "chai";
import { constants } from "ethers";
import { TestDynamicArrays } from "../../typechain"
import { deployContract } from "../shared";

describe('DynamicArrays', () => {
  let test: TestDynamicArrays;

  before(async () => {
    test = await deployContract('TestDynamicArrays');
  })

  describe('dynamicPush(address)', () => {
    it('With no elements, array length is 0', async () => {
      expect(await test.buildDynamicAddressArray(10, [])).to.deep.eq([]);
    })

    it('Pushes one element, gives array with length 1', async () => {
      expect(
        await test.buildDynamicAddressArray(10, [constants.AddressZero])
      ).to.deep.eq([constants.AddressZero]);
    })

    it('Pushes two elements, gives array with length 2', async () => {
      expect(
        await test.buildDynamicAddressArray(10, [constants.AddressZero, constants.AddressZero])
      ).to.deep.eq([constants.AddressZero, constants.AddressZero]);
    })

    it('Pushing past max size overflows memory', async () => {
      await test.testOverflowAddressArray();
    })
  })

  describe('dynamicPush(uint256)', () => {
    it('With no elements, array length is 0', async () => {
      expect(await test.buildDynamicUint256Array(10, [])).to.deep.eq([]);
    })

    it('Pushes one element, gives array with length 1', async () => {
      expect(
        await test.buildDynamicUint256Array(10, [constants.Zero])
      ).to.deep.eq([constants.Zero]);
    })

    it('Pushes two elements, gives array with length 2', async () => {
      expect(
        await test.buildDynamicUint256Array(10, [constants.Zero, constants.Zero])
      ).to.deep.eq([constants.Zero, constants.Zero]);
    })

    it('Pushing past max size overflows memory', async () => {
      await test.testOverflowUint256Array();
    })
  })
})