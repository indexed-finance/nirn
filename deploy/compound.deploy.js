module.exports = async function deployCompoundProtocolAdapter(hre) {
  const { getNamedAccounts, deployments } = hre
  const { deployer } = await getNamedAccounts()
  const registry = await deployments.get('AdapterRegistry')
  await deployments.deploy('CompoundProtocolAdapter', {
    from: deployer,
    gasLimit: 8000000,
    args: [registry.address]
  })
}

module.exports.tags = ['Protocols', 'Compound']