module.exports = async function deployRegistry(hre) {
  const {
    getNamedAccounts,
    deployments: { deploy }
  } = hre;
  const { deployer } = await getNamedAccounts()
  await deploy('AdapterRegistry', {
    from: deployer,
    gasLimit: 4000000
  })
}

module.exports.tags = ['Registry']