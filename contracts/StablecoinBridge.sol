// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interface/IERC20.sol";
import "./interface/IERC677Receiver.sol";
import "./interface/IOracleFreeDollar.sol";

/**
 * @title Stable Coin Bridge
 * @notice A minting contract for another United States Dollar stablecoin ('source stablecoin') that we trust.
 * @author OracleFreeDollar
 */
contract StablecoinBridge {
    IERC20 public immutable usd; // the source stablecoin
    IOracleFreeDollar public immutable ofd; // the OracleFreeDollar

    /**
     * @notice The time horizon after which this bridge expires and needs to be replaced by a new contract.
     */
    uint256 public immutable horizon;

    /**
     * The maximum amount of outstanding converted source stablecoins.
     */
    uint256 public immutable limit;
    uint256 public minted;

    error Limit(uint256 amount, uint256 limit);
    error Expired(uint256 time, uint256 expiration);
    error UnsupportedToken(address token);

    constructor(address other, address ofdAddress, uint256 limit_) {
        usd = IERC20(other);
        ofd = IOracleFreeDollar(ofdAddress);
        horizon = block.timestamp + 52 weeks;
        limit = limit_;
        minted = 0;
    }

    /**
     * @notice Convenience method for mint(msg.sender, amount)
     */
    function mint(uint256 amount) external {
        mintTo(msg.sender, amount);
    }

    /**
     * @notice Mint the target amount of OracleFreeDollars, taking the equal amount of source coins from the sender.
     * @dev This only works if an allowance for the source coins has been set and the caller has enough of them.
     */
    function mintTo(address target, uint256 amount) public {
        usd.transferFrom(msg.sender, address(this), amount);
        _mint(target, amount);
    }

    function _mint(address target, uint256 amount) internal {
        if (block.timestamp > horizon) revert Expired(block.timestamp, horizon);
        ofd.mint(target, amount);
        minted += amount;
        if (minted > limit) revert Limit(amount, limit);
    }

    /**
     * @notice Convenience method for burnAndSend(msg.sender, amount)
     */
    function burn(uint256 amount) external {
        _burn(msg.sender, msg.sender, amount);
    }

    /**
     * @notice Burn the indicated amount of OracleFreeDollar and send the same number of source coin to the caller.
     */
    function burnAndSend(address target, uint256 amount) external {
        _burn(msg.sender, target, amount);
    }

    function _burn(address ofdHolder, address target, uint256 amount) internal {
        ofd.burnFrom(ofdHolder, amount);
        usd.transfer(target, amount);
        minted -= amount;
    }
}
