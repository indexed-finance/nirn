pragma solidity >=0.5.0;

interface IVault {
  function token() external view returns (address);

  function underlying() external view returns (address);

  function name() external view returns (string memory);

  function symbol() external view returns (string memory);

  function decimals() external view returns (uint8);

  function controller() external view returns (address);

  function governance() external view returns (address);

  function getPricePerFullShare() external view returns (uint256);

  function deposit(uint256) external;

  function depositAll() external;

  function withdraw(uint256) external;

  function withdrawAll() external;
}

interface IController {
  function withdraw(address, uint256) external;

  function balanceOf(address) external view returns (uint256);

  function earn(address, uint256) external;

  function want(address) external view returns (address);

  function rewards() external view returns (address);

  function vaults(address) external view returns (address);

  function strategies(address) external view returns (address);

  function approvedStrategies(address, address) external view returns (bool);
}

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