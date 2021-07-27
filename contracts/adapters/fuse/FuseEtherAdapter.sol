// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "../AbstractEtherAdapter.sol";
import "../../interfaces/FuseInterfaces.sol";
import "../../interfaces/IERC20.sol";
import "../../interfaces/IWETH.sol";
import "../../libraries/LowGasSafeMath.sol";
import "../../libraries/TransferHelper.sol";
import "../../libraries/MinimalSignedMath.sol";
import { CTokenParams } from "../../libraries/CTokenParams.sol";


contract FuseEtherAdapter is AbstractEtherAdapter() {
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
    return address(token).balance;
  }

/* ========== Conversion Queries ========== */

  function toUnderlyingAmount(uint256 tokenAmount) external view virtual override returns (uint256) {
    return tokenAmount;
  }

  function toWrappedAmount(uint256 underlyingAmount) external view virtual override returns (uint256) {
    return underlyingAmount;
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

/* ========== Internal Ether Handlers ========== */
  
  // Convert to WETH if contract takes WETH
  function _afterReceiveETH(uint256 amount) internal virtual override {}

  // Convert to WETH if contract takes ETH
  function _afterReceiveWETH(uint256 amount) internal virtual override {
    IWETH(underlying).withdraw(amount);
  }

  // Convert to ETH if contract returns WETH
  function _beforeSendETH(uint256 amount) internal virtual override {}

  // Convert to WETH if contract returns ETH
  function _beforeSendWETH(uint256 amount) internal virtual override {
    IWETH(underlying).deposit{value: amount}();
  }

/* ========== Internal Actions ========== */

  function _approve() internal virtual override {}

  function _mint(uint256 amountUnderlying) internal virtual override returns (uint256 amountMinted) {
    require(IFToken(token).mint{value: amountUnderlying}() == 0, "CEther: Mint failed");
    amountMinted = IERC20(token).balanceOf(address(this));
  }

  function _burn(uint256 amountToken) internal virtual override returns (uint256 amountReceived) {
    require(IFToken(token).redeem(amountToken) == 0, "CEther: Burn failed");
    amountReceived = IERC20(underlying).balanceOf(address(this));
  }

  function _burnUnderlying(uint256 amountUnderlying) internal virtual override returns (uint256 amountBurned) {
    amountBurned = amountUnderlying.mul(1e18).divCeil(IFToken(token).exchangeRateCurrent());
    token.safeTransferFrom(msg.sender, address(this), amountBurned);
    require(IFToken(token).redeemUnderlying(amountUnderlying) == 0, "CEther: Burn failed");
  }
}