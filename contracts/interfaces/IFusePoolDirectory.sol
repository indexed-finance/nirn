// SPDX-License-Identifier: MIT
pragma solidity >=0.5.10;
pragma experimental ABIEncoderV2;


interface IFusePool {
  function enforceWhitelist() external view returns (bool);
}


interface IFusePoolDirectory {
	struct FusePool {
		string name;
		address creator;
		IFusePool comptroller;
		uint256 blockPosted;
		uint256 timestampPosted;
	}
  function deployerWhitelist (address) external view returns (bool);
  function enforceDeployerWhitelist () external view returns (bool);
  function owner () external view returns (address);
  function poolExists (address) external view returns (bool);
  function pools (uint256) external view returns (string memory name, address creator, IFusePool comptroller, uint256 blockPosted, uint256 timestampPosted);
  function renounceOwnership () external;
  function transferOwnership (address newOwner) external;
  function initialize (bool _enforceDeployerWhitelist, address[] calldata _deployerWhitelist) external;
  function _setDeployerWhitelistEnforcement (bool _enforceDeployerWhitelist) external;
  function _whitelistDeployers (address[] calldata deployers) external;
  function registerPool (string calldata name, address comptroller) external returns (uint256);
  function deployPool (string calldata name, address implementation, bool enforceWhitelist, uint256 closeFactor, uint256 maxAssets, uint256 liquidationIncentive, address priceOracle) external returns (uint256, address);
  function getAllPools () external view returns (FusePool[] memory);
  function getPublicPools () external view returns (uint256[] memory, FusePool[] memory);
  function getPoolsByAccount (address account) external view returns (uint256[] memory, FusePool[] memory);
  function getBookmarks (address account) external view returns (address[] memory);
  function bookmarkPool (address comptroller) external;
}
