const {getContractAddress} = require("@ethersproject/address")

module.exports = async function deployFulcrumProtocolAdapter(hre) {
  const { getNamedAccounts, deployments, ethers } = hre
  const [wallet] = await ethers.getSigners()
  const nonce = await wallet.getTransactionCount()
  // const nextAddress = getContractAddress({ from: wallet.address, nonce: nonce + 1 })
  const { deployer } = await getNamedAccounts()
  const registry = await ethers.getContract('AdapterRegistry')
  // await registry.addProtocolAdapter(nextAddress)
  await deployments.deploy('FulcrumProtocolAdapter', {
    from: deployer,
    gasLimit: 7000000,
    args: [registry.address]
  })
}

module.exports.tags = ['Protocols', "Fulcrum"]