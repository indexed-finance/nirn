module.exports = async function deployIronBankProtocolAdapter(hre) {
  const { getNamedAccounts, deployments } = hre
  const { deployer } = await getNamedAccounts()
  const registry = await deployments.get('AdapterRegistry')
  await deployments.deploy('IronBankProtocolAdapter', {
    from: deployer,
    gasLimit: 6000000,
    args: [registry.address]
  })
}

module.exports.tags = ['Protocols', "IronBank"]