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
  //FuseTokenAdapterFactory,
  DyDxProtocolAdapter,
  FulcrumProtocolAdapter,
  FuseProtocolAdapter,
  IFusePoolDirectory,
  //FusePoolAdapter,
  IErc20Adapter,
  IERC20,
  IronBankProtocolAdapter,
  IIndexPool
} from "../typechain"
import { deployContract, deploy, getContract } from "./shared/utils"
import { WETH, getIERC20, getTokenSymbol, sendEtherTo, sendTokenTo } from "./shared/tokens"


describe('Deploy All', () => {
  const [wallet] = waffle.provider.getWallets()
  let registry: AdapterRegistry
  let aaveV1: AaveV1ProtocolAdapter
  let aaveV2: AaveV2ProtocolAdapter
  let compound: CompoundProtocolAdapter
  let cream: CreamProtocolAdapter
  //let fTokenFactory: FuseTokenAdapterFactory
  let dydx: DyDxProtocolAdapter
  let fulcrum: FulcrumProtocolAdapter
  let fuse: FuseProtocolAdapter
  let iron: IronBankProtocolAdapter

  let gasTotal: number

  before(async () => {
    await sendEtherTo(wallet.address);
    registry = await deployContract('AdapterRegistry')
    aaveV1 = await deployContract('AaveV1ProtocolAdapter', registry.address)
    aaveV2 = await deployContract('AaveV2ProtocolAdapter', registry.address)
    //fTokenFactory = await deployContract('FuseTokenAdapterFactory')
    compound = await deployContract('CompoundProtocolAdapter', registry.address/* , cTokenFactory.address */)
    cream = await deployContract('CreamProtocolAdapter', registry.address/* , cTokenFactory.address */)
    iron = await deployContract('IronBankProtocolAdapter', registry.address/* , cTokenFactory.address */)
    //fuse = await deployContract('FuseProtocolAdapter', registry.address, fTokenFactory.address)
    //await fuse.deployTransaction.wait()
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
      compound,
      cream,
      //fuse,
      dydx,
      fulcrum,
      iron
    ].map(c => c.deployTransaction.hash);

    const addTxs = [
      atx0,
      atx1,
      await registry.addProtocolAdapter(aaveV1.address),
      await registry.addProtocolAdapter(aaveV2.address),
      await registry.addProtocolAdapter(compound.address),
      await registry.addProtocolAdapter(cream.address),
      // await registry.addProtocolAdapter(fuse.address),
      await registry.addProtocolAdapter(iron.address)
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
    let remainder = numTokens;
    let gasUsed = 0;
    while (remainder > 0) {
      const tx = await aaveV2.map(5)
      gasUsed += (await tx.wait()).gasUsed.toNumber()
      remainder -= 5;
    }
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
    let remainder = numTokens;
    let gasUsed = 0;
    while (remainder > 0) {
      const tx = await cream.map(5)
      gasUsed += (await tx.wait()).gasUsed.toNumber()
      remainder -= 5;
    }
    gasTotal += gasUsed
    console.log(`CREAM: Mapped ${numTokens} | Avg Cost:`, Math.floor(gasUsed / numTokens))
  })

  it('Iron Bank', async () => {
    const numTokens = (await iron.getUnmapped()).length;
    let remainder = numTokens;
    let gasUsed = 0;
    while (remainder > 0) {
      const tx = await iron.map(5)
      gasUsed += (await tx.wait()).gasUsed.toNumber()
      remainder -= 5;
    }
    console.log(`IronBank: Mapped ${numTokens} | Avg Cost:`, Math.floor(gasUsed / numTokens))
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

  /** 
  let fuseStartId: number;

  it('Fuse: Map Pools', async () => {
    fuseStartId = await registry.protocolsCount().then((c: BigNumber) => c.toNumber())
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
  **/

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
    const gasTokenBalance = await adapter.estimateGas.balanceWrapped();
    const tokenBalance = await adapter.balanceWrapped();
    const gasUnderlyingBalance = await adapter.estimateGas.balanceUnderlying();
    const underlyingBalance = await adapter.balanceUnderlying();
    console.log(`${name} | deposit(${dAmount}) GAS ${gasDeposit} | tokenBalance() ${
      formatFixed(tokenBalance, decimals)} GAS ${gasTokenBalance} | underlyingBalance() ${
        formatFixed(underlyingBalance, decimals)} GAS ${gasUnderlyingBalance}`
    );
  }

  const toAdapter = (address: string): Promise<IErc20Adapter> => getContract(address, 'IErc20Adapter');

  const adapterName = (address: string): Promise<string> => toAdapter(address).then(a => a.name())

  const getIndexPoolTokens = async (address: string) => {
    const pool: IIndexPool = await getContract(address, 'IIndexPool');
    const tokens = await pool.getCurrentTokens();
    const totalDenorm = formatEther(await pool.getTotalDenormalizedWeight())
    const toData = async (token: string) => {
      const erc = await getIERC20(token);
      const balance = await erc.balanceOf(address);
      const denorm = formatEther(await pool.getDenormalizedWeight(token));
      const weight = parseFloat(denorm) / parseFloat(totalDenorm)
      return { balance, token, weight };
    }
    return Promise.all(tokens.map(toData))
  }

  async function checkIndexAPR(index: string) {
    let netAPR = 0;
    const check = async ({ token, balance, weight }: {
      token: string;
      balance: BigNumber;
      weight: number;
    }) => {
      const supported = await registry.isSupported(token);
      let apr = 0;
      let symbol = '';
      if (supported) {
        const bestapr = await registry["getAdapterWithHighestAPRForDeposit(address,uint256,address)"](
          token,
          balance,
          constants.AddressZero
        );
        apr = (parseFloat(formatEther(bestapr.apr)) * 100)
        symbol = await adapterName(bestapr.adapter)
        netAPR += (apr * weight);
      }
      console.log(`${symbol} ${supported ? '' : 'NOT '}SUPPORTED${supported ? ` | ${apr.toFixed(2)}% APR` : ''}`)
    }
    const tokens = await getIndexPoolTokens(index);
    for (const token of tokens) await check(token);
    console.log(`${await getTokenSymbol(await getIERC20(index))} Net APR: ${netAPR.toFixed(2)}%`)
  }

  it('DEFI5', async () => {
    const index = '0xfa6de2697d59e88ed7fc4dfe5a33dac43565ea41'
    await checkIndexAPR(index);
  })

  it('CC10', async () => {
    const index = '0xabafa52d3d5a2c18a4c1ae24480d22b831fc0413'
    await checkIndexAPR(index);
  })

  // describe('Interactions', () => {
  //   it('Accuracy', async () => {
  //     const tokens = await registry.getSupportedTokens();
  //     const counts = await Promise.all(tokens.map(t => registry.getAdaptersCount(t)));
  //     const mostSupportedTokens = tokens.filter((t, i) => counts[i].gt(2));
  //     console.log(`-- TESTING HYPOTHETICAL APRS FOR DEPOSIT OF 100 TOKENS --`)
  //     for (const token of mostSupportedTokens) {
  //       const { adapter: adapterAddress } = await registry.getAdapterWithHighestAPR(token);
  //       await testAdapterHypotheticalAPR(token, adapterAddress, true)
  //     }
  //     for (const token of mostSupportedTokens) {
  //       const adapters = await registry.getAdaptersList(token);
  //       const names = await Promise.all(adapters.map(async (a) => (await getContract(a, 'IErc20Adapter')).name()));
  //       const adapterAddress = adapters.find((a, i) => names[i].includes('DyDx'));
  //       if (adapterAddress) {
  //         await testAdapterHypotheticalAPR(token, adapterAddress)
  //       }
  //     }
  //   })

  //   it('COST', async () => {
  //     const tokens = await registry.getSupportedTokens();
  //     const counts = await Promise.all(tokens.map(t => registry.getAdaptersCount(t)));
  //     const mostSupportedTokens = tokens.filter((t, i) => counts[i].gt(2));
  //     console.log(`-- TESTING HYPOTHETICAL APRS FOR DEPOSIT OF 100 TOKENS --`)
  //     for (const token of mostSupportedTokens) {
  //       const { adapter: adapterAddress } = await registry.getAdapterWithHighestAPR(token);
  //       await testAdapterDeposit(token, adapterAddress)
  //     }
  //   })

  //   let mostSupportedToken: string;
  //   let mostSupportedTokenSymbol: string

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
      // const _max = Math.max(...wrapperCounts)
      // const token = tokens.find((t, i) => wrapperCounts[i] === _max);
      // mostSupportedTokenSymbol = await (await ethers.getContractAt('IERC20Metadata', token as string)).symbol()
      // console.log(mostSupportedTokenSymbol, 'is the most supported asset with', _max, 'adapters.');
      // mostSupportedToken = token as string;
    })

  //   it('getAdapterWithHighestAPR()', async () => {
  //     const bestApr = await registry.getAdapterWithHighestAPR(mostSupportedToken);
  //     console.log(`The highest APR available for ${mostSupportedTokenSymbol} it is ${(parseFloat(formatEther(bestApr.apr)) * 100).toFixed(2)}% on ${await (await ethers.getContractAt('IERC20Metadata', bestApr.adapter as string)).name()}`);
  //     console.log(`This query took ${(await registry.estimateGas.getAdapterWithHighestAPR(mostSupportedToken)).toNumber()} gas to execute`)
  //   })

  //   it('getAdapterWithHighestAPRForDeposit', async () => {
  //     const deposit = BigNumber.from(10).pow(27)
  //     const {
  //       aprs,
  //       adapters
  //     } = await registry["getAdaptersSortedByAPRWithDeposit(address,uint256,address)"](mostSupportedToken, deposit.div(3), constants.AddressZero);
  //     //getAdapterWithHighestAPRForDeposit(mostSupportedToken, deposit, constants.AddressZero);
  //     for (let i = 0; i < 3; i++) {
  //       const bestApr = aprs[i];
  //       const adapter = adapters[i]
  //       console.log(
  //         `With a deposit of 1m ${mostSupportedTokenSymbol}, the highest APR available is ${
  //         (parseFloat(formatEther(bestApr)) * 100).toFixed(2)}% on ${await (await ethers.getContractAt('IERC20Metadata', adapter as string)).name()}`);
  //     }
  //     console.log(`This query took ${(await registry.estimateGas["getAdaptersSortedByAPRWithDeposit(address,uint256,address)"](mostSupportedToken, deposit.div(3), constants.AddressZero)).toNumber()} gas to execute`);
  //     // const adapter: IErc20Adapter = await getContract(bestApr.adapter, 'IErc20Adapter');
  //     // console.log(await adapter.token());
  //   })
  // })
})