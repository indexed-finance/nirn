// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "./AbstractTokenAdapter.sol";
import "../interfaces/CompoundInterfaces.sol";
import "../interfaces/IERC20.sol";
import "../interfaces/IWETH.sol";
import "../libraries/LowGasSafeMath.sol";
import "../libraries/TransferHelper.sol";


contract CErc20Adapter is AbstractErc20Adapter() {
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

  function getHypotheticalAPR(uint256 _deposit) external view virtual override returns (uint256) {
    IInterestRateModel model = ICToken(token).interestRateModel();
    return model.getSupplyRate(
      ICToken(token).getCash().add(_deposit),
      ICToken(token).totalBorrows(),
      ICToken(token).totalReserves(),
      ICToken(token).reserveFactorMantissa()
    ).mul(2102400);
  }

/* ========== Caller Balance Queries ========== */

  function underlyingBalance() external view virtual override returns (uint256) {
    return ICToken(token).balanceOf(msg.sender).mul(ICToken(token).exchangeRateStored()) / 1e18;
  }

/* ========== Internal Actions ========== */

  function _approve() internal virtual override {
    underlying.safeApprove(address(token), type(uint256).max);
  }

  function _mint(uint256 amountUnderlying) internal virtual override returns (uint256 amountMinted) {
    require(ICToken(token).mint(amountUnderlying) == 0, "CErc20: Mint failed");
    amountMinted = IERC20(token).balanceOf(address(this));
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


contract CEtherAdapter is AbstractEtherAdapter() {
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

  function getHypotheticalAPR(uint256 _deposit) external view virtual override returns (uint256) {
    IInterestRateModel model = ICToken(token).interestRateModel();
    return model.getSupplyRate(
      ICToken(token).getCash().add(_deposit),
      ICToken(token).totalBorrows(),
      ICToken(token).totalReserves(),
      ICToken(token).reserveFactorMantissa()
    ).mul(2102400);
  }

/* ========== Caller Balance Queries ========== */

  function underlyingBalance() external view virtual override returns (uint256) {
    return ICToken(token).balanceOf(msg.sender).mul(ICToken(token).exchangeRateStored()) / 1e18;
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
    require(ICToken(token).mint{value: amountUnderlying}() == 0, "CEther: Mint failed");
    amountMinted = IERC20(token).balanceOf(address(this));
  }

  function _burn(uint256 amountToken) internal virtual override returns (uint256 amountReceived) {
    require(ICToken(token).redeem(amountToken) == 0, "CEther: Burn failed");
    amountReceived = IERC20(underlying).balanceOf(address(this));
  }

  function _burnUnderlying(uint256 amountUnderlying) internal virtual override returns (uint256 amountBurned) {
    amountBurned = amountUnderlying.mul(1e18) / ICToken(token).exchangeRateCurrent();
    token.safeTransferFrom(msg.sender, address(this), amountBurned);
    require(ICToken(token).redeemUnderlying(amountUnderlying) == 0, "CEther: Burn failed");
  }
}