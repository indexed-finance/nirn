// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import "./DyDxErc20Adapter.sol";
import "../../interfaces/IWETH.sol";
import "../../libraries/MinimalSignedMath.sol";


contract DyDxEtherAdapter is DyDxErc20Adapter, IEtherAdapter {
  using MinimalSignedMath for uint256;
  using LowGasSafeMath for uint256;
  using TransferHelper for address;

/* ========== Constructor & Initializer ========== */

  constructor(uint96 _marketId) {
    underlying = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    marketId = _marketId;
    underlying.safeApproveMax(address(dydx));
  }

  function initialize(address, uint256) external virtual override {
    return;
  }

/* ========== Metadata Queries ========== */

  function name() external pure override(DyDxErc20Adapter, IErc20Adapter) returns (string memory) {
    return "DyDx ETH Adapter";
  }

/* ========== Token Actions ========== */

  function depositETH() external payable virtual override returns (uint256 shares) {
    require(msg.value > 0, "DyDx: Mint failed");
    shares = toWrappedAmount(msg.value);
    IWETH(underlying).deposit{value: msg.value}();
    _mint(msg.sender, shares);
    _deposit(msg.value);
  }

  function withdrawAsETH(uint256 shares) public virtual override returns (uint256 amountOut) {
    amountOut = toUnderlyingAmount(shares);
    _burn(msg.sender, shares);
    _withdraw(amountOut, false);
    IWETH(underlying).withdraw(amountOut);
    address(msg.sender).safeTransferETH(amountOut);
  }

  function withdrawAllAsETH() external virtual override returns (uint256 amountReceived) {
    return withdrawAsETH(balanceWrapped());
  }

  function withdrawUnderlyingAsETH(uint256 amountUnderlying) external virtual override returns (uint256 shares) {
    require(amountUnderlying > 0, "DyDx: Burn failed");
    shares = toWrappedAmount(amountUnderlying);
    _burn(msg.sender, shares);
    _withdraw(amountUnderlying, false);
    IWETH(underlying).withdraw(amountUnderlying);
    address(msg.sender).safeTransferETH(amountUnderlying);
  }
}