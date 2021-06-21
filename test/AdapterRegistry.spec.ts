import { expect } from "chai";
import { constants } from "ethers";
import { waffle } from "hardhat";
import { AdapterRegistry, TestAdapter } from "../typechain"
import { deployContract, getBigNumber, resetFork, withSigner } from "./shared";

const ADDRESS_ONE = `0x${'11'.repeat(20)}`;
const ADDRESS_TWO = `0x${'22'.repeat(20)}`;
const ADDRESS_THREE = `0x${'33'.repeat(20)}`;

describe('AdapterRegistry', () => {
  const [owner, notOwner, approvedProtocol] = waffle.provider.getWallets()

  let registry: AdapterRegistry
  let adapter: TestAdapter
  let adapter1: TestAdapter

  const setup = () => before('Deploy registry', async () => {
    await resetFork()
    registry = await deployContract('AdapterRegistry')
    adapter = await deployContract('TestAdapter', ADDRESS_ONE, ADDRESS_TWO, getBigNumber(1000), getBigNumber(10000), getBigNumber(500));
    adapter1 = await deployContract('TestAdapter', ADDRESS_ONE, ADDRESS_THREE, getBigNumber(1000), getBigNumber(10000), getBigNumber(500));
  })

  describe('addProtocolAdapter', () => {
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

  describe('removeProtocolAdapter', () => {
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

  describe('addTokenAdapter', () => {
    setup()

    it('Should revert if caller is not a protocol adapter', async () => {
      await expect(registry.addTokenAdapter(ADDRESS_ONE)).to.be.revertedWith('!exists')
    })

    it('Should revert if contract does not expose underlying() and token() functions', async () => {
      await registry.addProtocolAdapter(approvedProtocol.address);
      await expect(registry.connect(approvedProtocol).addTokenAdapter(ADDRESS_ONE)).to.be.reverted
    })

    it('Should allow protocol adapters to add token adapters', async () => {
      await expect(registry.connect(approvedProtocol).addTokenAdapter(adapter.address))
        .to.emit(registry, 'TokenAdapterAdded')
        .withArgs(adapter.address, 1, ADDRESS_ONE, ADDRESS_TWO)
        .to.emit(registry, 'TokenSupportAdded')
        .withArgs(ADDRESS_ONE)
    })
    
    it('Should add underlying to supportedTokens if it is new', async () => {
      expect(await registry.getSupportedTokens()).to.deep.eq([ ADDRESS_ONE ])
    })
    
    it('Should add adapter to tokenAdapters', async () => {
      expect(await registry.getAdaptersList(ADDRESS_ONE)).to.deep.eq([ adapter.address ])
    })

    it('Should map wrapper token to adapter', async () => {
      expect(await registry.getAdapterForWrapperToken(ADDRESS_TWO)).to.eq(adapter.address)
    })

    it('Should revert if wrapper is already mapped to an adapter', async () => {
      await expect(registry.connect(approvedProtocol).addTokenAdapter(adapter.address)).to.be.revertedWith('adapter exists')
    })
    
    it('Should not change supportedTokens if underlying token is not new', async () => {
      await expect(registry.connect(approvedProtocol).addTokenAdapter(adapter1.address))
        .to.emit(registry, 'TokenAdapterAdded')
        .withArgs(adapter1.address, 1, ADDRESS_ONE, ADDRESS_THREE)
        .to.not.emit(registry, 'TokenSupportAdded')
      expect(await registry.getSupportedTokens()).to.deep.eq([ ADDRESS_ONE ])
      expect(await registry.getAdaptersList(ADDRESS_ONE)).to.deep.eq([ adapter.address, adapter1.address ])
      expect(await registry.getAdapterForWrapperToken(ADDRESS_THREE)).to.eq(adapter1.address)
    })
  })

  describe('removeTokenAdapter', () => {
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

    it('Should allow owner to remove any token adapter', async () => {
      await expect(registry.removeTokenAdapter(adapter.address))
        .to.emit(registry, 'TokenAdapterRemoved')
        .withArgs(adapter.address, 1, ADDRESS_ONE, ADDRESS_TWO)
        .to.not.emit(registry, 'TokenSupportRemoved')
    })

    it('Should remove mapping from wrapper to adapter', async () => {
      expect(await registry.getAdapterForWrapperToken(ADDRESS_TWO)).to.eq(constants.AddressZero)
    })

    it('Should remove adapter from list of adapters for underlying', async () => {
      expect(await registry.getAdaptersList(ADDRESS_ONE)).to.deep.eq([adapter1.address])
    })

    it('Should not remove underlying from supported tokens if there are other adapters for it', async () => {
      expect(await registry.getSupportedTokens()).to.deep.eq([ ADDRESS_ONE ])
    })

    it('Should allow protocol adapter to remove token adapters it registered', async () => {
      await expect(registry.connect(approvedProtocol).removeTokenAdapter(adapter1.address))
        .to.emit(registry, 'TokenAdapterRemoved')
        .withArgs(adapter1.address, 1, ADDRESS_ONE, ADDRESS_THREE)
        .to.emit(registry, 'TokenSupportRemoved')
        .withArgs(ADDRESS_ONE)
      expect(await registry.getAdapterForWrapperToken(ADDRESS_THREE)).to.eq(constants.AddressZero)
      expect(await registry.getAdaptersList(ADDRESS_ONE)).to.deep.eq([])
    })

    it('Should remove underlying from supported tokens if there are no other adapters for it', async () => {
      expect(await registry.getSupportedTokens()).to.deep.eq([])
    })
  })

  // describe('getProtocolAdapters', () => {

  // })
})