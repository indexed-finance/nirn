module.exports = async function deployAaveV2ProtocolAdapter(hre) {
  const { getNamedAccounts, deployments } = hre
  const { deployer } = await getNamedAccounts()
  const registry = await deployments.get('AdapterRegistry')
  await deployments.deploy('AaveV2ProtocolAdapter', {
    from: deployer,
    gasLimit: 7000000,
    args: [registry.address]
  })
}

module.exports.tags = ['Protocols', 'AaveV2']