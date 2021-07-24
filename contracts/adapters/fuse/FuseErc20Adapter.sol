// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "../AbstractErc20Adapter.sol";
import "../../interfaces/FuseInterfaces.sol";
import "../../interfaces/IERC20.sol";
import "../../interfaces/IWETH.sol";
import "../../libraries/LowGasSafeMath.sol";
import "../../libraries/TransferHelper.sol";
import "../../libraries/MinimalSignedMath.sol";
import { CTokenParams } from "../../libraries/CTokenParams.sol";


contract FuseErc20Adapter is AbstractErc20Adapter {
  using MinimalSignedMath for uint256;
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

/* ========== Metadata ========== */

  function availableLiquidity() public view override returns (uint256) {
    return IERC20(underlying).balanceOf(token);
  }

/* ========== Conversion Queries ========== */

  function toUnderlyingAmount(uint256 tokenAmount) public view override returns (uint256) {
    return (
      tokenAmount
      .mul(CTokenParams.currentExchangeRate(token))
      / uint256(1e18)
    );
  }

  function toWrappedAmount(uint256 underlyingAmount) public view override returns (uint256) {
    return underlyingAmount
      .mul(1e18)
      / CTokenParams.currentExchangeRate(token);
  }

/* ========== Performance Queries ========== */

  function getAPR() public view virtual override returns (uint256) {
    return IFToken(token).supplyRatePerBlock().mul(2102400);
  }

  function getHypotheticalAPR(int256 liquidityDelta) external view virtual override returns (uint256) {
    IFToken fToken = IFToken(token);
    (
      address model,
      uint256 cashPrior,
      uint256 borrowsPrior,
      uint256 reservesPrior,
      uint256 reserveFactorMantissa
    ) = CTokenParams.getInterestRateParameters(address(fToken));
    return IInterestRateModel(model).getSupplyRate(
      cashPrior.add(liquidityDelta),
      borrowsPrior,
      reservesPrior.add(fToken.totalFuseFees()).add(fToken.totalAdminFees()),
      reserveFactorMantissa.add(fToken.fuseFeeMantissa()).add(fToken.adminFeeMantissa())
    ).mul(2102400);
  }

/* ========== Caller Balance Queries ========== */

  function balanceUnderlying() external view virtual override returns (uint256) {
    return IFToken(token).balanceOf(msg.sender).mul(IFToken(token).exchangeRateStored()) / 1e18;
  }

/* ========== Internal Actions ========== */

  function _approve() internal virtual override {
    underlying.safeApproveMax(token);
  }

  function _mint(uint256 amountUnderlying) internal virtual override returns (uint256 amountMinted) {
    require(IFToken(token).mint(amountUnderlying) == 0, "CErc20: Mint failed");
    amountMinted = IERC20(token).balanceOf(address(this));
  }

  function _burn(uint256 amountToken) internal virtual override returns (uint256 amountReceived) {
    require(IFToken(token).redeem(amountToken) == 0, "CErc20: Burn failed");
    amountReceived = IERC20(underlying).balanceOf(address(this));
  }

  function _burnUnderlying(uint256 amountUnderlying) internal virtual override returns (uint256 amountBurned) {
    amountBurned = amountUnderlying.mul(1e18).divCeil(IFToken(token).exchangeRateCurrent());
    token.safeTransferFrom(msg.sender, address(this), amountBurned);
    require(IFToken(token).redeemUnderlying(amountUnderlying) == 0, "CErc20: Burn failed");
  }
}