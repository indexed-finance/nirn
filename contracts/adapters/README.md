# **Token Adapters**

Adapters are the points of contact between a contract using our yield optimization system and the underlying protocols. They create a standard interface by which any contract can use any supported protocol without understanding the details of how it handles deposits, withdrawals or conversion between underlying and wrapped amounts.

There are two interfaces for these adapters - one for tokens that wrap non-WETH ERC20s, and one for tokens that wrap either Ether or Wrapped Ether.

The contracts `AbstractErc20Adapter` and `AbstractEtherAdapter` have been written to simplify the process of writing new adapters. They define several external functions that individual implementations should generally not need to overwrite, with the exception of `getAPR`, `getHypotheticalAPR` and `balanceUnderlying`.

# ERC20 Adapter Methods

## Internal Methods

The following internal methods must be implemented by contracts that inherit `AbstractErc20Adapter`.

#### `function _approve() internal`

Gives infinite approval to the recipient of deposits so that the adapter does not need to call approve in every deposit. For ETH adapters where the wrapper receives Ether instead of Wrapped Ether, this should do nothing.

### `function _mint(uint256 amountUnderlying) internal returns (uint256 amountMinted)`

### `function _burn(uint256 amountToken) internal returns (uint256 amountReceived)`

### `function _burnUnderlying(uint256 amountUnderlying) internal returns (uint256 amountBurned)`

## External Methods

#### `function getAPR() external view returns (uint256)` **(Requires Overwrite)**

Returns the annualized interest or yield rate for the wrapper token.

#### `function getHypotheticalAPR(uint256 _deposit) external view returns (uint256)` **(Requires Overwrite)**

Returns the annualized interest or yield rate that the wrapper token would have if an additional `_deposit` underlying tokens were deposited to it. For lending protocols, this can be calculated by referencing their interest rate models; for yield-aggregators, this can be estimated by diluting its growth.

#### `function balanceUnderlying() external view returns (uint256)` **(Requires Overwrite)**

Returns the value of the caller's balance in the wrapper token in terms of the underlying token; i.e. the instantly liquidatable value of `balanceWrapped`

#### `function underlying() external view returns (address)`

Returns the address of the underlying asset.

#### `function token() external view returns (address)`

Returns the address of the wrapper asset.

#### `function balanceWrapped() external view returns (uint256)`

Returns the balance of the caller in the wrapper token.

#### `function deposit(uint256 amountUnderlying) external returns (uint256 amountMinted)`

Deposits `amountUnderlying` of the underlying asset into the wrapper.

This function should:
- Transfer `amountUnderlying` of `underlying` from the caller to the adapter.
- Deposit `amountUnderlying` into the wrapped protocol.
- Transfer any minted wrapper tokens back to the caller.

This function assumes that the caller has already given the adapter an ERC20 allowance of `amountUnderlying` for the underlying token.

#### `function withdraw(uint256 amountToken) external returns (uint256 amountReceived)`

Burns `amountToken` of the wrapped asset and transfers the redeemed underlying tokens to the caller.

This function should:
- Transfer `amountToken` of the wrapped asset from the caller to the adapter.
- Burn `amountToken` of the wrapped asset.
- Transfer all redeemed underlying tokens to the caller.

This function assumes that the caller has already given the adapter an ERC20 allowance of `amountToken` for the wrapped token.


#### `function withdrawUnderlying(uint256 amountUnderlying) external returns (uint256 amountBurned)`

Burns whatever amount of the wrapped asset is needed to redeem `amountUnderlying` of the underlying token and transfers `amountUnderlying` underlying tokens to the caller.

This function should:
- Calculate `amountBurned` as the amount of the wrapped token worth `amountUnderlying`.
- Transfer `amountBurned` of the wrapped asset from the caller to the adapter.
- Burn `amountBurned` of the wrapped asset.
- Transfer `amountUnderlying` underlying tokens to the caller.

This function assumes that the caller has already given the adapter an ERC20 allowance of `amountBurned` for the wrapped token.

## ETH Adapter Methods

An ETH adapter should always set the underlying asset to the address of WETH, regardless of whether the wrapper uses ETH or WETH. The behavior of the deposit and withdraw functions in the ERC20 adapter methods should remain consistent, transferring WETH to/from the caller. If the wrapper uses Ether for deposits and withdrawals, the adapter should handle the deposit/withdraw calls to WETH.

#### `function _afterReceiveETH(uint256 amount) internal`

Called in `depositETH` before running the internal `_mint` function. Should convert the received ETH if the wrapper takes WETH, otherwise do nothing.

#### `function _afterReceiveWETH(uint256 amount) internal`

Called in `deposit` before running the internal `_mint` function. Should convert the received WETH to ETH if the wrapper takes ETH, otherwise do nothing.

#### `function _beforeSendETH(uint256 amount) internal`

Called in `withdrawAsETH` and `withdrawUnderlyingAsETH` after calling the internal `_burn` function. If the wrapper returns WETH, should withdraw ETH, otherwise do nothing.

#### `function _beforeSendWETH(uint256 amount) internal`

Called in `withdraw` and `withdrawUnderlying` after calling the internal `_burn` function. If the wrapper returns ETH, should mint WETH, otherwise do nothing.

#### `function depositETH() external payable returns (uint256 amountMinted)`

Same as `deposit`, except `msg.value` is used instead of `amountUnderlying` and WETH is not transferred from the caller. If the wrapper takes WETH, the function should call `weth.deposit{value:msg.value}`

#### `function withdrawAsETH(uint256 amountToken) external returns (uint256 amountReceived)`

Same as `withdraw`, except the caller should be sent Ether instead of WETH. If the wrapper returns ETH, the function should call `weth.withdraw(amountReceived)`.

#### `function withdrawUnderlyingAsETH(uint256 amountUnderlying) external returns (uint256 amountBurned)`

Same as `withdrawUnderlying`, except the caller should be sent Ether instead of WETH. If the wrapper returns ETH, the function should call `weth.withdraw(amountReceived)`.