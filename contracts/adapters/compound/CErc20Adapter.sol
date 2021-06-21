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

/* ========== Constants ========== */

  IComptroller internal constant comptroller = IComptroller(0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B);
  address internal constant cComp = 0x70e36f6BF80a52b3B46b3aF8e106CC0ed743E8e4;

/* ========== Internal Queries ========== */

  function _protocolName() internal view virtual override returns (string memory) {
    return "Compound";
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

  function totalLiquidity() public view returns (uint256) {
    ICToken cToken = ICToken(token);
    return cToken.getCash().add(cToken.totalBorrows()).sub(cToken.totalReserves());
  }

  function getRewardsAPR(
    ICToken cToken,
    uint256 _totalLiquidity
  ) internal view returns (uint256) {
    IPriceOracle oracle = comptroller.oracle();
    uint256 compPrice = oracle.getUnderlyingPrice(cComp);
    uint256 tokenPrice = oracle.getUnderlyingPrice(address(cToken));
    if (compPrice == 0 || tokenPrice == 0) return 0;
    uint256 annualRewards = comptroller.compSpeeds(address(cToken)).mul(2102400).mul(compPrice);
    return annualRewards.mul(1e18) / _totalLiquidity.mul(tokenPrice);
  }

  function getRewardsAPR() public view returns (uint256) {
    return getRewardsAPR(ICToken(token), totalLiquidity());
  }

  function getAPR() external view virtual override returns (uint256) {
    ICToken cToken = ICToken(token);
    (
      address model,
      uint256 cashPrior,
      uint256 borrowsPrior,
      uint256 reservesPrior,
      uint256 reserveFactorMantissa
    ) = CTokenParams.getInterestRateParameters(address(cToken));
    uint256 liquidityTotal = cashPrior.add(borrowsPrior).sub(reservesPrior);

    return IInterestRateModel(model).getSupplyRate(
      cashPrior,
      borrowsPrior,
      reservesPrior,
      reserveFactorMantissa
    ).mul(2102400).add(getRewardsAPR(cToken, liquidityTotal));
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
    uint256 liquidityTotal = cashPrior.add(liquidityDelta).add(borrowsPrior).sub(reservesPrior);

    return IInterestRateModel(model).getSupplyRate(
      cashPrior.add(liquidityDelta),
      borrowsPrior,
      reservesPrior,
      reserveFactorMantissa
    ).mul(2102400).add(getRewardsAPR(cToken, liquidityTotal));
  }

/* ========== Caller Balance Queries ========== */

  function balanceUnderlying() external view virtual override returns (uint256) {
    return toUnderlyingAmount(ICToken(token).balanceOf(msg.sender));
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
    amountBurned = toWrappedAmount(amountUnderlying);
    token.safeTransferFrom(msg.sender, address(this), amountBurned);
    require(ICToken(token).redeemUnderlying(amountUnderlying) == 0, "CErc20: Burn failed");
  }
}