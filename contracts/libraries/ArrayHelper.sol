// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.5.0;

import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "../libraries/LowGasSafeMath.sol";
import "../interfaces/ITokenAdapter.sol";


library ArrayHelper {
  using EnumerableSet for EnumerableSet.AddressSet;
  using LowGasSafeMath for uint256;

  /**
   * @dev Converts an enumerable address set to an address array.
   * The enumerable set library stores the values as a bytes32 array.
   * This function re-assigns the pointer to an address array.
   */
  function toArray(EnumerableSet.AddressSet storage set) internal view returns (address[] memory arr) {
    bytes32[] memory bytes32Arr = set._inner._values;
    assembly { arr := bytes32Arr }
  }

  /**
   * @dev Computes the sum of a uint256 array.
   */
  function sum(uint256[] memory arr) internal pure returns (uint256 _sum) {
    uint256 len = arr.length;
    for (uint256 i; i < len; i++) _sum = _sum.add(arr[i]);
  }

  /**
   * @dev Remove the element at `index` from an array and decrement its length.
   * If `index` is the last index in the array, pops it from the array.
   * Otherwise, stores the last element in the array at `index` and then pops the last element.
   */
  function mremove(uint256[] memory arr, uint256 index) internal pure {
    uint256 len = arr.length;
    if (index != len - 1) {
      uint256 last = arr[len - 1];
      arr[index] = last;
    }
    assembly { mstore(arr, sub(len, 1)) }
  }

  /**
   * @dev Remove the element at `index` from an array and decrement its length.
   * If `index` is the last index in the array, pops it from the array.
   * Otherwise, stores the last element in the array at `index` and then pops the last element.
   */
  function mremove(address[] memory arr, uint256 index) internal pure {
    uint256 len = arr.length;
    if (index != len - 1) {
      address last = arr[len - 1];
      arr[index] = last;
    }
    assembly { mstore(arr, sub(len, 1)) }
  }

  /**
   * @dev Remove the element at `index` from an array and decrement its length.
   * If `index` is the last index in the array, pops it from the array.
   * Otherwise, stores the last element in the array at `index` and then pops the last element.
   */
  function mremove(IErc20Adapter[] memory arr, uint256 index) internal pure {
    uint256 len = arr.length;
    if (index != len - 1) {
      IErc20Adapter last = arr[len - 1];
      arr[index] = last;
    }
    assembly { mstore(arr, sub(len, 1)) }
  }

  /**
   * @dev Remove the element at `index` from an array and decrement its length.
   * If `index` is the last index in the array, pops it from the array.
   * Otherwise, stores the last element in the array at `index` and then pops the last element.
   */
  function remove(bytes32[] storage arr, uint256 index) internal {
    uint256 len = arr.length;
    if (index == len - 1) {
      arr.pop();
      return;
    }
    bytes32 last = arr[len - 1];
    arr[index] = last;
    arr.pop();
  }

  /**
   * @dev Remove the element at `index` from an array and decrement its length.
   * If `index` is the last index in the array, pops it from the array.
   * Otherwise, stores the last element in the array at `index` and then pops the last element.
   */
  function remove(address[] storage arr, uint256 index) internal {
    uint256 len = arr.length;
    if (index == len - 1) {
      arr.pop();
      return;
    }
    address last = arr[len - 1];
    arr[index] = last;
    arr.pop();
  }

  /**
   * @dev Find the index of an address in an array.
   * If the address is not found, revert.
   */
  function indexOf(address[] memory arr, address find) internal pure returns (uint256) {
    uint256 len = arr.length;
    for (uint256 i; i < len; i++) if (arr[i] == find) return i;
    revert("element not found");
  }

  /**
   * @dev Given an array of tokens and scores, sort by scores in descending order.
   */
  function sortByDescendingScore(
    address[] memory addresses,
    uint256[] memory scores
  ) internal pure {
    uint256 len = addresses.length;
    for (uint256 i = 0; i < len; i++) {
      uint256 score = scores[i];
      address _address = addresses[i];
      uint256 j = i - 1;
      while (int(j) >= 0 && scores[j] < score) {
        scores[j + 1] = scores[j];
        addresses[j + 1] = addresses[j];
        j--;
      }
      scores[j + 1] = score;
      addresses[j + 1] = _address;
    }
  }
}