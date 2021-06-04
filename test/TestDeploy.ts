import { getContractAddress } from "@ethersproject/address"
import { formatEther, parseEther } from "@ethersproject/units"
import { BigNumber, constants } from "ethers"
import { ethers, waffle } from "hardhat"
import {
  AdapterRegistry,
  AaveV1ProtocolAdapter,
  AaveV2ProtocolAdapter,
  CompoundProtocolAdapter,
  CreamProtocolAdapter,
  CTokenAdapterFactory,
  DyDxProtocolAdapter,
  FulcrumProtocolAdapter,
  FuseProtocolAdapter,
  IFusePoolDirectory,
  FusePoolAdapter,
  IErc20Adapter
} from "../typechain"
import { deployContract, deploy, impersonate, sendEtherTo, getContract } from "./utils"


describe('Deploy All', () => {
  const [wallet] = waffle.provider.getWallets()
  let registry: AdapterRegistry
  let aaveV1: AaveV1ProtocolAdapter
  let aaveV2: AaveV2ProtocolAdapter
  let compound: CompoundProtocolAdapter
  let cream: CreamProtocolAdapter
  let cTokenFactory: CTokenAdapterFactory
  let dydx: DyDxProtocolAdapter
  let fulcrum: FulcrumProtocolAdapter
  let fuse: FuseProtocolAdapter

  let gasTotal: number

  before(async () => {
    console.log('a')
    await sendEtherTo(wallet.address);
    console.log('a')

    registry = await deployContract('AdapterRegistry')
    aaveV1 = await deployContract('AaveV1ProtocolAdapter', registry.address)
    aaveV2 = await deployContract('AaveV2ProtocolAdapter', registry.address)
    cTokenFactory = await deployContract('CTokenAdapterFactory')
    compound = await deployContract('CompoundProtocolAdapter', registry.address, cTokenFactory.address)
    cream = await deployContract('CreamProtocolAdapter', registry.address, cTokenFactory.address)
    fuse = await deployContract('FuseProtocolAdapter', registry.address, cTokenFactory.address)
    await fuse.deployTransaction.wait()
    const nonce = await wallet.getTransactionCount()
    const nextAddress = getContractAddress({ from: wallet.address, nonce: nonce + 1 })
    const nextAddress2 = getContractAddress({ from: wallet.address, nonce: nonce + 3 })
    const atx0 = await registry.addProtocolAdapter(nextAddress)
    dydx = await deployContract('DyDxProtocolAdapter', registry.address)
    const atx1 = await registry.addProtocolAdapter(nextAddress2)
    fulcrum = await deployContract('FulcrumProtocolAdapter', registry.address)

    const deployTxs = [
      registry,
      aaveV1,
      aaveV2,
      cTokenFactory,
      compound,
      cream,
      fuse,
      dydx,
      fulcrum,
    ].map(c => c.deployTransaction.hash);

    const addTxs = [
      atx0,
      atx1,
      await registry.addProtocolAdapter(aaveV1.address),
      await registry.addProtocolAdapter(aaveV2.address),
      await registry.addProtocolAdapter(compound.address),
      await registry.addProtocolAdapter(cream.address),
      await registry.addProtocolAdapter(fuse.address),
    ].map(tx => tx.hash);

    gasTotal = (await Promise.all(
      [
        ...deployTxs,
        ...addTxs
      ].map(tx => ethers.provider.getTransactionReceipt(tx).then(r => r.gasUsed.toNumber()))
    )).reduce((prev, next) => prev + next, 0)
    console.log(`Contracts cost a total of ${gasTotal} to deploy`);
  })

  it('Aave V1', async () => {
    const numTokens = (await aaveV1.getUnmapped()).length;
    const tx = await aaveV1.mapTokens(numTokens)
    const gasUsed = (await tx.wait()).gasUsed.toNumber()
    gasTotal += gasUsed
    console.log(`AAVE V1: Mapped ${numTokens} | Avg Cost:`, Math.floor(gasUsed / numTokens))
  })

  it('Aave V2', async () => {
    const numTokens = (await aaveV2.getUnmapped()).length;
    const tx = await aaveV2.mapTokens(numTokens)
    const gasUsed = (await tx.wait()).gasUsed.toNumber()
    gasTotal += gasUsed
    console.log(`AAVE V2: Mapped ${numTokens} | Avg Cost:`, Math.floor(gasUsed / numTokens))
  })

  it('Compound', async () => {
    const numTokens = (await compound.getUnmapped()).length;
    const tx = await compound.mapTokens(numTokens)
    const gasUsed = (await tx.wait()).gasUsed.toNumber()
    gasTotal += gasUsed
    console.log(`COMPOUND: Mapped ${numTokens} | Avg Cost:`, Math.floor(gasUsed / numTokens))
  })

  it('Cream', async () => {
    const numTokens = (await cream.getUnmapped()).length;
    const n0 = Math.floor(numTokens / 2)
    const tx0 = await cream.mapTokens(n0)
    const tx1 = await cream.mapTokens(numTokens - n0)
    const cost0 = (await tx0.wait()).gasUsed.toNumber()
    const cost1 = (await tx1.wait()).gasUsed.toNumber()
    const gasUsed = cost0 + cost1
    gasTotal += gasUsed
    console.log(`CREAM: Mapped ${numTokens} | Avg Cost:`, Math.floor(gasUsed / numTokens))
  })

  it('DyDx', async () => {
    const tx = await dydx.mapTokens(3)
    const gasUsed = (await tx.wait()).gasUsed.toNumber()
    gasTotal += gasUsed
    console.log('DYDX', (gasUsed / 3))
  })

  it('Fulcrum', async () => {
    const numTokens = (await fulcrum.getUnmapped()).length;
    const tx = await fulcrum.mapTokens(numTokens)
    const gasUsed = (await tx.wait()).gasUsed.toNumber()
    gasTotal += gasUsed
    console.log(`FULCRUM: Mapped ${numTokens} | Avg Cost:`, (gasUsed / numTokens))
  })

  let fuseStartId: number;

  it('Fuse: Map Pools', async () => {
    fuseStartId = await registry.getProtocolCount().then(c => c.toNumber())
    const numPools = (await fuse.getUnmapped()).length;
    const tx = await fuse.map(numPools)
    const gasUsed = (await tx.wait()).gasUsed.toNumber()
    gasTotal += gasUsed
    console.log(`FUSE POOLS: Mapped ${numPools} | Avg Cost:`, (gasUsed / numPools))
  })

  it('Fuse Pools: Map Tokens', async () => {
    const directory: IFusePoolDirectory = await getContract('0x835482FE0532f169024d5E9410199369aAD5C77E', 'IFusePoolDirectory')
    const allPools = await directory.getAllPools()
    const txs: Record<string, [string, number]> = {}

    for (let i = 0; i < allPools.length; i++) {
      const id = fuseStartId + i;
      const { protocolAdapter, name } = await registry.getProtocolMetadata(id);
      const fusePool: FusePoolAdapter = await getContract(protocolAdapter, 'FusePoolAdapter')
      const numPools = (await fusePool.getUnmapped()).length;
      const tx = await fusePool.map(numPools)
      txs[tx.hash] = [name, numPools]
    }
    const receipts = await Promise.all(Object.keys(txs).map(tx => ethers.provider.getTransactionReceipt(tx)));
    for (const receipt of receipts) {
      const [name, numPools] = txs[receipt.transactionHash]
      const gasUsed = receipt.gasUsed.toNumber()
      gasTotal += gasUsed
      console.log(`${name}: Mapped ${numPools} | Avg Cost:`, (gasUsed / numPools))
    }
  })

  let mostSupportedToken: string;

  it('Summary', async () => {
    console.log(`Full setup cost ${gasTotal} gas including deployment and protocol mapping`);
    const tokens = await registry.getSupportedTokens()
    const wrappers = await Promise.all(tokens.map(t => registry.getAdaptersList(t)));
    const wrapperCounts = wrappers.map(w => w.length)
    const totalWrappers = wrapperCounts.reduce((prev,next) => prev + next, 0);
    console.log(`Mapped ${tokens.length} total assets and ${totalWrappers} wrappers`);
    console.log(`Min ${Math.min(...wrapperCounts)} | Max ${Math.max(...wrapperCounts)} | Avg ${Math.floor(totalWrappers / tokens.length)}`);
    console.log(`-- ${wrapperCounts.filter(c => c === 1).length} assets with 1 wrapper`)
    console.log(`-- ${wrapperCounts.filter(c => c === 2).length} assets with 2 wrappers`)
    console.log(`-- ${wrapperCounts.filter(c => c > 2).length} assets with >2 wrappers`)
    console.log(`-- ${wrapperCounts.filter(c => c > 3).length} assets with >3 wrappers`)
    const _max = Math.max(...wrapperCounts)
    const token = tokens.find((t, i) => wrapperCounts[i] === _max);
    console.log(await (await ethers.getContractAt('IERC20Metadata', token as string)).symbol(), 'is the most supported asset.');
    mostSupportedToken = token as string
  })

  it('highestAPRAdapter()', async () => {
    const bestApr = await registry.highestAPRAdapter(mostSupportedToken);
    console.log(`The highest APR available for it is ${(parseFloat(formatEther(bestApr.apr)) * 100).toFixed(2)}% on ${await (await ethers.getContractAt('IERC20Metadata', bestApr.adapter as string)).name()}`);
    console.log(`This query took ${(await registry.estimateGas.highestAPRAdapter(mostSupportedToken)).toNumber()} gas to execute`)
  })

  it('highestAPRAdapterForDeposit', async () => {
    const deposit = BigNumber.from(10).pow(25)
    const bestApr = await registry.highestAPRAdapterForDeposit(mostSupportedToken, deposit, constants.AddressZero);
    console.log(`The highest APR available for it is ${(parseFloat(formatEther(bestApr.apr)) * 100).toFixed(2)}% on ${await (await ethers.getContractAt('IERC20Metadata', bestApr.adapter as string)).name()}`);
    console.log(`This query took ${(await registry.estimateGas.highestAPRAdapterForDeposit(mostSupportedToken, deposit, constants.AddressZero)).toNumber()} gas to execute`);
    const adapter: IErc20Adapter = await getContract(bestApr.adapter, 'IErc20Adapter');
    console.log(await adapter.token());
  })
})