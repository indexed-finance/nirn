# **Token Adapters**

Adapters are the points of contact between a vault, or any other contract using Nirn, and the supported lending protocols. They create a standard interface by which any contract can use any supported protocol without understanding the details of how it handles deposits, withdrawals or conversion between underlying and wrapped amounts.

There are two interfaces for these adapters - one for tokens that wrap non-WETH ERC20s, and one for tokens that wrap either Ether or Wrapped Ether.

The contracts `AbstractErc20Adapter` and `AbstractEtherAdapter` have been written to simplify the process of writing new adapters. They define several external functions that individual implementations should generally not need to overwrite, with the exception of `getAPR`, `getHypotheticalAPR`, `balanceUnderlying`, `toWrappedAmount` and `toUnderlyingAmount`.

## Requirements

ERC20 adapters must fulfill the following requirements:

### Precision

**Conversion Rates**

Adapters must always report precise values for conversion rates. Queries for `toWrappedAmount` should always return the exact amount of the wrapper token that can be minted for a given amount of underlying tokens, and queries for `toUnderlyingAmount` should always return the exact amount of underlying tokens that can be redeemed by burning a given amount of wrapped tokens.

This often requires that the adapter handle math which is usually done by the supported protocol internally; for example, Compound's exchange rate for cTokens is dependent upon the accrual of interest within the token contract, but its external view functions do not account for pending interest, so cToken adapters must calculate pending interest in order to use the precise exchange rate. If it is impossible to avoid dust without a second transaction, it is acceptable for the deposit and withdrawal functions to accumulate a maximum of 1 wei of dust in each deposit or withdrawal, and dust should be accumulated instead of using a second transfer when it can be limited to a maximum of 1 wei.

**Interest Rates**

APRs are inherently imprecise because they are annualized from short-term interest rates, but adapters should always use precise values for the short-term interest rate when possible, and annualize from there. When necessary, precision in the short-term rate may be sacrificed to preserve accuracy. For example, the precise per-block interest rate for lenders can be queried from Compound, and it represents the real interest rate that lenders earn from borrowers for the block in which the query was made, but Compound also distributes rewards in its governance token COMP. Because Nirn vaults will not have the ability to instantaneously sell COMP every block exactly at the time they are earned, and because there is no direct conversion rate between COMP and any other underlying asset, this means it is impossible to obtain a *precise* APR for the COMP rewards, but including those rewards in the adapter's reported APR by using a price oracle will result in a more *accurate* APR.

### Standardization

Adapters must provide an interface which requires zero specific knowledge about the supported protocol. With most lending protocols, the caller only needs to approve the adapter to spend the underlying token and the wrapped token, but some protocols do not use wrapper tokens, or have governance rewards which can only be claimed by the depositor. In those cases, the adapter must itself be a wrapper for the lending protocol, holding assets for depositors and recording their ownership in such a way as to not dilute earned interest among multiple depositors.

**Example #1: DyDx**

DyDx has lending markets but does not utilize wrapper tokens. If the adapter for DyDx deposited assets on behalf of the caller, the caller would then need to execute specific functions on the DyDx contract to give the adapter permission to withdraw the assets, meaning the caller has specific knowledge about DyDx and an adapter is not necessary. In this case, the adapter must wrap the functionality of DyDx and hold the position on behalf of the user. Because interest is accrued per account, the DyDx adapter uses separate module contracts for each user to ensure their balances and earnings are completely separated.

**Example #2: Aave V2**

Aave V2 has lending markets with wrapper tokens, and it distributes governance rewards to depositors in the form of stkAave. In order to claim stkAave, the caller (or an account designated by the caller through a specific function) must call a function on Aave's incentives contract. This is unlike Compound, which allows any account to trigger a disbursal of rewards to any other account. Additionally, stkAAVE does not have significant liquidity on on-chain markets, and must be redeemed for AAVE via a specific process involving cooldowns and withdrawals. In order to maintain standardization, the Aave V2 adapter deploys per-user modules that hold assets on behalf of depositors and manage claiming of stkAAVE and redemption to AAVE.

> **TODO:** See if it makes more sense to manage this using a dividends pattern

# ERC20 Adapter Methods

## Internal Methods

The following internal methods must be implemented by contracts that inherit `AbstractErc20Adapter`.

#### `_approve() internal`

Gives infinite approval to the recipient of deposits so that the adapter does not need to call approve in every deposit. For ETH adapters where the wrapper receives Ether instead of Wrapped Ether, this should do nothing.

### `_mint(uint256 amountUnderlying) internal returns (uint256 amountMinted)`

### `_burn(uint256 amountToken) internal returns (uint256 amountReceived)`

### `_burnUnderlying(uint256 amountUnderlying) internal returns (uint256 amountBurned)`

## External Methods

#### `getAPR() returns (uint256)` **(Requires Override)**

Returns the annualized interest or yield rate for the wrapper token.

This function should:
- Return the APR that would be reported currently by the protocol if all pending interest from borrows was accrued.
- Include any additional sources of interest, e.g. from governance token rewards.

#### `getHypotheticalAPR(int256 liquidityDelta) returns (uint256)` **(Requires Override)**

Returns the annualized interest or yield rate that the wrapper token would have if `liquidityDelta` underlying tokens were deposited to or withdrawn from it. For lending protocols, this can be calculated by referencing their interest rate models; for yield-aggregators, this can be estimated by diluting its growth.

This function should:
- Return the APR that would be reported currently by the protocol if all pending interest from borrows was accrued and a deposit or withdrawal in the amount of `liquidityDelta` was made.
- Include any additional sources of interest, e.g. from governance token rewards.

#### `balanceUnderlying() returns (uint256)` **(Requires Override)**

Returns the value of the caller's balance in the wrapper token in terms of the underlying token; i.e. the instantly liquidatable value of `balanceWrapped`.

#### `balanceWrapped() returns (uint256)`

Returns the balance of the caller in the wrapper token.

#### `underlying() returns (address)`

Returns the address of the underlying asset.

#### `token() returns (address)`

Returns the address of the wrapper asset.

#### `deposit(uint256 amountUnderlying) returns (uint256 amountMinted)`

Deposits `amountUnderlying` of the underlying asset into the wrapper.

This function should:
- Transfer `amountUnderlying` of `underlying` from the caller to the adapter.
- Deposit `amountUnderlying` into the lending market.
- Transfer any minted wrapper tokens back to the caller.
- Return the amount of wrapper tokens minted, or the underlying amount if there is no minted token.

If the lending market does not use wrapper tokens, or if it has additional rewards that only the depositor can trigger release of, this function should instead hold the assets for the caller and record its ownership of the deposit in a manner which does not cause its earnings to be diluted among other depositors using the adapter.

This function assumes that the caller has already given the adapter an ERC20 allowance of `amountUnderlying` for the underlying token.

#### `withdraw(uint256 amountToken) external returns (uint256 amountReceived)`

Burns `amountToken` of the wrapped asset and transfers the redeemed underlying tokens to the caller.

This function should:
- Transfer `amountToken` of the wrapped asset from the caller to the adapter.
- Burn `amountToken` of the wrapped asset.
- Transfer all redeemed underlying tokens to the caller.

This function assumes that the caller has already given the adapter an ERC20 allowance of `amountToken` for the wrapped token.


#### `withdrawUnderlying(uint256 amountUnderlying) external returns (uint256 amountBurned)`

Burns whatever amount of the wrapped asset is needed to redeem `amountUnderlying` of the underlying token and transfers `amountUnderlying` underlying tokens to the caller.

This function should:
- Calculate `amountBurned` as the amount of the wrapped token worth `amountUnderlying`.
- Transfer `amountBurned` of the wrapped asset from the caller to the adapter.
- Burn `amountBurned` of the wrapped asset.
- Transfer `amountUnderlying` underlying tokens to the caller.

This function assumes that the caller has already given the adapter an ERC20 allowance of `amountBurned` for the wrapped token.

## ETH Adapter Methods

An ETH adapter should always set the underlying asset to the address of WETH, regardless of whether the wrapper uses ETH or WETH. The behavior of the deposit and withdraw functions in the ERC20 adapter methods should remain consistent, transferring WETH to/from the caller. If the wrapper uses Ether for deposits and withdrawals, the adapter should handle the deposit/withdraw calls to WETH.

#### `_afterReceiveETH(uint256 amount) internal`

Called in `depositETH` before running the internal `_mint` function. Should convert the received ETH if the wrapper takes WETH, otherwise do nothing.

#### `_afterReceiveWETH(uint256 amount) internal`

Called in `deposit` before running the internal `_mint` function. Should convert the received WETH to ETH if the wrapper takes ETH, otherwise do nothing.

#### `_beforeSendETH(uint256 amount) internal`

Called in `withdrawAsETH` and `withdrawUnderlyingAsETH` after calling the internal `_burn` function. If the wrapper returns WETH, should withdraw ETH, otherwise do nothing.

#### `_beforeSendWETH(uint256 amount) internal`

Called in `withdraw` and `withdrawUnderlying` after calling the internal `_burn` function. If the wrapper returns ETH, should mint WETH, otherwise do nothing.

#### `depositETH() external payable returns (uint256 amountMinted)`

Same as `deposit`, except `msg.value` is used instead of `amountUnderlying` and WETH is not transferred from the caller. If the wrapper takes WETH, the function should call `weth.deposit{value:msg.value}`

#### `withdrawAsETH(uint256 amountToken) external returns (uint256 amountReceived)`

Same as `withdraw`, except the caller should be sent Ether instead of WETH. If the wrapper returns ETH, the function should call `weth.withdraw(amountReceived)`.

#### `withdrawUnderlyingAsETH(uint256 amountUnderlying) external returns (uint256 amountBurned)`

Same as `withdrawUnderlying`, except the caller should be sent Ether instead of WETH. If the wrapper returns ETH, the function should call `weth.withdraw(amountReceived)`.