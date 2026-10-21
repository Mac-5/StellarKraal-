'use strict';

/**
 * Loan state machine.
 *
 * Defines every valid loan state transition and provides a guard that
 * service-layer code can use to reject invalid transitions before they
 * reach persistence. Invalid transitions throw a typed
 * `InvalidLoanTransitionError` which the API layer maps to HTTP 422.
 */

const LOAN_STATES = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  ACTIVE: 'active',
  REPAID: 'repaid',
  DEFAULTED: 'defaulted',
  LIQUIDATED: 'liquidated',
  CANCELLED: 'cancelled',
});

const VALID_TRANSITIONS = Object.freeze({
  [LOAN_STATES.PENDING]: [LOAN_STATES.APPROVED, LOAN_STATES.CANCELLED],
  [LOAN_STATES.APPROVED]: [LOAN_STATES.ACTIVE, LOAN_STATES.CANCELLED],
  [LOAN_STATES.ACTIVE]: [
    LOAN_STATES.REPAID,
    LOAN_STATES.DEFAULTED,
    LOAN_STATES.LIQUIDATED,
  ],
  [LOAN_STATES.DEFAULTED]: [LOAN_STATES.LIQUIDATED, LOAN_STATES.REPAID],
  [LOAN_STATES.REPAID]: [],
  [LOAN_STATES.LIQUIDATED]: [],
  [LOAN_STATES.CANCELLED]: [],
});

const ERROR_CODE = 'INVALID_LOAN_TRANSITION';

class InvalidLoanTransitionError extends Error {
  constructor(fromState, toState) {
    super(
      `Invalid loan state transition from "${fromState}" to "${toState}"`
    );
    this.name = 'InvalidLoanTransitionError';
    this.code = ERROR_CODE;
    this.statusCode = 422;
    this.fromState = fromState;
    this.toState = toState;
  }
}

class LoanStateMachine {
  static get states() {
    return LOAN_STATES;
  }

  static get transitions() {
    return VALID_TRANSITIONS;
  }

  static isKnownState(state) {
    return Object.prototype.hasOwnProperty.call(VALID_TRANSITIONS, state);
  }

  static allowedTransitions(fromState) {
    return VALID_TRANSITIONS[fromState] || [];
  }

  static canTransition(fromState, toState) {
    if (!LoanStateMachine.isKnownState(fromState)) {
      return false;
    }
    return LoanStateMachine.allowedTransitions(fromState).includes(toState);
  }

  /**
   * Guard used by service methods. Throws a typed error when the
   * transition is not permitted by the state diagram.
   */
  static assertTransition(fromState, toState) {
    if (!LoanStateMachine.canTransition(fromState, toState)) {
      throw new InvalidLoanTransitionError(fromState, toState);
    }
    return toState;
  }
}

module.exports = {
  LOAN_STATES,
  VALID_TRANSITIONS,
  ERROR_CODE,
  InvalidLoanTransitionError,
  LoanStateMachine,
};
