// SPDX-License-Identifier: MIT
pragma solidity >=0.5.0;
pragma abicoder v2;


interface DyDxStructs {
  struct Val {
    uint256 value;
  }

  struct Set {
    uint128 borrow;
    uint128 supply;
  }

  enum ActionType {
    Deposit, // supply tokens
    Withdraw // borrow tokens
  }

  enum AssetDenomination {
    Wei // the amount is denominated in wei
  }

  enum AssetReference {
    Delta // the amount is given as a delta from the current value
  }

  struct AssetAmount {
    bool sign; // true if positive
    AssetDenomination denomination;
    AssetReference ref;
    uint256 value;
  }

  struct ActionArgs {
    ActionType actionType;
    uint256 accountId;
    AssetAmount amount;
    uint256 primaryMarketId;
    uint256 secondaryMarketId;
    address otherAddress;
    uint256 otherAccountId;
    bytes data;
  }

  struct Info {
    address owner; // The address that owns the account
    uint256 number; // A nonce that allows a single address to control many accounts
  }

  struct Wei {
    bool sign; // true if positive
    uint256 value;
  }
}


interface IDyDx is DyDxStructs {
  function getEarningsRate() external view returns (Val memory);

  function getNumMarkets() external view returns (uint256);

  function getMarketIsClosing(uint256 marketId) external view returns (bool);

  function getMarketTokenAddress(uint256) external view returns (address);

  function getMarketInterestRate(uint256 marketId) external view returns (Val memory);

  function getMarketTotalPar(uint256 marketId) external view returns (Set memory);

  function getAccountWei(Info memory account, uint256 marketId) external view returns (Wei memory);

  function operate(Info[] memory, ActionArgs[] memory) external;
}
