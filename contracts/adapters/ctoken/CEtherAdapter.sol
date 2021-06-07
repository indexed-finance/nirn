// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "../AbstractEtherAdapter.sol";
import "../../interfaces/CompoundInterfaces.sol";
import "../../interfaces/IERC20.sol";
import "../../interfaces/IWETH.sol";
import "../../libraries/LowGasSafeMath.sol";
import "../../libraries/TransferHelper.sol";
import "../../libraries/SignedAddition.sol";
import { CTokenParams } from "../../libraries/CTokenParams.sol";


contract CEtherAdapter is AbstractEtherAdapter() {
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
      cashPrior.add(liquidityDelta),
      borrowsPrior,
      reservesPrior,
      reserveFactorMantissa
    ).mul(2102400);
  }

/* ========== Caller Balance Queries ========== */

  function balanceUnderlying() external view virtual override returns (uint256) {
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
  // Compound LINK Adapter | deposit(100) GAS 332447 | balanceWrapped() 0.000000998849938881 GAS 32012 | balanceUnderlying() 200.00003684326894141 GAS 48346
  // Compound WBTC Adapter | deposit(10) GAS 365016 | balanceWrapped() 499.59124833 GAS 32012 | balanceUnderlying() 9.99999999 GAS 48488
  // Cream AAVE Adapter | deposit(100) GAS 542018 | balanceWrapped() 0.00000096870869565 GAS 31076 | balanceUnderlying() 200.000258393601241108 GAS 43096
  // Cream COMP Adapter | deposit(100) GAS 310990 | balanceWrapped() 0.000000927905663439 GAS 31076 | balanceUnderlying() 200.000093071756167403 GAS 43096
  function _mint(uint256 amountUnderlying) internal virtual override returns (uint256 amountMinted) {
    address _token = token;
    require(ICToken(_token).mint{value: amountUnderlying}() == 0, "CEther: Mint failed");
    amountMinted = IERC20(_token).balanceOf(address(this));
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