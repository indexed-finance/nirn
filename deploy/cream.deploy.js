module.exports = async function deployCreamProtocolAdapter(hre) {
  const { getNamedAccounts, deployments } = hre
  const { deployer } = await getNamedAccounts()
  const registry = await deployments.get('AdapterRegistry')
  await deployments.deploy('CreamProtocolAdapter', {
    from: deployer,
    gasLimit: 6000000,
    args: [registry.address]
  })
}

module.exports.tags = ['Protocols', 'Cream']