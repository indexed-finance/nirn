# **Token Adapters**

Token adapters are the points of contact between a vault, or any other contract using Nirn, and the supported lending protocols. They create a standard interface by which any contract can use any supported protocol without understanding the details of how it handles deposits, withdrawals or conversion between underlying and wrapped amounts.

## Risks

In order to ensure the security of vaults, it is critically important that the conversion from a wrapped balance to an underlying balance **always be precisely the amount of tokens that can be instantly liquidated** by burning the wrapped tokens, and that this conversion rate **can never be inflated by an attacker who is then able to withdraw the tokens used to inflate it**.

That last one is very important -- if an attacker can inflate the conversion rate, but they are unable to withdraw the tokens used for the inflation, then there is no systemic risk. If, however, it is possible to use flash loans or some other mechanism to inflate a conversion rate and then deflate it without suffering a net loss, that poses a major risk to our system.

Additionally, converted amounts should never be extrapolated to anything else. For example, if we have a vault with 50% of its assets in a Compound token, it **must not** extrapolate the converted value of its cTokens to estimate the total value of the vault. This would be a critical vulnerability.

## Design Principles

### Precision

**Conversion**

Adapters must always report precise values for conversion rates. Queries for `toWrappedAmount` should always return the exact amount of the wrapper token that can be minted for a given amount of underlying tokens, and queries for `toUnderlyingAmount` should always return the exact amount of underlying tokens that can be redeemed by burning a given amount of wrapped tokens.

This often requires that the adapter handle math which is usually done by the supported protocol internally; for example, Compound's exchange rate for cTokens is dependent upon the accrual of interest within the token contract, but its external view functions do not account for pending interest, so cToken adapters must calculate pending interest in order to use the precise exchange rate.

**Dust**

If it is impossible to avoid dust without a second transaction, it is acceptable for the deposit and withdrawal functions to accumulate a maximum of 1 wei of dust in each deposit or withdrawal, and dust should be accumulated instead of using a second transfer when it can be limited to a maximum of 1 wei.

**Interest Rates**

APRs are inherently imprecise because they are annualized from short-term interest rates, but adapters should always use precise values for the short-term interest rate before annualizing when possible.

When necessary, precision in the short-term rate may be sacrificed to preserve accuracy. For example, the precise per-block interest for lenders can be queried from Compound, but Compound also distributes rewards in its governance token COMP. Because Nirn vaults will not have the ability to instantaneously sell COMP as they are earned, and because there is no direct conversion rate between COMP and any other underlying asset, this means it is impossible to obtain a *precise* APR for the COMP rewards, but including those rewards in the adapter's reported APR by using a price oracle will give a more *accurate* result.

### Standardization

Adapters must provide an interface which requires **zero** specific knowledge about the supported protocol. With most lending protocols, the caller only needs to approve the adapter to spend the underlying token and the wrapped token, but some protocols do not use wrapper tokens, or have governance rewards which can only be claimed by the depositor. In those cases, the adapter must itself be a wrapper for the lending protocol, holding assets for depositors and recording their ownership in such a way as to not dilute earned interest among multiple depositors.

**Example #1: DyDx**

DyDx has lending markets but does not utilize wrapper tokens. If the adapter for DyDx deposited assets on behalf of the caller, the caller would then need to execute specific functions on the DyDx contract to give the adapter permission to withdraw the assets, meaning the caller has specific knowledge about DyDx and an adapter is not necessary. For DyDx, the adapter is itself an ERC20 which wraps DyDx positions. This ensures that user balances are tracked accurately and the mapping from wrappers to adapters in the registry is valid.

**Example #2: Aave V2**

Aave V2 has lending markets with wrapper tokens, and it distributes governance rewards to depositors in the form of stkAave. In order to claim stkAave, the caller (or an account designated by the caller through a specific function) must call a function on Aave's incentives contract. This is unlike Compound, which allows any account to trigger a disbursal of rewards to any other account. Additionally, stkAAVE does not have significant liquidity on on-chain markets, and must be redeemed for AAVE via a specific process involving cooldowns and withdrawals. In order to maintain standardization, the Aave V2 adapter deploys per-user modules that hold assets on behalf of depositors and manage claiming of stkAAVE and redemption to AAVE.

> **TODO:** See if it makes more sense to manage this using a dividends pattern

# Adapter Interfaces

There are two interfaces for token adapters - one for lending non-WETH ERC20s, and one for lending either Ether or Wrapped Ether.

<!-- The contracts `AbstractErc20Adapter` and `AbstractEtherAdapter` have been written to simplify the process of writing new adapters. They define several external functions that individual implementations should generally not need to override, with the exception of `getAPR`, `getHypotheticalAPR`, `balanceUnderlying`, `toWrappedAmount` and `toUnderlyingAmount`. -->

## ERC20 Adapter Methods

### `getAPR() returns (uint256)`

Returns the annualized interest or yield rate for the wrapper token.

This function should:
- Return the APR that would be reported currently by the protocol if all pending interest from borrows was accrued.
- Include any additional sources of interest, e.g. from governance token rewards.

### `getHypotheticalAPR(int256 liquidityDelta) returns (uint256)`

Returns the annualized interest or yield rate that the wrapper token would have if `liquidityDelta` underlying tokens were deposited to or withdrawn from it. For lending protocols, this can be calculated by referencing their interest rate models; for yield-aggregators, this can be estimated by diluting its growth.

This function should:
- Return the APR that would be reported currently by the protocol if all pending interest from borrows was accrued and a deposit or withdrawal in the amount of `liquidityDelta` was made.
- Include any additional sources of interest, e.g. from governance token rewards.

### `balanceUnderlying() returns (uint256)`

Returns the value of the caller's balance in the wrapper token in terms of the underlying token; i.e. the instantly liquidatable value of `balanceWrapped` if the caller were to withdraw now.

### `balanceWrapped() returns (uint256)`

Returns the balance of the caller in the wrapper token.

### `underlying() returns (address)`

Returns the address of the underlying asset.

### `token() returns (address)`

Returns the address of the wrapped asset, or the underlying asset if the market has no wrapped asset.

### `deposit(uint256 amountUnderlying) returns (uint256 amountMinted)`

Deposits `amountUnderlying` of the underlying asset into the wrapper.

This function should:
- Transfer `amountUnderlying` of `underlying` from the caller to the adapter.
- Deposit `amountUnderlying` into the lending market.
- Transfer any minted wrapper tokens back to the caller.**\***
- Return the amount of wrapper tokens minted, or the underlying amount if there is no minted token.

This function assumes that the caller has already given the adapter an ERC20 allowance of `amountUnderlying` for the underlying token.

**\*** If the lending market does not use wrapper tokens, or if it has additional rewards that only the depositor can trigger release of, this function should instead hold the assets for the caller and record its ownership of the deposit in a manner which does not cause its earnings to be diluted among other depositors using the adapter.

### `withdraw(uint256 amountToken) external returns (uint256 amountReceived)`

Burns `amountToken` of the wrapped asset and transfers the redeemed underlying tokens to the caller.

This function should:
- Transfer `amountToken` of the wrapped asset from the caller to the adapter.
- Burn `amountToken` of the wrapped asset.
- Transfer all redeemed underlying tokens to the caller.

This function assumes that the caller has already given the adapter an ERC20 allowance of `amountToken` for the wrapped token.


### `withdrawUnderlying(uint256 amountUnderlying) external returns (uint256 amountBurned)`

Burns whatever amount of the wrapped asset is needed to redeem `amountUnderlying` of the underlying token and transfers `amountUnderlying` underlying tokens to the caller.

This function should:
- Calculate `amountBurned` as the amount of the wrapped token worth `amountUnderlying`.
- Transfer `amountBurned` of the wrapped asset from the caller to the adapter.
- Burn `amountBurned` of the wrapped asset.
- Transfer `amountUnderlying` underlying tokens to the caller.

This function assumes that the caller has already given the adapter an ERC20 allowance of `amountBurned` for the wrapped token.

## ETH Adapter Methods

ETH adapter must always use WETH as the underlying asset address, regardless of whether the lending market uses Ether or Wrapped Ether. The behavior of the deposit and withdraw functions must remain consistent with that of the ERC20 adapters, transferring WETH to/from the caller. Corresponding functions must be defined for each deposit/withdraw method which allow funds to be deposited or withdrawn using Ether -- these functions must use the `AsETH` suffix.

### `depositETH() external payable returns (uint256 amountMinted)`

Same as `deposit`, except `msg.value` is used instead of `amountUnderlying` and WETH is not transferred from the caller. If the wrapper takes WETH, the function should call `weth.deposit{value:msg.value}()`

### `withdrawAsETH(uint256 amountToken) external returns (uint256 amountReceived)`

Same as `withdraw`, except the caller should be sent Ether instead of WETH. If the wrapper returns ETH, the contract must call `weth.withdraw(amountReceived)`.

### `withdrawUnderlyingAsETH(uint256 amountUnderlying) external returns (uint256 amountBurned)`

Same as `withdrawUnderlying`, except the caller should be sent Ether instead of WETH. If the wrapper returns ETH, the contract must call `weth.withdraw(amountUnderlying)`.