# Nirn/Indexed Earn: A Compositional, Permissionless, Extensible Yield Aggregator

Nirn is a permissionless yield aggregator that optimizes interest rates for lenders across several lending protocols. The central idea is to allocate capital among multiple lending protocols in whatever ratios result in the greatest net interest rate.

Conceptually, Nirn is similar to Yearn's [iTokens](https://github.com/yearn/itoken), Rari's [yield pools](https://github.com/Rari-Capital/rari-yield-pool-contracts) and [Idle Finance](https://github.com/Idle-Labs/idle-contracts); however, it has a number of key distinctions:

Each Nirn vault can split its capital among several lending markets, and does not use permissioned rebalancer accounts to determine how it is split. Instead, optimal allocations can be calculated off-chain by anyone and suggested to the vault contract, which then verifies that the suggested rebalance would increase the vault's net interest rate. This both prevents any reliance on the developers of Indexed and ensures that if a better allocation of capital is possible, anyone can make the vault use it.

Whitepaper available [here](https://github.com/indexed-finance/nirn-whitepaper/blob/main/Nirn_Whitepaper.pdf) (current version V1.0, updated 4th August 2021).

# Testing

## Set Up **(Important)**

This repository exclusively executes test against forks of mainnet Ethereum. In order to run the tests, you will need to add an API key for an RPC provider with archive capabilities.

Alchemy offers this as part of their free tier, so it is recommended that you create an account with them.

You can do so [here](https://auth.alchemyapi.io/signup).

Once you have your API key, create a .env file with the following line:

```
ALCHEMY_API_KEY="YOUR_API_KEY_HERE"
```

If you use a provider other than Alchemy, you will need to modify hardhat.config.ts to use a different RPC url.

**Important Note:** The first time you run tests, they will take quite a while to run. This is not an error - hardhat simply has to request a lot of data from the archive node in order to run the tests against a mainnet fork. Subsequent tests will be much faster because the data will be cached.

## Running Tests

The first time you run tests, you must run `yarn compile` first, otherwise the test script will fail because the `typechain/` directory will not exist and typescript will throw an error.

**Run all tests**
> `yarn test`

**Run specific test**

> `yarn test ./test/test_file_path`

Because this repository has tests for (almost) every specific token for each supported protocol, it is usually better to run tests individually.

**Compile contracts and typescript interfaces**
> `yarn compile`

Compiles artifacts into `artifacts/` and generates typechain interfaces in `typechain/`

**Run solhint**

> `yarn lint`

## Smart Contracts

### Adapter Registry

The adapter registry records all protocol and token adapters. It is used by vaults to validate that token adapters are approved, used by protocol adapters to register token adapters they have deployed, and can be used for other meta queries both off-chain and on-chain.

### Protocol Adapters

Protocol adapters are used to map out all of a protocol's lending markets, determine which are still active, deploy token adapters for each market and record them in a global registry.

Currently supports:
- Aave V1
- Aave V2
- Compound
- Cream
- Iron Bank
- Fulcrum (bzx)

Upcoming support:
- DyDx
- Rari Fuse

### Token Adapters

Because lending protocols are all different, a single contract can not interact with them all directly without prior knowledge of which protocols to support. Token adapters allow vaults to interact with all of Nirn's supported protocols by creating a standard interface which abstracts all of the specific behavior needed to use them. This makes Nirn modular and future-proof: if new protocols are introduced with different interfaces, this system can support them if new adapters are added.

In addition to basic interactions with lending protocols, token adapters are responsible for handling any secondary rewards which accrue to depositors, such as COMP or stkAAVE.

<!-- Most lending protocols have wrapper tokens which accrue value as a result of an increasing conversion rate between the wrapper and the underlying token, as opposed to giving lenders interest in the form of a separate token or modifying their balance in the wrapper. In order to give other contracts insight into their balances, token adapters expose a `balanceUnderlying` function which will return the value of the caller's deposit in terms of the underlying token, usually by querying their balance in the wrapper token and using the protocol's conversion formula. When deposits are made into a protocol with wrapper tokens, the adapter will transfer the underlying token from the caller, mint wrapped tokens and transfer them to the caller; similarly, for these protocols' token adapters, withdrawals transfer the wrapper from the caller, burn them for underlying tokens, and transfer them to the caller. -->

<!-- There are exceptions to this general rule though, and it is important for our system that adapters do not require *any* specific actions from the caller beyond ERC20 approval. -->

[Read more about token adapters](./docs/Token-Adapters.md)


<!-- protocol for comparing interest rates available on lending protocols and yield aggregators; it is a combination interest rate oracle, meta protocol registry and yield optimizer. It works by using two types of adapter: protocol adapters, which map out all of the interest-bearing assets on supported protocols and write them to a global registry, and token adapters, which create a standard interface for interacting with these interest-bearing assets. These two adapter types enable yield aggregation vaults and other smart contracts to find and take advantage of the best interest rates on Ethereum without any protocol-specific logic -->

