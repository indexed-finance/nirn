// SPDX-License-Identifier: MIT
pragma solidity >=0.5.0;
pragma abicoder v2;


interface IDyDx {
  struct val {
    uint256 value;
  }

  struct set {
    uint128 borrow;
    uint128 supply;
  }

  function getEarningsRate() external view returns (val memory);

  function getNumMarkets() external view returns (uint256);

  function getMarketTokenAddress(uint256) external view returns (address);

  function getMarketInterestRate(uint256 marketId) external view returns (val memory);

  function getMarketTotalPar(uint256 marketId) external view returns (set memory);
}
