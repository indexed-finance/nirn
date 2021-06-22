// SPDX-License-Identifier: MIT
pragma solidity >=0.5.10;

interface IProtocolAdapter {
  function protocol() external view returns (string memory);
  function getUnmapped() external view returns (address[] memory tokens);
  function map(uint256 max) external;
}