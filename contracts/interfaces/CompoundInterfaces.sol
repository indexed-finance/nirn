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
  function exchangeRateCurrent() external returns (uint256);
  function exchangeRateStored() external view returns (uint256);
  function accrualBlockNumber() external view returns (uint256);

  function interestRateModel() external view returns (IInterestRateModel);
  function balanceOf(address account) external view returns (uint256);
  function mint(uint256 mintAmount) external returns (uint256);
  function mint() external payable returns (uint256);
  function redeem(uint256 tokenAmount) external returns (uint256);
  function redeemUnderlying(uint256 underlyingAmount) external returns (uint256);
}


interface IInterestRateModel {
  function getBorrowRate(
    uint cash,
    uint borrows,
    uint reserves
  ) external view returns (uint);

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