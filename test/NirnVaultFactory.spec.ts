import { defaultAbiCoder, keccak256, solidityKeccak256 } from "ethers/lib/utils";
import { expect } from "chai";
import { BigNumber, constants, ContractTransaction } from "ethers";
import { waffle } from "hardhat";
import { AdapterRegistry, TestAdapter, TestNirnVault, TestERC20, TestVault, CallForwarder, TestRewardsSeller, NirnVaultFactory, TestProxyManager, NirnVault } from "../typechain"
import { deployContract, getContract } from "./shared";
import { deployTestAdaptersAndRegistry, deployTestERC20, deployTestWrapperAndAdapter } from "./shared/fixtures";

const sha3 = (value: string) => {
  const buf = value.slice(0, 2) === '0x'
    ? Buffer.from(value.slice(2), 'hex')
    : Buffer.from(value)
  return keccak256(buf);
}

const erc20VaultImplementationId = sha3('NirnVault.sol')
const ethVaultImplementationId = sha3('EthNirnVault.sol')

describe('NirnVaultFactory', () => {
  const [wallet, wallet1, rewardsSeller, feeRecipient, protocolAdapter] = waffle.provider.getWallets()

  let underlying: TestERC20
  let proxyManager: TestProxyManager
  let vaultImplementation: NirnVault
  let registry: AdapterRegistry
  let vault: TestNirnVault
  let adapter1: TestAdapter
  let adapter2: TestAdapter
  let wrapper1: TestVault
  let wrapper2: TestVault
  let factory: NirnVaultFactory

  beforeEach(async () => {
    ({
      underlying,
      adapter1,
      adapter2,
      wrapper1,
      wrapper2,
      registry
    } = await deployTestAdaptersAndRegistry(undefined, undefined, undefined, false))
    vaultImplementation = await deployContract('NirnVault', registry.address, constants.AddressZero)
    proxyManager = await deployContract('TestProxyManager')
    await proxyManager.addImplementation(erc20VaultImplementationId, vaultImplementation.address)
    await proxyManager.addImplementation(ethVaultImplementationId, vaultImplementation.address)
    factory = await deployContract('NirnVaultFactory', proxyManager.address, registry.address)
    await registry.addVaultFactory(factory.address)
  })

  describe('Constructor', () => {
    it('Should set proxyManager', async () => {
      expect(await factory.proxyManager()).to.eq(proxyManager.address)
    })

    it('Should set registry', async () => {
      expect(await factory.registry()).to.eq(registry.address)
    })
  })

  describe('approveToken()', () => {
    it('Should be reverted if caller is not owner', async () => {
      await expect(
        factory.connect(wallet1).approveToken(constants.AddressZero)
      ).to.be.revertedWith('Ownable: caller is not the owner')
    })

    it('Should revert if address is null', async () => {
      await expect(
        factory.approveToken(constants.AddressZero)
      ).to.be.revertedWith('null address')
    })

    it('Should add token to approvedTokens and isTokenApproved', async () => {
      await expect(factory.approveToken(underlying.address))
        .to.emit(factory, 'TokenApproved')
        .withArgs(underlying.address)
      expect(await factory.isTokenApproved(underlying.address)).to.be.true
      expect(await factory.getApprovedTokens()).to.deep.eq([underlying.address])
    })

    it('Should revert if token already approved', async () => {
      await factory.approveToken(underlying.address)
      await expect(
        factory.approveToken(underlying.address)
      ).to.be.revertedWith('already approved')
    })
  })

  describe('setDefaultFeeRecipient()', () => {
    it('Should be reverted if caller is not owner', async () => {
      await expect(
        factory.connect(wallet1).setDefaultFeeRecipient(constants.AddressZero)
      ).to.be.revertedWith('Ownable: caller is not the owner')
    })

    it('Should revert if address is null', async () => {
      await expect(
        factory.setDefaultFeeRecipient(constants.AddressZero)
      ).to.be.revertedWith('null address')
    })

    it('Should set default and emit SetDefaultFeeRecipient', async () => {
      await expect(factory.setDefaultFeeRecipient(feeRecipient.address))
        .to.emit(factory, 'SetDefaultFeeRecipient')
        .withArgs(feeRecipient.address)
      expect(await factory.defaultFeeRecipient()).to.eq(feeRecipient.address)
    })
  })

  describe('setDefaultRewardsSeller()', () => {
    it('Should be reverted if caller is not owner', async () => {
      await expect(
        factory.connect(wallet1).setDefaultRewardsSeller(constants.AddressZero)
      ).to.be.revertedWith('Ownable: caller is not the owner')
    })

    it('Should revert if address is null', async () => {
      await expect(
        factory.setDefaultRewardsSeller(constants.AddressZero)
      ).to.be.revertedWith('null address')
    })

    it('Should set default and emit SetDefaultRewardsSeller', async () => {
      await expect(factory.setDefaultRewardsSeller(rewardsSeller.address))
        .to.emit(factory, 'SetDefaultRewardsSeller')
        .withArgs(rewardsSeller.address)
      expect(await factory.defaultRewardsSeller()).to.eq(rewardsSeller.address)
    })
  })

  describe('computeVaultAddress()', () => {
    it('Should return address computed by proxy manager for weth', async () => {
      expect(
        await factory.computeVaultAddress('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2')
      ).to.eq(
        await proxyManager.computeProxyAddressManyToOne(factory.address, ethVaultImplementationId, sha3(`0x000000000000000000000000C02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2`))
      )
    })

    it('Should return address computed by proxy manager for non-weth erc20', async () => {
      const underlyingHash = sha3(`0x${underlying.address.slice(2).padStart(64, '0')}`)
      expect(
        await factory.computeVaultAddress(underlying.address)
      ).to.eq(
        await proxyManager.computeProxyAddressManyToOne(factory.address, erc20VaultImplementationId, underlyingHash)
      )
    })
  })

  describe('deployVault()', () => {
    it('Should revert if token not approved', async () => {
      await expect(
        factory.deployVault(underlying.address)
      ).to.be.revertedWith('!approved')
    })

    it('Should revert if insufficient # of adapters registered', async () => {
      await factory.approveToken(underlying.address)
      await expect(
        factory.deployVault(underlying.address)
      ).to.be.revertedWith('insufficient adapters')
    })

    it('Should revert if defaultRewardsSeller not set', async () => {
      await registry.addProtocolAdapter(protocolAdapter.address)
      await registry.connect(protocolAdapter).addTokenAdapter(adapter1.address)
      await registry.connect(protocolAdapter).addTokenAdapter(adapter2.address)
      await factory.approveToken(underlying.address)
      await factory.setDefaultFeeRecipient(feeRecipient.address)
      await expect(factory.deployVault(underlying.address))
        .to.be.revertedWith('null default')
    })

    it('Should revert if defaultFeeRecipient not set', async () => {
      await registry.addProtocolAdapter(protocolAdapter.address)
      await registry.connect(protocolAdapter).addTokenAdapter(adapter1.address)
      await registry.connect(protocolAdapter).addTokenAdapter(adapter2.address)
      await factory.approveToken(underlying.address)
      await factory.setDefaultRewardsSeller(rewardsSeller.address)
      await expect(factory.deployVault(underlying.address))
        .to.be.revertedWith('null default')
    })

    it('Should deploy vault if approved and enough adapters', async () => {
      await registry.addProtocolAdapter(protocolAdapter.address)
      await registry.connect(protocolAdapter).addTokenAdapter(adapter1.address)
      await registry.connect(protocolAdapter).addTokenAdapter(adapter2.address)
      await factory.approveToken(underlying.address)
      await factory.setDefaultRewardsSeller(rewardsSeller.address)
      await factory.setDefaultFeeRecipient(feeRecipient.address)
      const vaultAddress = await factory.computeVaultAddress(underlying.address)
      await expect(factory.deployVault(underlying.address))
        .to.emit(registry, 'VaultAdded')
        .withArgs(underlying.address, vaultAddress)
        .to.emit(proxyManager, 'DeployedProxy')
        .withArgs(erc20VaultImplementationId, vaultAddress)
      const vault = await getContract<NirnVault>(vaultAddress, 'NirnVault')
      expect(await vault.rewardsSeller()).to.eq(rewardsSeller.address)
      expect(await vault.feeRecipient()).to.eq(feeRecipient.address)
      expect(await vault.underlying()).to.eq(underlying.address)
    })
  })
})