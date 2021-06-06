// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import "../AbstractErc20Adapter.sol";
import "../../interfaces/AaveV2Interfaces.sol";
import "../../interfaces/IWETH.sol";
import "../../interfaces/IERC20.sol";
import "../../libraries/LowGasSafeMath.sol";
import "../../libraries/TransferHelper.sol";
import "../../libraries/RayMul.sol";
import "../../libraries/ReserveConfigurationLib.sol";
import "../../libraries/SignedAddition.sol";


contract AaveV2Erc20Adapter is AbstractErc20Adapter {
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
    address reserve = underlying;
    ILendingPool.ReserveData memory data = pool.getReserveData(reserve);
    uint256 availableLiquidity = IERC20(reserve).balanceOf(data.aTokenAddress).addMin0(liquidityDelta);
    uint256 totalVariableDebt = data.variableDebtToken.scaledTotalSupply().rayMul(data.variableBorrowIndex);
    (uint256 totalStableDebt, uint256 avgStableRate) = data.stableDebtToken.getTotalSupplyAndAvgRate();
    (uint256 liquidityRate, ,) = data.interestRateStrategy.calculateInterestRates(
      reserve,
      availableLiquidity,
      totalStableDebt,
      totalVariableDebt,
      avgStableRate,
      ReserveConfigurationLib.getReserveFactor(data.configuration)
    );
    return liquidityRate / 1e9;
  }

/* ========== Caller Balance Queries ========== */

  function balanceUnderlying() external view virtual override returns (uint256) {
    return IERC20(token).balanceOf(msg.sender);
  }

/* ========== Internal Actions ========== */

  function _approve() internal virtual override {
    underlying.safeApproveMax(address(aave.getLendingPool()));
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