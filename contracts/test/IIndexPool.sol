// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

interface IIndexPool {
  function getCurrentTokens() external view returns (address[] memory tokens);

  function getDenormalizedWeight(address token) external view returns (uint256 denorm);

  function getTotalDenormalizedWeight() external view returns (uint256);
}