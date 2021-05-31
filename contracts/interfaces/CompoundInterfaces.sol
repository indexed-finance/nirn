// SPDX-License-Identifier: MIT
pragma solidity >=0.5.0;
pragma abicoder v2;


interface ICToken {
  function underlying() external view returns (address);
  function name() external view returns (string memory);
  function supplyRatePerBlock() external view returns (uint256);
  function getCash() external view returns (uint256);
  function totalBorrows() external view returns (uint256);
  function totalReserves() external view returns (uint256);
  function reserveFactorMantissa() external view returns (uint256);
  function interestRateModel() external view returns (IInterestRateModel);
}


interface IInterestRateModel {
  function getSupplyRate(
    uint256 cash,
    uint256 borrows,
    uint256 reserves,
    uint256 reserveFactorMantissa
  ) external view returns (uint);
}


interface IComptroller {
  function getAllMarkets() external view returns (ICToken[] memory);
}