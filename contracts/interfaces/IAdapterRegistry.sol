// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

interface IAdapterRegistry {
  function getProtocolAdapters() external view returns (address[] memory adapters);

  function getProtocolMetadata(uint256 id)
    external
    view
    returns (
      address protocolAdapter,
      uint256 adaptersCount,
      string memory name
    );

  function isSupported(address underlying) external view returns (bool);

  function getSupportedTokens() external view returns (address[] memory list);

  function getAdaptersList(address underlying) external view returns (address[] memory list);

  function addTokenAdapter(address adapter) external;

  function addTokenAdapters(address[] calldata adapters) external;

  function addProtocolAdapter(address protocolAdapter) external;

  function getAdaptersSortedByAPR(address underlying)
    external
    view
    returns (address[] memory adapters, uint256[] memory aprs);

  function getAdapterWithHighestAPR(address underlying) external view returns (address adapter, uint256 apr);

  function getAdapterWithHighestAPRForDeposit(
    address underlying,
    uint256 deposit,
    address excludingAdapter
  ) external view returns (address adapter, uint256 apr);
}
