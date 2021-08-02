module.exports = async function deployCompoundProtocolAdapter(hre) {
  const { getNamedAccounts, deployments } = hre
  const { deployer } = await getNamedAccounts()
  const registry = await deployments.get('AdapterRegistry')
  const proxyManager = '0xd23dedc599bd56767e42d48484d6ca96ab01c115'
  await deployments.deploy('NirnVaultFactory', {
    from: deployer,
    gasLimit: 2500000,
    args: [proxyManager, registry.address],
  })
}

module.exports.tags = ['Factory']