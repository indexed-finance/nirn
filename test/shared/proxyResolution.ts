const proxyImplementations: Record<string, string> = {};

export function addProxy(address: string, contractName: string) {
  proxyImplementations[address.toLowerCase()] = contractName;
}

export function proxyResolver(tx: any) {
  console.log('running resolver')
  const name = proxyImplementations[tx.to.toLowerCase()];
  if (name) {
    return name;
  }
}