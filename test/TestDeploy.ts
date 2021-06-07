import { getContractAddress } from "@ethersproject/address"
import { formatFixed } from "@ethersproject/bignumber"
import { formatEther, formatUnits, parseEther } from "@ethersproject/units"
import { expect } from "chai"
import { BigNumber, constants } from "ethers"
import { ethers, waffle } from "hardhat"
import {
  AdapterRegistry,
  AaveV1ProtocolAdapter,
  AaveV2ProtocolAdapter,
  CompoundProtocolAdapter,
  CreamProtocolAdapter,
  CTokenAdapterFactory,
  FuseTokenAdapterFactory,
  DyDxProtocolAdapter,
  FulcrumProtocolAdapter,
  FuseProtocolAdapter,
  IFusePoolDirectory,
  FusePoolAdapter,
  IErc20Adapter,
  IERC20
} from "../typechain"
import { deployContract, deploy, impersonate, sendEtherTo, getContract, sendTokenTo, WETH } from "./utils"


describe('Deploy All', () => {
  const [wallet] = waffle.provider.getWallets()
  let registry: AdapterRegistry
  let aaveV1: AaveV1ProtocolAdapter
  let aaveV2: AaveV2ProtocolAdapter
  let compound: CompoundProtocolAdapter
  let cream: CreamProtocolAdapter
  let cTokenFactory: CTokenAdapterFactory
  let fTokenFactory: FuseTokenAdapterFactory
  let dydx: DyDxProtocolAdapter
  let fulcrum: FulcrumProtocolAdapter
  let fuse: FuseProtocolAdapter

  let gasTotal: number

  before(async () => {
    await sendEtherTo(wallet.address);
    registry = await deployContract('AdapterRegistry')
    aaveV1 = await deployContract('AaveV1ProtocolAdapter', registry.address)
    aaveV2 = await deployContract('AaveV2ProtocolAdapter', registry.address)
    cTokenFactory = await deployContract('CTokenAdapterFactory')
    fTokenFactory = await deployContract('FuseTokenAdapterFactory')
    compound = await deployContract('CompoundProtocolAdapter', registry.address, cTokenFactory.address)
    cream = await deployContract('CreamProtocolAdapter', registry.address, cTokenFactory.address)
    fuse = await deployContract('FuseProtocolAdapter', registry.address, fTokenFactory.address)
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
    const tx = await aaveV1.map(numTokens)
    const gasUsed = (await tx.wait()).gasUsed.toNumber()
    gasTotal += gasUsed
    console.log(`AAVE V1: Mapped ${numTokens} | Avg Cost:`, Math.floor(gasUsed / numTokens))
  })

  it('Aave V2', async () => {
    const numTokens = (await aaveV2.getUnmapped()).length;
    const tx = await aaveV2.map(numTokens)
    const gasUsed = (await tx.wait()).gasUsed.toNumber()
    gasTotal += gasUsed
    console.log(`AAVE V2: Mapped ${numTokens} | Avg Cost:`, Math.floor(gasUsed / numTokens))
  })

  it('Compound', async () => {
    const numTokens = (await compound.getUnmapped()).length;
    const tx = await compound.map(numTokens)
    const gasUsed = (await tx.wait()).gasUsed.toNumber()
    gasTotal += gasUsed
    console.log(`COMPOUND: Mapped ${numTokens} | Avg Cost:`, Math.floor(gasUsed / numTokens))
  })

  it('Cream', async () => {
    const numTokens = (await cream.getUnmapped()).length;
    const n0 = Math.floor(numTokens / 3);
    const tx0 = await cream.map(n0)
    const tx1 = await cream.map(n0)
    const tx2 = await cream.map(numTokens - n0*2)
    const cost0 = (await tx0.wait()).gasUsed.toNumber()
    const cost1 = (await tx1.wait()).gasUsed.toNumber()
    const cost2 = (await tx2.wait()).gasUsed.toNumber()
    const gasUsed = cost0 + cost1 + cost2
    gasTotal += gasUsed
    console.log(`CREAM: Mapped ${numTokens} | Avg Cost:`, Math.floor(gasUsed / numTokens))
  })

  it('DyDx', async () => {
    const tx = await dydx.map(3)
    const gasUsed = (await tx.wait()).gasUsed.toNumber()
    gasTotal += gasUsed
    console.log('DYDX', (gasUsed / 3))
  })

  it('Fulcrum', async () => {
    const numTokens = (await fulcrum.getUnmapped()).length;
    const tx = await fulcrum.map(numTokens)
    const gasUsed = (await tx.wait()).gasUsed.toNumber()
    gasTotal += gasUsed
    console.log(`FULCRUM: Mapped ${numTokens} | Avg Cost:`, (gasUsed / numTokens))
  })

  let fuseStartId: number;

  it('Fuse: Map Pools', async () => {
    fuseStartId = await registry.getProtocolsCount().then(c => c.toNumber())
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
  const diff = (a: BigNumber, b: BigNumber) => a.gt(b) ? a.sub(b) : b.sub(a);

  async function testAdapterHypotheticalAPR(token: string, adapterAddress: string, debug = false) {
    if (token.toLowerCase() === WETH.toLowerCase()) return;
    const decimals = await (await getContract(token, 'IERC20Metadata')).decimals();
    let amount = BigNumber.from(10).pow(decimals + 2);
    const adapter: IErc20Adapter = await getContract(adapterAddress, 'IErc20Adapter')
    const erc20: IERC20 = await getContract(token, 'IERC20');
    const name = await adapter.name();
    if (name.includes('YFI')) {
      amount = BigNumber.from(10).pow(decimals);
    }
    if (name.includes('WBTC')) {
      amount = BigNumber.from(10).pow(decimals + 1)
    }
    if (debug) console.log(name, token);
    if (debug) console.log(`getting tokens...`)
    await sendTokenTo(token, wallet.address, amount);
    if (debug) console.log(`approving tokens...`)
    await erc20.approve(adapterAddress, amount);
    const gas = await adapter.estimateGas.getHypotheticalAPR(amount);
    const estimatedAPR = await adapter.getHypotheticalAPR(amount);
    if (debug) console.log(`depositing tokens...`)
    await adapter.deposit(amount);
    const aprAfter = await adapter.getAPR();
    const difference = diff(estimatedAPR, aprAfter);
    console.log(`${name} | Estimate: ${
      parseFloat(formatEther(estimatedAPR.mul(100))).toFixed(2)
    }% | Real: ${
      parseFloat(formatEther(aprAfter.mul(100))).toFixed(2)
    }% | ERROR: ${
      parseFloat(formatEther(difference.mul(BigNumber.from(10).pow(20)).div(aprAfter))).toFixed(8)
    }% | Gas ${gas}`);
    expect(parseFloat(formatEther(difference.mul(BigNumber.from(10).pow(20)).div(aprAfter))), name).to.be.lt(0.1)
  }

  async function testAdapterDeposit(token: string, adapterAddress: string, debug = false) {
    if (token.toLowerCase() === WETH.toLowerCase()) return;
    const decimals = await (await getContract(token, 'IERC20Metadata')).decimals();
    let amount = BigNumber.from(10).pow(decimals + 2);
    const adapter: IErc20Adapter = await getContract(adapterAddress, 'IErc20Adapter')
    const erc20: IERC20 = await getContract(token, 'IERC20');
    const name = await adapter.name();
    let dAmount = 100;
    if (name.includes('YFI')) {
      amount = BigNumber.from(10).pow(decimals);
      dAmount = 1;
    }
    if (name.includes('WBTC')) {
      amount = BigNumber.from(10).pow(decimals + 1);
      dAmount = 10;
    }
    if (debug) console.log(`getting tokens...`)
    await sendTokenTo(token, wallet.address, amount);
    if (debug) console.log(`approving tokens...`)
    await erc20.approve(adapterAddress, amount);
    const gasDeposit = await adapter.estimateGas.deposit(amount);
    await adapter.deposit(amount);
    const gasTokenBalance = await adapter.estimateGas.tokenBalance();
    const tokenBalance = await adapter.tokenBalance();
    const gasUnderlyingBalance = await adapter.estimateGas.underlyingBalance();
    const underlyingBalance = await adapter.underlyingBalance();
    console.log(`${name} | deposit(${dAmount}) GAS ${gasDeposit} | tokenBalance() ${
      formatFixed(tokenBalance, decimals)} GAS ${gasTokenBalance} | underlyingBalance() ${
        formatFixed(underlyingBalance, decimals)} GAS ${gasUnderlyingBalance}`
    );
  }

  it('Accuracy', async () => {
    const tokens = await registry.getSupportedTokens();
    const counts = await Promise.all(tokens.map(t => registry.getAdaptersCount(t)));
    const mostSupportedTokens = tokens.filter((t, i) => counts[i].gt(2));
    console.log(`-- TESTING HYPOTHETICAL APRS FOR DEPOSIT OF 100 TOKENS --`)
    for (const token of mostSupportedTokens) {
      const { adapter: adapterAddress } = await registry.getAdapterWithHighestAPR(token);
      await testAdapterHypotheticalAPR(token, adapterAddress, true)
    }
    for (const token of mostSupportedTokens) {
      const adapters = await registry.getAdaptersList(token);
      const names = await Promise.all(adapters.map(async (a) => (await getContract(a, 'IErc20Adapter')).name()));
      const adapterAddress = adapters.find((a, i) => names[i].includes('DyDx'));
      if (adapterAddress) {
        await testAdapterHypotheticalAPR(token, adapterAddress)
      }
    }
  })

  it('COST', async () => {
    const tokens = await registry.getSupportedTokens();
    const counts = await Promise.all(tokens.map(t => registry.getAdaptersCount(t)));
    const mostSupportedTokens = tokens.filter((t, i) => counts[i].gt(2));
    console.log(`-- TESTING HYPOTHETICAL APRS FOR DEPOSIT OF 100 TOKENS --`)
    for (const token of mostSupportedTokens) {
      const { adapter: adapterAddress } = await registry.getAdapterWithHighestAPR(token);
      await testAdapterDeposit(token, adapterAddress)
    }
  })

  let mostSupportedToken: string;
  let mostSupportedTokenSymbol: string

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
    mostSupportedTokenSymbol = await (await ethers.getContractAt('IERC20Metadata', token as string)).symbol()
    console.log(mostSupportedTokenSymbol, 'is the most supported asset with', _max, 'adapters.');
    mostSupportedToken = token as string;
  })

  it('getAdapterWithHighestAPR()', async () => {
    const bestApr = await registry.getAdapterWithHighestAPR(mostSupportedToken);
    console.log(`The highest APR available for ${mostSupportedTokenSymbol} it is ${(parseFloat(formatEther(bestApr.apr)) * 100).toFixed(2)}% on ${await (await ethers.getContractAt('IERC20Metadata', bestApr.adapter as string)).name()}`);
    console.log(`This query took ${(await registry.estimateGas.getAdapterWithHighestAPR(mostSupportedToken)).toNumber()} gas to execute`)
  })

  it('getAdapterWithHighestAPRForDeposit', async () => {
    const deposit = BigNumber.from(10).pow(25)
    const bestApr = await registry.getAdapterWithHighestAPRForDeposit(mostSupportedToken, deposit, constants.AddressZero);
    console.log(`With a deposit of 1m ${mostSupportedTokenSymbol}, the highest APR available is ${(parseFloat(formatEther(bestApr.apr)) * 100).toFixed(2)}% on ${await (await ethers.getContractAt('IERC20Metadata', bestApr.adapter as string)).name()}`);
    console.log(`This query took ${(await registry.estimateGas.getAdapterWithHighestAPRForDeposit(mostSupportedToken, deposit, constants.AddressZero)).toNumber()} gas to execute`);
    const adapter: IErc20Adapter = await getContract(bestApr.adapter, 'IErc20Adapter');
    // console.log(await adapter.token());
  })
})