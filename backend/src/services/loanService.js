'use strict';

/**
 * Loan state machine.
 *
 * Documented state diagram:
 *
 *   pending  -> approved | rejected | cancelled
 *   approved -> active   | cancelled
 *   active   -> repaid   | defaulted
 *   repaid   -> (terminal)
 *   rejected -> (terminal)
 *   cancelled-> (terminal)
 *   defaulted-> (terminal)
 */

const LOAN_STATES = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  ACTIVE: 'active',
  REPAID: 'repaid',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  DEFAULTED: 'defaulted',
});

const VALID_TRANSITIONS = Object.freeze({
  [LOAN_STATES.PENDING]: [
    LOAN_STATES.APPROVED,
    LOAN_STATES.REJECTED,
    LOAN_STATES.CANCELLED,
  ],
  [LOAN_STATES.APPROVED]: [LOAN_STATES.ACTIVE, LOAN_STATES.CANCELLED],
  [LOAN_STATES.ACTIVE]: [LOAN_STATES.REPAID, LOAN_STATES.DEFAULTED],
  [LOAN_STATES.REPAID]: [],
  [LOAN_STATES.REJECTED]: [],
  [LOAN_STATES.CANCELLED]: [],
  [LOAN_STATES.DEFAULTED]: [],
});

class InvalidLoanTransitionError extends Error {
  constructor(fromState, toState) {
    super(`Invalid loan state transition: ${fromState} -> ${toState}`);
    this.name = 'InvalidLoanTransitionError';
    this.code = 'INVALID_LOAN_TRANSITION';
    this.status = 422;
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

  static canTransition(fromState, toState) {
    if (!LoanStateMachine.isKnownState(fromState)) {
      return false;
    }
    return VALID_TRANSITIONS[fromState].includes(toState);
  }

  static assertTransition(fromState, toState) {
    if (!LoanStateMachine.canTransition(fromState, toState)) {
      throw new InvalidLoanTransitionError(fromState, toState);
    }
    return toState;
  }

  static nextStates(fromState) {
    return VALID_TRANSITIONS[fromState] ? [...VALID_TRANSITIONS[fromState]] : [];
  }
}

module.exports = {
  LOAN_STATES,
  VALID_TRANSITIONS,
  LoanStateMachine,
  InvalidLoanTransitionError,
};
