module.exports = async function deployAaveV1ProtocolAdapter(hre) {
  const { getNamedAccounts, deployments } = hre
  const { deployer } = await getNamedAccounts()
  const registry = await deployments.get('AdapterRegistry')
  await deployments.deploy('AaveV1ProtocolAdapter', {
    from: deployer,
    gasLimit: 4000000,
    args: [registry.address]
  })
}

module.exports.tags = ['Protocols', 'AaveV1']