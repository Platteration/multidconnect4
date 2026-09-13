/** Connect Four against the shared contract every multiverse game must keep. */
import { describeMultiverse } from '@5d/core/testing';
import { engine, Spec } from '../multiverse';
import { enumerateActions } from '../bot';

describeMultiverse<Spec>('connect four', {
  engine,
  actions: (state) => enumerateActions(state, 3),
  isTravel: (a) => a.type === 'travel',
  endTurn: { type: 'endTurn' },
  strictRules: { strictPresent: true },
});
