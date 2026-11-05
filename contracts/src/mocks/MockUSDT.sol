// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @dev ТІЛЬКИ ДЛЯ ТЕСТІВ. Імітує USDT: transfer/transferFrom/approve нічого не повертають, адреси можна блокувати.
contract MockUSDT {
    string public constant name = "Mock Tether";
    string public constant symbol = "USDT";
    uint8 public constant decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public blocked;

    function setBlocked(address who, bool value) external {
        blocked[who] = value;
    }

    function mint(address to, uint256 value) external {
        balanceOf[to] += value;
        totalSupply += value;
    }

    function approve(address spender, uint256 value) external {
        allowance[msg.sender][spender] = value;
    }

    function transfer(address to, uint256 value) external {
        _move(msg.sender, to, value);
    }

    function transferFrom(address from, address to, uint256 value) external {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= value, "allowance");
        allowance[from][msg.sender] = allowed - value;
        _move(from, to, value);
    }

    function _move(address from, address to, uint256 value) private {
        require(!blocked[from] && !blocked[to], "blocked");
        require(balanceOf[from] >= value, "balance");
        balanceOf[from] -= value;
        balanceOf[to] += value;
    }
}
