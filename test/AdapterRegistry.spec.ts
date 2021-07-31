import { expect } from "chai";
import { BigNumber, constants, ContractTransaction, Wallet } from "ethers";
import { waffle } from "hardhat";
import { AdapterRegistry, TestAdapter, TestERC20, TestNirnVault, TestVault } from "../typechain"
import { createSnapshot, deployClone, deployContract, getBigNumber } from "./shared";
import { deployTestERC20, deployTestWrapperAndAdapter } from "./shared/fixtures";

const ADDRESS_ONE = `0x${'11'.repeat(20)}`;
const ADDRESS_TWO = `0x${'22'.repeat(20)}`;
const ADDRESS_THREE = `0x${'33'.repeat(20)}`;

describe('AdapterRegistry', () => {
  const [owner, notOwner, approvedProtocol, approvedFactory] = waffle.provider.getWallets()

  let registry: AdapterRegistry
  let adapter: TestAdapter
  let wrapper: TestVault
  let adapter1: TestAdapter
  let wrapper1: TestVault
  let underlying: TestERC20
  let restoreSnapshot: () => Promise<void>

  before(async () => {
    registry = await deployContract('AdapterRegistry');
    underlying = await deployTestERC20();
    ({adapter, wrapper} = await deployTestWrapperAndAdapter(underlying.address, getBigNumber(1)));
    ({adapter: adapter1, wrapper: wrapper1} = await deployTestWrapperAndAdapter(underlying.address, getBigNumber(2)));
    await underlying.approve(adapter.address, constants.MaxUint256)
    await underlying.approve(adapter1.address, constants.MaxUint256)
    await underlying.mint(owner.address, getBigNumber(2))
    await adapter.deposit(getBigNumber(1))
    await adapter1.deposit(getBigNumber(1))
    restoreSnapshot = await createSnapshot()
  })

  const setup = (approve?: boolean) => before('Deploy registry', async () => {
    await restoreSnapshot()
    if (approve) {
      await registry.addProtocolAdapter(approvedProtocol.address)
    }
  })

  describe('addProtocolAdapter()', () => {
    setup()

    it('Should revert if not called by owner or protocol adapter', async () => {
      await expect(registry.connect(notOwner).addProtocolAdapter(constants.AddressZero)).to.be.revertedWith('!approved')
    })

    it('Should revert if given null address', async () => {
      await expect(registry.addProtocolAdapter(constants.AddressZero)).to.be.revertedWith('null')
    })

    it('Should allow owner to add protocol', async () => {
      await expect(registry.addProtocolAdapter(ADDRESS_ONE))
        .to.emit(registry, 'ProtocolAdapterAdded')
        .withArgs(1, ADDRESS_ONE)
    })

    it('Should revert if adapter already added', async () => {
      await expect(registry.addProtocolAdapter(ADDRESS_ONE)).to.be.revertedWith('exists')
    })

    it('Should update protocolsCount', async () => {
      expect(await registry.protocolsCount()).to.eq(1)
    })

    it('Should update protocolAdapterIds', async () => {
      expect(await registry.protocolAdapterIds(ADDRESS_ONE)).to.eq(1)
    })

    it('Should update protocolAdapters', async () => {
      expect(await registry.protocolAdapters(1)).to.eq(ADDRESS_ONE)
    })
  })

  describe('removeProtocolAdapter()', () => {
    setup()

    it('Should revert if not called by owner', async () => {
      await expect(registry.connect(notOwner).removeProtocolAdapter(constants.AddressZero)).to.be.revertedWith('Ownable: caller is not the owner')
    })

    it('Should revert if adapter does not exist', async () => {
      await expect(registry.removeProtocolAdapter(constants.AddressZero)).to.be.revertedWith('!exists')
    })

    it('Should allow owner to remove an adapter', async () => {
      await registry.addProtocolAdapter(ADDRESS_ONE)
      await expect(registry.removeProtocolAdapter(ADDRESS_ONE))
        .to.emit(registry, 'ProtocolAdapterRemoved')
        .withArgs(1)
    })

    it('Should not affect protocolsCount', async () => {
      expect(await registry.protocolsCount()).to.eq(1)
    })

    it('Should remove record from protocolAdapterIds', async () => {
      expect(await registry.protocolAdapterIds(ADDRESS_ONE)).to.eq(0)
    })

    it('Should remove record from protocolAdapters', async () => {
      expect(await registry.protocolAdapters(1)).to.eq(constants.AddressZero)
    })
  })

  describe('addVaultFactory()', () => {
    beforeEach(() => restoreSnapshot())

    it('Should revert if caller is not owner', async () => {
      await expect(registry.connect(notOwner).addVaultFactory(constants.AddressZero))
        .to.be.revertedWith('Ownable: caller is not the owner')
    })

    it('Should revert if address is null', async () => {
      await expect(registry.addVaultFactory(constants.AddressZero))
        .to.be.revertedWith('null address')
    })

    it('Should add vault to approvedVaultFactories', async () => {
      await expect(registry.addVaultFactory(approvedFactory.address))
        .to.emit(registry, 'VaultFactoryAdded')
        .withArgs(approvedFactory.address)
      expect(await registry.approvedVaultFactories(approvedFactory.address)).to.be.true
    })

    it('Should revert if already approved', async () => {
      await registry.addVaultFactory(approvedFactory.address)
      await expect(registry.addVaultFactory(approvedFactory.address))
        .to.be.revertedWith('already approved')
    })
  })

  describe('removeVaultFactory()', () => {
    beforeEach(() => restoreSnapshot())

    it('Should revert if caller is not owner', async () => {
      await expect(registry.connect(notOwner).removeVaultFactory(constants.AddressZero))
        .to.be.revertedWith('Ownable: caller is not the owner')
    })

    it('Should revert if factory not approved', async () => {
      await expect(registry.removeVaultFactory(approvedFactory.address))
        .to.be.revertedWith('!approved')
    })

    it('Should remove vault from approvedVaultFactories', async () => {
      await registry.addVaultFactory(approvedFactory.address)
      await expect(registry.removeVaultFactory(approvedFactory.address))
        .to.emit(registry, 'VaultFactoryRemoved')
        .withArgs(approvedFactory.address)
      expect(await registry.approvedVaultFactories(approvedFactory.address)).to.be.false
    })
  })

  const deployVault = async (addAdapter = true) => {
    if (addAdapter) {
      await registry.addProtocolAdapter(approvedProtocol.address)
      await registry.connect(approvedProtocol).addTokenAdapter(adapter1.address)
    }
    const implementation = await deployContract<TestNirnVault>('TestNirnVault', registry.address, constants.AddressZero)
    const vault = await deployClone(implementation)
    await vault.initialize(underlying.address, constants.AddressZero, constants.AddressZero, owner.address)
    return vault
  }

  describe('addVault()', () => {
    beforeEach(() => restoreSnapshot())

    it('Should revert if not approved factory', async () => {
      await expect(registry.addVault(constants.AddressZero))
        .to.be.revertedWith('!approved')
    })

    it('Should revert if vault does not expose underlying() fn', async () => {
      await registry.addVaultFactory(approvedFactory.address)
      await expect(registry.connect(approvedFactory).addVault(constants.AddressZero)).to.be.reverted
    })

    it('Should add vault and map it to the underlying asset', async () => {
      await registry.addVaultFactory(approvedFactory.address)
      const vault = await deployVault()
      await expect(
        registry.connect(approvedFactory).addVault(vault.address)
      )
        .to.emit(registry, 'VaultAdded')
        .withArgs(underlying.address, vault.address)
      expect(await registry.vaultsByUnderlying(underlying.address)).to.eq(vault.address)
    })

    it('Should revert if vault already exists for underlying', async () => {
      await registry.addVaultFactory(approvedFactory.address)
      const vault1 = await deployVault()
      const vault2 = await deployVault(false)
      await registry.connect(approvedFactory).addVault(vault1.address)
      await expect(
        registry.connect(approvedFactory).addVault(vault2.address)
      ).to.be.revertedWith('exists')
      expect(await registry.getVaultsList()).to.deep.eq([vault1.address])
      expect(await registry.haveVaultFor(underlying.address)).to.be.true
    })
  })

  describe('removeVault()', () => {
    beforeEach(() => restoreSnapshot())

    it('Should revert if caller is not the owner', async () => {
      await expect(registry.connect(notOwner).removeVault(constants.AddressZero))
        .to.be.revertedWith('Ownable: caller is not the owner')
    })

    it('Should revert if vault not mapped to underlying', async () => {
      const vault = await deployVault()
      await expect(
        registry.removeVault(vault.address)
      ).to.be.revertedWith('!exists')
    })

    it('Should remove mapping from underlying to vault', async () => {
      await registry.addVaultFactory(approvedFactory.address)
      const vault = await deployVault()
      await registry.connect(approvedFactory).addVault(vault.address)
      expect(await registry.removeVault(vault.address))
        .to.emit(registry, 'VaultRemoved')
        .withArgs(underlying.address, vault.address)
      expect(await registry.vaultsByUnderlying(underlying.address)).to.eq(constants.AddressZero)
      expect(await registry.getVaultsList()).to.deep.eq([])
      expect(await registry.haveVaultFor(underlying.address)).to.be.false
    })
  })

  function testAddAdapter(
    addTokenAdapter: (signer: Wallet, adapter: string) => Promise<ContractTransaction>
  ) {
    setup()

    it('Should revert if caller is not a protocol adapter', async () => {
      await expect(addTokenAdapter(owner, ADDRESS_ONE)).to.be.revertedWith('!exists')
    })

    it('Should revert if contract does not expose underlying() and token() functions', async () => {
      await registry.addProtocolAdapter(approvedProtocol.address);
      await expect(addTokenAdapter(approvedProtocol, ADDRESS_ONE)).to.be.reverted
    })

    it('Should allow protocol adapters to add token adapters', async () => {
      await expect(addTokenAdapter(approvedProtocol, adapter.address))
        .to.emit(registry, 'TokenAdapterAdded')
        .withArgs(adapter.address, 1, underlying.address, wrapper.address)
        .to.emit(registry, 'TokenSupportAdded')
        .withArgs(underlying.address)
    })
    
    it('Should add underlying to supportedTokens if it is new', async () => {
      expect(await registry.getSupportedTokens()).to.deep.eq([ underlying.address ])
    })
    
    it('Should add adapter to tokenAdapters list for underlying token', async () => {
      expect(await registry.getAdaptersList(underlying.address)).to.deep.eq([ adapter.address ])
    })

    it('Should map wrapper token to adapter', async () => {
      expect(await registry.getAdapterForWrapperToken(wrapper.address)).to.eq(adapter.address)
    })

    it('Should revert if wrapper is already mapped to an adapter', async () => {
      await expect(addTokenAdapter(approvedProtocol, adapter.address)).to.be.revertedWith('adapter exists')
    })
    
    it('Should not change supportedTokens if underlying token is not new', async () => {
      await expect(addTokenAdapter(approvedProtocol, adapter1.address))
        .to.emit(registry, 'TokenAdapterAdded')
        .withArgs(adapter1.address, 1, underlying.address, wrapper1.address)
        .to.not.emit(registry, 'TokenSupportAdded')
      expect(await registry.getSupportedTokens()).to.deep.eq([ underlying.address ])
      expect(await registry.getAdaptersList(underlying.address)).to.deep.eq([ adapter.address, adapter1.address ])
      expect(await registry.getAdapterForWrapperToken(wrapper1.address)).to.eq(adapter1.address)
      expect(await registry.isSupported(underlying.address)).to.be.true
    })
  }

  describe('addTokenAdapter()', () => {
    testAddAdapter(
      async (signer, _adapter) => registry.connect(signer).addTokenAdapter(_adapter)
    )
  })

  describe('addTokenAdapters()', () => {
    testAddAdapter(
      async (signer, _adapter) => registry.connect(signer).addTokenAdapters([_adapter])
    )
  })

  describe('getAdaptersCount()', () => {
    setup(true)

    it('Should return number of adapters for underlying token', async () => {
      expect(await registry.getAdaptersCount(underlying.address)).to.eq(0)
      await registry.connect(approvedProtocol).addTokenAdapter(adapter1.address)
      expect(await registry.getAdaptersCount(underlying.address)).to.eq(1)
    })
  })

  describe('isApprovedAdapter', () => {
    setup(true)

    it('Should return true for registered adapter', async () => {
      await registry.connect(approvedProtocol).addTokenAdapter(adapter.address)
      expect(await registry.isApprovedAdapter(adapter.address)).to.be.true
    })

    it('Should return false if adapter not registered', async () => {
      const newAdapter = await deployContract('TestAdapter', underlying.address, wrapper.address, getBigNumber(1))
      expect(await registry.isApprovedAdapter(newAdapter.address)).to.be.false
    })
  })

  describe('getProtocolMetadata()', () => {
    setup()

    it('Should revert if protocolId does not exist', async () => {
      await expect(registry.getProtocolMetadata(1)).to.be.revertedWith('invalid id')
    })

    it('Should return protocol address and name for protocolId', async () => {
      const protocol = await deployContract('TestProtocolAdapter')
      await registry.addProtocolAdapter(protocol.address)
      const { name, protocolAdapter } = await registry.getProtocolMetadata(1)
      expect(name).to.eq('Test Protocol')
      expect(protocolAdapter).to.eq(protocol.address)
    })
  })

  describe('getProtocolForTokenAdapter()', () => {
    setup(true)

    it('Should revert if adapter not approved', async () => {
      await expect(registry.getProtocolForTokenAdapter(adapter.address)).to.be.revertedWith('!approved')
    })

    it('Should return protocol adapter address', async () => {
      await registry.connect(approvedProtocol).addTokenAdapter(adapter.address)
      expect(await registry.getProtocolForTokenAdapter(adapter.address)).to.eq(approvedProtocol.address)
    })
  })

  describe('getAdaptersSortedByAPR()', () => {
    setup(true)

    it('Should return empty list if no adapters registered', async () => {
      const { adapters, aprs } = await registry.getAdaptersSortedByAPR(underlying.address)
      expect(adapters).to.deep.eq([])
      expect(aprs).to.deep.eq([])
    })

    it('Should return adapters in descending order of APR', async () => {
      await registry.connect(approvedProtocol).addTokenAdapter(adapter.address)
      await registry.connect(approvedProtocol).addTokenAdapter(adapter1.address)
      const { adapters, aprs } = await registry.getAdaptersSortedByAPR(underlying.address)
      expect(adapters).to.deep.eq([adapter1.address, adapter.address])
      expect(aprs).to.deep.eq([getBigNumber(2), getBigNumber(1)])
    })

    it('Should use 0 if getAPR reverts', async () => {
      await adapter.setRevertOnAPRQQuery(true)
      const { adapters, aprs } = await registry.getAdaptersSortedByAPR(underlying.address)
      expect(adapters).to.deep.eq([adapter1.address, adapter.address])
      expect(aprs).to.deep.eq([getBigNumber(2), BigNumber.from(0)])
    })
  })

  describe('getAdaptersSortedByAPRWithDeposit()', () => {
    setup(true)

    it('Should return empty list if no adapters registered', async () => {
      const { adapters, aprs } = await registry.getAdaptersSortedByAPRWithDeposit(underlying.address, getBigNumber(1), constants.AddressZero)
      expect(adapters).to.deep.eq([])
      expect(aprs).to.deep.eq([])
    })

    it('Should return adapters in descending order of hypothetical APR', async () => {
      await registry.connect(approvedProtocol).addTokenAdapter(adapter.address)
      await registry.connect(approvedProtocol).addTokenAdapter(adapter1.address)
      const { adapters, aprs } = await registry.getAdaptersSortedByAPRWithDeposit(underlying.address, getBigNumber(1), constants.AddressZero)
      expect(adapters).to.deep.eq([adapter1.address, adapter.address])
      expect(aprs).to.deep.eq([getBigNumber(1), getBigNumber(5, 17)])
    })

    it('Should use current APR for excludedAdapter', async () => {
      const { adapters, aprs } = await registry.getAdaptersSortedByAPRWithDeposit(underlying.address, getBigNumber(1), adapter.address)
      expect(adapters).to.deep.eq([adapter.address, adapter1.address])
      expect(aprs).to.deep.eq([getBigNumber(1), getBigNumber(1)])
    })

    it('Should use 0 if getAPR reverts', async () => {
      await adapter.setRevertOnAPRQQuery(true)
      const { adapters, aprs } = await registry.getAdaptersSortedByAPRWithDeposit(underlying.address, getBigNumber(1), adapter.address)
      expect(adapters).to.deep.eq([adapter1.address, adapter.address])
      expect(aprs).to.deep.eq([getBigNumber(1), BigNumber.from(0)])
    })

    it('Should use 0 if getHypotheticalAPR reverts', async () => {
      await adapter.setRevertOnAPRQQuery(false)
      await adapter1.setRevertOnAPRQQuery(true)
      const { adapters, aprs } = await registry.getAdaptersSortedByAPRWithDeposit(underlying.address, getBigNumber(1), constants.AddressZero)
      expect(adapters).to.deep.eq([adapter.address, adapter1.address])
      expect(aprs).to.deep.eq([getBigNumber(5, 17), BigNumber.from(0)])
    })
  })

  describe('getAdapterWithHighestAPR()', () => {
    setup(true)

    it('Should return adapter with highest APR', async () => {
      await registry.connect(approvedProtocol).addTokenAdapter(adapter.address)
      await registry.connect(approvedProtocol).addTokenAdapter(adapter1.address)
      const { apr, adapter: highestAPRAdapter } = await registry.getAdapterWithHighestAPR(underlying.address)
      expect(highestAPRAdapter).to.eq(adapter1.address)
      expect(apr).to.eq(getBigNumber(2))
    })
  })

  describe('getAdapterWithHighestAPRForDeposit()', () => {
    setup(true)

    it('Should return adapter with highest APR', async () => {
      await registry.connect(approvedProtocol).addTokenAdapter(adapter.address)
      await registry.connect(approvedProtocol).addTokenAdapter(adapter1.address)
      const { apr, adapter: highestAPRAdapter } = await registry.getAdapterWithHighestAPRForDeposit(underlying.address, getBigNumber(1), constants.AddressZero)
      expect(highestAPRAdapter).to.eq(adapter1.address)
      expect(apr).to.eq(getBigNumber(1))
    })
  })

  describe('getProtocolAdaptersAndIds()', () => {
    setup()

    it('Should return empty list when no adapters are registered', async () => {
      const {adapters, ids} = await registry.getProtocolAdaptersAndIds()
      expect(adapters).to.deep.eq([])
      expect(ids).to.deep.eq([])
    })

    it('Should return list of protocol adapters', async () => {
      await registry.addProtocolAdapter(approvedProtocol.address)
      const {adapters, ids} = await registry.getProtocolAdaptersAndIds()
      expect(adapters).to.deep.eq([approvedProtocol.address])
      expect(ids).to.deep.eq([BigNumber.from(1)])
    })

    it('Should not include removed adapters', async () => {
      await registry.removeProtocolAdapter(approvedProtocol.address)
      const {adapters, ids} = await registry.getProtocolAdaptersAndIds()
      expect(adapters).to.deep.eq([])
      expect(ids).to.deep.eq([])
    })
  })

  // describe('getProtocolAdapters()', () => {

  // })

  describe('removeTokenAdapter()', () => {
    setup()

    before(async () => {
      await registry.addProtocolAdapter(approvedProtocol.address);
      await registry.connect(approvedProtocol).addTokenAdapter(adapter.address)
      await registry.connect(approvedProtocol).addTokenAdapter(adapter1.address)
    })

    it('Should revert if adapter does not have token() fn', async () => {
      await expect(registry.removeTokenAdapter(ADDRESS_ONE)).to.be.reverted
    })

    it('Should revert if caller is not owner or correct protocol adapter', async () => {
      await expect(registry.connect(notOwner).removeTokenAdapter(adapter.address)).to.be.revertedWith('!authorized')
    })

    it('Should revert if wrong adapter given for wrapper', async () => {
      const badAdapter = await deployContract('TestAdapter', underlying.address, wrapper.address, getBigNumber(1))
      await expect(
        registry.removeTokenAdapter(badAdapter.address)
      ).to.be.revertedWith('wrong adapter')
    })

    it('Should allow owner to remove any token adapter', async () => {
      await expect(registry.removeTokenAdapter(adapter.address))
        .to.emit(registry, 'TokenAdapterRemoved')
        .withArgs(adapter.address, 1, underlying.address, wrapper.address)
        .to.not.emit(registry, 'TokenSupportRemoved')
    })

    it('Should remove mapping from wrapper to adapter', async () => {
      expect(await registry.getAdapterForWrapperToken(wrapper.address)).to.eq(constants.AddressZero)
    })

    it('Should remove adapter from list of adapters for underlying', async () => {
      expect(await registry.getAdaptersList(underlying.address)).to.deep.eq([adapter1.address])
    })

    it('Should not remove underlying from supported tokens if there are other adapters for it', async () => {
      expect(await registry.getSupportedTokens()).to.deep.eq([ underlying.address ])
    })

    it('Should allow protocol adapter to remove token adapters it registered', async () => {
      await expect(registry.connect(approvedProtocol).removeTokenAdapter(adapter1.address))
        .to.emit(registry, 'TokenAdapterRemoved')
        .withArgs(adapter1.address, 1, underlying.address, wrapper1.address)
        .to.emit(registry, 'TokenSupportRemoved')
        .withArgs(underlying.address)
      expect(await registry.getAdapterForWrapperToken(wrapper1.address)).to.eq(constants.AddressZero)
      expect(await registry.getAdaptersList(underlying.address)).to.deep.eq([])
    })

    it('Should remove underlying from supported tokens if there are no other adapters for it', async () => {
      expect(await registry.getSupportedTokens()).to.deep.eq([])
    })
  })
})