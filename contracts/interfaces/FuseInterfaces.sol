// SPDX-License-Identifier: MIT
pragma solidity >=0.5.0;
pragma abicoder v2;


interface IFusePoolDirectory {
	struct FusePool {
		string name;
		address creator;
		IFusePool comptroller;
		uint256 blockPosted;
		uint256 timestampPosted;
	}
  function pools(uint256) external view returns (string memory name, address creator, IFusePool comptroller, uint256 blockPosted, uint256 timestampPosted);
  function getAllPools() external view returns (FusePool[] memory);
}


interface IFusePool {
  function enforceWhitelist() external view returns (bool);
  function getAllMarkets() external view returns (IFToken[] memory);
}


interface IFToken {
  function underlying() external view returns (address);
  function name() external view returns (string memory);

  function supplyRatePerBlock() external view returns (uint256);

  function getCash() external view returns (uint256);
  function totalBorrows() external view returns (uint256);
  function totalReserves() external view returns (uint256);

  function reserveFactorMantissa() external view returns (uint256);
  function fuseFeeMantissa() external view returns(uint256);
  function adminFeeMantissa() external view returns(uint256);

  function exchangeRateCurrent() external returns (uint256);
  function exchangeRateStored() external view returns (uint256);

  function totalFuseFees() external view returns(uint256);
  function totalAdminFees() external view returns(uint256);

  function interestRateModel() external view returns (IInterestRateModel);
  function balanceOf(address account) external view returns (uint256);
  function mint(uint256 mintAmount) external returns (uint256);
  function mint() external payable returns (uint256);
  function redeem(uint256 tokenAmount) external returns (uint256);
  function redeemUnderlying(uint256 underlyingAmount) external returns (uint256);
}


interface IInterestRateModel {
  function getSupplyRate(
    uint256 cash,
    uint256 borrows,
    uint256 reserves,
    uint256 reserveFactorMantissa
  ) external view returns (uint);
}