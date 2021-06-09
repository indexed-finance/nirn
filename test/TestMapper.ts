import { TestMapper } from '../typechain'

import { deployContract } from "./shared"


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

  // it('Fulcrumm', async () => {
  //   await mapper.fulcrum()
  // })

  it('Yearn', async () => {
    await mapper.yearn()
  })
})