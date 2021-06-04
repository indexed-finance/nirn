// SPDX-License-Identifier: MIT
pragma solidity >=0.5.0;


interface IYearnRegistry {
  function governance() external view returns (address);

  function pendingGovernance() external view returns (address);

  function isDelegatedVault(address) external view returns (bool);

  function getName() external pure returns (string memory);

  function getVault(uint256 index) external view returns (address vault);

  function getVaultsLength() external view returns (uint256);

  function getVaults() external view returns (address[] memory);

  function getVaultInfo(address _vault)
    external
    view
    returns (
      address controller,
      address token,
      address strategy,
      bool isWrapped,
      bool isDelegated
    );

  function getVaultsInfo()
    external
    view
    returns (
      address[] memory vaultsAddresses,
      address[] memory controllerArray,
      address[] memory tokenArray,
      address[] memory strategyArray,
      bool[] memory isWrappedArray,
      bool[] memory isDelegatedArray
    );
}