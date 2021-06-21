import { TestMapper } from '../typechain'

import { advanceBlock, deployContract, getBigNumber, sendTokenTo } from "./shared"


/**
 * This test file is used to automatically generate tests for all the tokens
 * in each protocols.
 */
describe('Map Protocols', () => {
  let mapper: TestMapper

  before(async () => {
    mapper = await deployContract('TestMapper')
  })

  // it('AaveV1', async () => {
  //   await mapper.aaveV1()
  // })

  // it('AaveV2', async () => {
  //   await mapper.aaveV1()
  // })

  // it('Compound', async () => {
  //   await mapper.compound()
  // })

/*   it('Cream', async () => {
    await mapper.cream()
  }) */

  // it('Fulcrumm', async () => {
  //   await mapper.fulcrum()
  // })

  // it('Fuse', async () => {
  //   await mapper.fuse()
  // })

  // it('Yearn', async () => {
    // await mapper.yearn()
  // })

  // it('Aave V2', async () => {
  //   const test = await deployContract('TestAaveV2');
  //   await test.testRewardValue()
  // })

  // it('Compound', async () => {
  //   const test = await deployContract('TestCompound');
  //   await advanceBlock()
  //   await test.testExchangeRate()
  // })

  // it('Cream', async () => {
  //   const test = await deployContract('TestCompound');
  //   await advanceBlock()
  //   await sendTokenTo('0xaaaebe6fe48e54f431b0c390cfaf0b017d09d42d', test.address, getBigNumber(1, 4))
  //   await test.testExchangeRateCream()
  // })

  // it('Iron Bank', async () => {
  //     const test = await deployContract('TestCompound');
  //     await advanceBlock()
  //     await sendTokenTo('0x6B175474E89094C44Da98b954EedeAC495271d0F', test.address, getBigNumber(1, 18))
  //     await test.testExchangeRateIronBank()
  // })

  // it('Iron Bank', async () => {
  //   await mapper.iron()
  // })
})