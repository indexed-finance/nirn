// SPDX-License-Identifier: MIT
pragma solidity >=0.5.0;


interface IBZX {
  function getLoanPoolsList(uint256 start, uint256 count) external view returns (address[] memory loanPoolsList);
  function loanPoolToUnderlying(address pool) external view returns (address underlying);
  function underlyingToLoanPool(address pool) external view returns (IToken underlying);
}


interface IToken {
  function supplyInterestRate() external view returns (uint256);
  function nextSupplyInterestRate(uint256 supplyAmount) external view returns (uint256);
}