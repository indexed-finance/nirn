// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import "../AbstractEtherAdapter.sol";
import "../../interfaces/AaveV2Interfaces.sol";
import "../../interfaces/IWETH.sol";
import "../../interfaces/IERC20.sol";
import "../../libraries/LowGasSafeMath.sol";
import "../../libraries/TransferHelper.sol";
import "../../libraries/RayMul.sol";
import "../../libraries/ReserveConfigurationLib.sol";
import "../../libraries/SignedAddition.sol";


contract AaveV2EtherAdapter is AbstractEtherAdapter {
  using SignedAddition for uint256;
  using LowGasSafeMath for uint256;
  using RayMul for uint256;
  using TransferHelper for address;

/* ========== Constants ========== */

  ILendingPoolAddressesProvider public immutable aave;

/* ========== Constructor ========== */

  constructor(ILendingPoolAddressesProvider _aave) AbstractErc20Adapter() {
    aave = _aave;
  }

/* ========== Internal Queries ========== */

  function _protocolName() internal view virtual override returns (string memory) {
    return "Aave V2";
  }

/* ========== Performance Queries ========== */

  function getAPR() external view virtual override returns (uint256 apr) {
    ILendingPool pool = aave.getLendingPool();
    ILendingPool.ReserveData memory reserve = pool.getReserveData(underlying);
    apr = reserve.currentLiquidityRate / 1e9;
  }

  function getHypotheticalAPR(int256 liquidityDelta) external view virtual override returns (uint256 apr) {
    ILendingPool pool = aave.getLendingPool();
    ILendingPool.ReserveData memory reserve = pool.getReserveData(underlying);

    uint256 availableLiquidity = IERC20(underlying).balanceOf(reserve.aTokenAddress).add(liquidityDelta);
    uint256 totalVariableDebt = reserve.variableDebtToken.scaledTotalSupply()
      .rayMul(reserve.variableBorrowIndex);
    (uint256 totalStableDebt, uint256 avgStableRate) = reserve.stableDebtToken
      .getTotalSupplyAndAvgRate();
    (uint256 liquidityRate, ,) = reserve.interestRateStrategy.calculateInterestRates(
      underlying,
      availableLiquidity,
      totalStableDebt,
      totalVariableDebt,
      avgStableRate,
      ReserveConfigurationLib.getReserveFactor(reserve.configuration)
    );
    return liquidityRate / 1e9;
  }

/* ========== Caller Balance Queries ========== */

  function underlyingBalance() external view virtual override returns (uint256) {
    return IERC20(token).balanceOf(msg.sender);
  }

/* ========== Internal Ether Handlers ========== */
  
  function _afterReceiveETH(uint256 amount) internal virtual override {
    IWETH(underlying).deposit{value: amount}();
  }

  function _afterReceiveWETH(uint256 amount) internal virtual override {}

  function _beforeSendETH(uint256 amount) internal virtual override {
    IWETH(underlying).withdraw(amount);
  }

  function _beforeSendWETH(uint256 amount) internal virtual override {}

/* ========== Internal Actions ========== */

  function _approve() internal virtual override {
    underlying.safeApprove(address(aave.getLendingPool()), type(uint256).max);
  }

  function _mint(uint256 amountUnderlying) internal virtual override returns (uint256 amountMinted) {
    aave.getLendingPool().deposit(underlying, amountUnderlying, address(this), 0);
    amountMinted = amountUnderlying;
  }

  function _burn(uint256 amountToken) internal virtual override returns (uint256 amountReceived) {
    aave.getLendingPool().withdraw(underlying, amountToken, address(this));
    amountReceived = amountToken;
  }

  function _burnUnderlying(uint256 amountUnderlying) internal virtual override returns (uint256 amountBurned) {
    amountBurned = amountUnderlying;
    token.safeTransferFrom(msg.sender, address(this), amountBurned);
    aave.getLendingPool().withdraw(underlying, amountUnderlying, address(this));
  }
}