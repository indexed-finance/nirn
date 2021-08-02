// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "../interfaces/IProxyManager.sol";
import "../libraries/CloneLibrary.sol";


contract TestProxyManager is IProxyManager {
  event DeployedProxy(bytes32 implementationId, address proxy);

  mapping (bytes32 => address) public implementations;

  function addImplementation(bytes32 implementationId, address implementation) external {
    implementations[implementationId] = implementation;
  }

  function deployProxyManyToOne(bytes32 implementationId, bytes32 suppliedSalt) external override returns (address proxy) {
    bytes32 salt = keccak256(abi.encode(implementationId, suppliedSalt));
    proxy = CloneLibrary.createClone(implementations[implementationId], salt);
    emit DeployedProxy(implementationId, proxy);
  }

  function computeProxyAddressManyToOne(
    address, bytes32 implementationId, bytes32 suppliedSalt
  ) external view override returns (address proxy) {
    bytes32 salt = keccak256(abi.encode(implementationId, suppliedSalt));
    address implementation = implementations[implementationId];
    bytes32 initCodeHash = keccak256(CloneLibrary.getCreateCode(implementation));
    bytes32 _data = keccak256(
      abi.encodePacked(bytes1(0xff), address(this), salt, initCodeHash)
    );
    return address(uint160(uint256(_data)));
  }
}