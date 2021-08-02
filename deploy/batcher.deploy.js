module.exports = async function deployAaveV1ProtocolAdapter(hre) {
  const { getNamedAccounts, deployments } = hre
  const { deployer } = await getNamedAccounts()
  const registry = await deployments.get('AdapterRegistry')
  await deployments.deploy('BatchRebalancer', {
    from: deployer,
    gasLimit: 1000000,
    args: [registry.address]
  })
}

module.exports.tags = ['Batcher']