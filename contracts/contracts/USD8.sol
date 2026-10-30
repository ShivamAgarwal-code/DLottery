// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title USD8
 * @notice ERC-20 token used to purchase DLottery tickets (PRD: payment token USD8).
 * @dev This is a test/MVP token with a public faucet so that anyone can obtain
 *      USD8 on a local or test network. On mainnet this would be replaced by the
 *      real USD8 token address; the lottery only depends on the ERC-20 interface.
 */
contract USD8 is ERC20, Ownable {
    uint8 private constant _DECIMALS = 18;

    /// @param initialHolder receives the initial supply (deployer convenience).
    /// @param initialSupply amount minted to `initialHolder` (in whole tokens).
    constructor(address initialHolder, uint256 initialSupply)
        ERC20("USD8 Stablecoin", "USD8")
        Ownable(msg.sender)
    {
        if (initialSupply > 0) {
            _mint(initialHolder, initialSupply * (10 ** _DECIMALS));
        }
    }

    function decimals() public pure override returns (uint8) {
        return _DECIMALS;
    }

    /// @notice Owner mint (test utility).
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Open faucet so testers can self-serve USD8 on local/test networks.
    /// @param amount amount in whole tokens (will be scaled by decimals).
    function faucet(uint256 amount) external {
        _mint(msg.sender, amount * (10 ** _DECIMALS));
    }
}
