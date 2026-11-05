// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @dev ТІЛЬКИ ДЛЯ ТЕСТІВ (наскрізний сценарій сайту, scripts/e2e-wallet.ts). Повторює поведінку USDT в Ethereum, якої
/// бракує MockUSDT: подія Transfer/Approval, transfer/approve без значення, що повертається, і заборона міняти
/// ненульове схвалення на інше ненульове (спершу approve(0)).
contract MockUSDTStrict {
    string public constant name = "Mock Tether Strict";
    string public constant symbol = "USDT";
    uint8 public constant decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 value) external {
        balanceOf[to] += value;
        totalSupply += value;
        emit Transfer(address(0), to, value);
    }

    function approve(address spender, uint256 value) external {
        require(!(value != 0 && allowance[msg.sender][spender] != 0), "approve from non-zero");
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
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
        require(balanceOf[from] >= value, "balance");
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}
