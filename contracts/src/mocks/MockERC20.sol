// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @dev ТІЛЬКИ ДЛЯ ТЕСТІВ. Стандартний ERC-20, що повертає bool. Для заблокованих адрес повертає false (не відкочує).
/// Може один раз викликати чужий контракт перед переказом (імітація хука на кшталт ERC-777), щоб перевірити повторний вхід.
contract MockERC20 {
    uint8 public constant decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public blocked;

    address public hookTarget;
    bytes public hookData;
    bool public hookSuccess;
    bytes public hookResult;

    function setBlocked(address who, bool value) external {
        blocked[who] = value;
    }

    function setHook(address target, bytes calldata data) external {
        hookTarget = target;
        hookData = data;
    }

    function mint(address to, uint256 value) external {
        balanceOf[to] += value;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _hook();
        return _move(msg.sender, to, value);
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        _hook();
        uint256 allowed = allowance[from][msg.sender];
        if (allowed < value) return false;
        allowance[from][msg.sender] = allowed - value;
        return _move(from, to, value);
    }

    function _hook() private {
        address target = hookTarget;
        if (target == address(0)) return;
        hookTarget = address(0);
        (hookSuccess, hookResult) = target.call(hookData);
    }

    function _move(address from, address to, uint256 value) private returns (bool) {
        if (blocked[from] || blocked[to] || balanceOf[from] < value) return false;
        balanceOf[from] -= value;
        balanceOf[to] += value;
        return true;
    }
}
