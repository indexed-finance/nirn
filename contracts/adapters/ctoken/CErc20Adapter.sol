// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "../AbstractErc20Adapter.sol";
import "../../interfaces/CompoundInterfaces.sol";
import "../../interfaces/IERC20.sol";
import "../../interfaces/IWETH.sol";
import "../../libraries/LowGasSafeMath.sol";
import "../../libraries/TransferHelper.sol";
import "../../libraries/SignedAddition.sol";
import { CTokenParams } from "../../libraries/CTokenParams.sol";


contract CErc20Adapter is AbstractErc20Adapter() {
  using SignedAddition for uint256;
  using LowGasSafeMath for uint256;
  using TransferHelper for address;

/* ========== Storage ========== */

  string internal __protocolName;

/* ========== Initializer ========== */

  function initialize(
    address _underlying,
    address _token,
    string memory protocolName
  ) public {
    super.initialize(_underlying, _token);
    __protocolName = protocolName;
  }


/* ========== Internal Queries ========== */

  function _protocolName() internal view virtual override returns (string memory) {
    return __protocolName;
  }

/* ========== Performance Queries ========== */

  function getAPR() external view virtual override returns (uint256) {
    return ICToken(token).supplyRatePerBlock().mul(2102400);
  }

  function getHypotheticalAPR(int256 liquidityDelta) external view virtual override returns (uint256) {
    ICToken cToken = ICToken(token);
    (
      address model,
      uint256 cashPrior,
      uint256 borrowsPrior,
      uint256 reservesPrior,
      uint256 reserveFactorMantissa
    ) = CTokenParams.getInterestRateParameters(address(cToken));
    return IInterestRateModel(model).getSupplyRate(
      cashPrior.addMin0(liquidityDelta),
      borrowsPrior,
      reservesPrior,
      reserveFactorMantissa
    ).mul(2102400);
  }

/* ========== Caller Balance Queries ========== */

  function balanceUnderlying() external view virtual override returns (uint256) {
    address _token = token;
    return ICToken(_token).balanceOf(msg.sender).mul(ICToken(_token).exchangeRateStored()) / 1e18;
  }

/* ========== Internal Actions ========== */

  function _approve() internal virtual override {
    underlying.safeApproveMax(token);
  }

  function _mint(uint256 amountUnderlying) internal virtual override returns (uint256 amountMinted) {
    address _token = token;
    require(ICToken(_token).mint(amountUnderlying) == 0, "CErc20: Mint failed");
    amountMinted = IERC20(_token).balanceOf(address(this));
  }

  function _burn(uint256 amountToken) internal virtual override returns (uint256 amountReceived) {
    require(ICToken(token).redeem(amountToken) == 0, "CErc20: Burn failed");
    amountReceived = IERC20(underlying).balanceOf(address(this));
  }

  function _burnUnderlying(uint256 amountUnderlying) internal virtual override returns (uint256 amountBurned) {
    amountBurned = amountUnderlying.mul(1e18) / ICToken(token).exchangeRateCurrent();
    token.safeTransferFrom(msg.sender, address(this), amountBurned);
    require(ICToken(token).redeemUnderlying(amountUnderlying) == 0, "CErc20: Burn failed");
  }
}