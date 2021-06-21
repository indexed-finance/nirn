// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "../AbstractErc20Adapter.sol";
import "../../interfaces/AaveV1Interfaces.sol";
import "../../interfaces/IERC20.sol";
import "../../libraries/LowGasSafeMath.sol";
import "../../libraries/TransferHelper.sol";
import "../../libraries/MinimalSignedMath.sol";
import "../../libraries/RayDiv.sol";


contract AaveV1Erc20Adapter is AbstractErc20Adapter {
  using MinimalSignedMath for uint256;
  using LowGasSafeMath for uint256;
  using RayDiv for uint256;
  using TransferHelper for address;

/* ========== Constants ========== */

  ILendingPoolAddressesProvider public immutable aave;

/* ========== Constructor ========== */

  constructor(ILendingPoolAddressesProvider _aave) AbstractErc20Adapter() {
    aave = _aave;
  }

/* ========== Performance Queries ========== */

  function getAPR() external view virtual override returns (uint256 apr) {
    apr = aave.getLendingPoolCore().getReserveCurrentLiquidityRate(underlying) / 1e9;
  }

  function getHypotheticalAPR(int256 liquidityDelta) external view virtual override returns (uint256 apr) {
    address reserve = underlying;
    ILendingPoolCore core = aave.getLendingPoolCore();
    (uint256 liquidityRate,,) = core.getReserveInterestRateStrategyAddress(reserve).calculateInterestRates(
      reserve,
      core.getReserveAvailableLiquidity(reserve).add(liquidityDelta),
      core.getReserveTotalBorrowsStable(reserve),
      core.getReserveTotalBorrowsVariable(reserve),
      core.getReserveCurrentAverageStableBorrowRate(reserve)
    );
    return liquidityRate / 1e9;
  }

/* ========== Caller Balance Queries ========== */

  function balanceUnderlying() external view virtual override returns (uint256) {
    return IERC20(token).balanceOf(msg.sender);
  }

/* ========== Internal Queries ========== */

  function _protocolName() internal view virtual override returns (string memory) {
    return "Aave V1";
  }

/* ========== Internal Actions ========== */

  function _approve() internal virtual override {
    underlying.safeApproveMax(address(aave.getLendingPoolCore()));
  }

  function _mint(uint256 amountUnderlying) internal virtual override returns (uint256 amountMinted) {
    amountMinted = amountUnderlying;
    aave.getLendingPool().deposit(underlying, amountUnderlying, 0);
  }

  function _burn(uint256 amountToken) internal virtual override returns (uint256 amountReceived) {
    amountReceived = amountToken;
    IAToken(token).redeem(amountToken);
  }

  function _burnUnderlying(uint256 amountUnderlying) internal virtual override returns (uint256 amountBurned) {
    token.safeTransferFrom(msg.sender, address(this), amountUnderlying);
    amountBurned = amountUnderlying;
    IAToken(token).redeem(amountUnderlying);
  }
}