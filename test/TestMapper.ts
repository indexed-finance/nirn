import { TestMapper } from '../typechain'

import { advanceBlock, deployContract, getBigNumber, sendTokenTo } from "./shared"


/**
 * This test file is used to automatically generate tests for all the tokens
 * in each protocol.
 */
describe('Map Protocols', () => {
  let mapper: TestMapper

  before(async () => {
    mapper = await deployContract('TestMapper')
  })

  it('AaveV1', async () => {
    await mapper.aaveV1()
  })

  it('AaveV2', async () => {
    await mapper.aaveV1()
  })

  it('Compound', async () => {
    await mapper.compound()
  })

  it('Cream', async () => {
    await mapper.cream()
  })

  it('Fulcrum', async () => {
    await mapper.fulcrum()
  })

  it('Fuse', async () => {
    await mapper.fuse()
  })

  it('Iron Bank', async () => {
    await mapper.iron()
  })
})