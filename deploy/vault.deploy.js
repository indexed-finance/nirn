module.exports = async function deployCompoundProtocolAdapter(hre) {
  const { getNamedAccounts, deployments } = hre
  const { deployer } = await getNamedAccounts()
  const registry = await deployments.get('AdapterRegistry')
  const batcher = await deployments.get('BatchRebalancer')
  await deployments.deploy('NirnVault', {
    from: deployer,
    gasLimit: 6500000,
    args: [registry.address, batcher.address],
  })
}

module.exports.tags = ['Vault']