# @indexed-finance/apr-oracles

Smart contracts for on-chain APR queries.

Currently supports:
- Aave V1
- Aave V2
- Compound
- Cream
- DyDx
- Fulcrum (bzx)
- Rari Fuse

**Note on Ether**

If a lending pool or other interest-bearing asset is tracked by a protocol, it *must* use the address of WETH for the adapter's underlying token.

## Scripts

`yarn test`

Runs all tests in `test/`

`yarn coverage`

Runs all tests with solidity-coverage and generates a coverage report.

`yarn compile`

Compiles artifacts into `artifacts/` and generates typechain interfaces in `typechain/`

`yarn lint`

Runs solhint against the contracts.
