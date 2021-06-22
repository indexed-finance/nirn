// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;


contract CallForwarder {
  function execute(address to, bytes memory data) external {
    assembly {
      let result := call(gas(), to, 0, add(data, 32), mload(data), 0, 0)
      returndatacopy(0, 0, returndatasize())
      switch result
      case 0 { revert(0, returndatasize()) }
      default { return(0, returndatasize()) }
    }
  }
}