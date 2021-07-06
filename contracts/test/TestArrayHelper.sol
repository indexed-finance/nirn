// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.5.0;

import "../libraries/ArrayHelper.sol";


contract TestArrayHelper {
  using ArrayHelper for uint256[];
  using ArrayHelper for bytes32[];
  using ArrayHelper for address[];
  using ArrayHelper for IErc20Adapter[];
  using ArrayHelper for EnumerableSet.AddressSet;
  using EnumerableSet for EnumerableSet.AddressSet;

  EnumerableSet.AddressSet internal addressSet;
  address[] internal addressArray;
  bytes32[] internal bytes32Array;

  function toArray() external view returns (address[] memory arr) {
    arr = addressSet.toArray();
  }

  function setAddressSet(address[] memory arr) external {
    for (uint256 i; i < arr.length; i++) addressSet.add(arr[i]);
  }

  function setAddressArray(address[] memory arr) external {
    addressArray = arr;
  }

  function setBytes32Array(bytes32[] memory arr) external {
    bytes32Array = arr;
  }

  function getAddressArray() external view returns (address[] memory arr) {
    arr = addressArray;
  }

  function getBytes32Array() external view returns (bytes32[] memory arr) {
    arr = bytes32Array;
  }
  function sum(uint256[] memory arr) external pure returns (uint256) {
    return arr.sum();
  }

  function mremove(uint256[] memory arr, uint256 index) external pure returns (uint256[] memory) {
    arr.mremove(index);
    return arr;
  }

  function mremove(address[] memory arr, uint256 index) external pure returns (address[] memory) {
    arr.mremove(index);
    return arr;
  }

  function mremoveAdapters(IErc20Adapter[] memory arr, uint256 index) external pure returns (IErc20Adapter[] memory) {
    arr.mremove(index);
    return arr;
  }

  function removeBytes32(uint256 index) external {
    bytes32Array.remove(index);
  }

  function removeAddress(uint256 index) external {
    addressArray.remove(index);
  }

  function indexOf(address[] memory arr, address find) external pure returns (uint256) {
    return arr.indexOf(find);
  }

  function sortByDescendingScore(
    address[] memory addresses,
    uint256[] memory scores
  ) external pure returns (address[] memory, uint256[] memory) {
    addresses.sortByDescendingScore(scores);
    return (addresses, scores);
  }
}