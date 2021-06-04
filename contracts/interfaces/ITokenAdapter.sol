// SPDX-License-Identifier: MIT
pragma solidity >=0.5.0;


interface IErc20Adapter {
  function underlying() external view returns (address);

  function token() external view returns (address);

  function name() external view returns (string memory);

  function getAPR() external view returns (uint256);

  function getHypotheticalAPR(uint256 _deposit) external view returns (uint256);

  function tokenBalance() external view returns (uint256);

  function underlyingBalance() external view returns (uint256);

  function deposit(uint256 amountUnderlying) external returns (uint256 amountMinted);

  function withdraw(uint256 amountToken) external returns (uint256 amountReceived);

  function withdrawUnderlying(uint256 amountUnderlying) external returns (uint256 amountBurned);
}

interface IEtherAdapter is IErc20Adapter {
  function depositETH() external payable returns (uint256 amountMinted);

  function withdrawAsETH(uint256 amountToken) external returns (uint256 amountReceived);

  function withdrawUnderlyingAsETH(uint256 amountUnderlying) external returns (uint256 amountBurned); 
}