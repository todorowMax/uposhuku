// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {FeeMath} from "./FeeMath.sol";

/// @title FeeRouter
/// @notice Прямий платіж USDT з комісією: за одну транзакцію виконавець отримує рівно `amount`, а отримувач
/// комісії додатково `quoteFee(amount)`. Гроші в контракті не залишаються: обидва переказу йдуть
/// безпосередньо з гаманця платника. Немає власника, оновлень і функцій виводу.
/// Прототип, аудиту не проходив.
contract FeeRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Стеля ставки: 10 %.
    uint16 public constant MAX_FEE_BPS = 1000;

    uint16 public immutable FEE_BPS;
    address public immutable FEE_RECIPIENT;
    /// @notice Білий список токенів, заданий у конструкторі й незмінний.
    mapping(address token => bool allowed) public isTokenAllowed;

    event Paid(
        bytes32 indexed dealRef,
        address indexed payer,
        address indexed recipient,
        address token,
        uint256 amount,
        uint256 fee
    );
    /// @notice Переказ комісії не вдався (наприклад, адреса отримувача заблокована токеном). Платіж виконавцю пройшов.
    event FeeSkipped(bytes32 indexed dealRef, uint256 fee);

    error FeeTooHigh();
    error ZeroAddress();
    error TokenNotAllowed();
    error InvalidRecipient();
    error ZeroAmount();
    error InsufficientAllowanceOrBalance();

    constructor(uint16 feeBps, address feeRecipient, address[] memory tokens) {
        if (feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        if (feeRecipient == address(0) || feeRecipient == address(this)) revert ZeroAddress();
        FEE_BPS = feeBps;
        FEE_RECIPIENT = feeRecipient;
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] == address(0) || tokens[i] == address(this)) revert ZeroAddress();
            isTokenAllowed[tokens[i]] = true;
        }
    }

    /// @notice Комісія зверху від `amount`. Платник має схвалити рівно `amount + quoteFee(amount)`.
    function quoteFee(uint256 amount) public view returns (uint256) {
        return FeeMath.ceilFee(amount, FEE_BPS);
    }

    function pay(address token, address recipient, uint256 amount, bytes32 dealRef) external nonReentrant {
        if (!isTokenAllowed[token]) revert TokenNotAllowed();
        if (recipient == address(0) || recipient == address(this)) revert InvalidRecipient();
        if (amount == 0) revert ZeroAmount();

        uint256 fee = quoteFee(amount);
        uint256 total = amount + fee;
        IERC20 erc20 = IERC20(token);
        // Без цієї перевірки платник міг би схвалити лише `amount`, і переказ комісії тихо б провалився.
        if (erc20.allowance(msg.sender, address(this)) < total || erc20.balanceOf(msg.sender) < total) {
            revert InsufficientAllowanceOrBalance();
        }

        erc20.safeTransferFrom(msg.sender, recipient, amount);

        // Заблокований отримувач комісії не повинен блокувати виплату виконавцю: тоді платник комісію не платить.
        if (fee != 0 && !erc20.trySafeTransferFrom(msg.sender, FEE_RECIPIENT, fee)) {
            emit FeeSkipped(dealRef, fee);
            fee = 0;
        }
        emit Paid(dealRef, msg.sender, recipient, token, amount, fee);
    }
}
