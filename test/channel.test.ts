import { expect } from 'chai';
import { describe, it } from 'mocha';
import {
  Observable,
  Subscription,
  BehaviorSubject,
  range,
  asyncScheduler,
  throwError,
  concat,
  of,
} from 'rxjs';
import { scan, tap } from 'rxjs/operators';
import {
  trigger,
  query,
  filter,
  listen,
  on,
  reset,
  Event,
  EventMatcher,
  ConcurrencyMode,
  Filter,
} from '../src/channel';
import { randomId, after } from '../src/utils';

function eventsMatching(
  eventMatcher: EventMatcher,
  example: any
): BehaviorSubject<Array<Event>> {
  const seen = new BehaviorSubject<Array<Event>>([]);
  const sub = query(eventMatcher)
    .pipe(scan((a, i) => [...a, i], new Array<Event>()))
    .subscribe(seen);

  // can clean up with an afterEach
  example.unsubscribe = () => {
    sub.unsubscribe();
  };
  return seen;
}

require('clear')();

describe('Sequences of Methods', () => {
  let callCount = 0;
  const thrower: Filter = (e: Event) => {
    callCount++;
    takesException(e);
  };

  const ill = () => {
    callCount++;
    throw new Error('down wit da sickness');
  };

  const throwsError = () => {
    callCount++;
    return throwError(new Error('Oops'));
  };

  const throwsErrorLater = () => {
    callCount++;
    return concat(after(1, 1), throwError(new Error('Oops')));
  };

  beforeEach(() => {
    reset();
    callCount = 0;
  });
  afterEach(function() {
    if (this.subscription) {
      this.unsubscribe = () => this.subscription.unsubscribe();
    }
    this.unsubscribe && this.unsubscribe();
  });

  describe('#trigger', () => {
    it('creates and returns the event', () => {
      const result = trigger('etype', {});
      const expected = { type: 'etype', payload: {} };
      expect(result).to.eql(expected);
    });
  });

  describe('#query', () => {
    it('returns an Observable of events', () => {
      const result = query(true);

      expect(result).to.be.instanceOf(Observable);
    });
    describe('inside of a #listen', () => {
      it('misses its own event, of course', async function() {
        let counter = 0;
        listen('count/start', () => {
          query('count/start').subscribe(() => {
            counter++;
          });
        });
        trigger('count/start');
        await delay(10);
        expect(counter).to.equal(0);
      });
    });
  });

  describe('#filter', () => {
    it('returns a subscription', () => {
      const result = filter(true, () => null);

      expect(result).to.be.instanceOf(Subscription);
    });
    it('Should not be given a function which returns a Promise');
  });

  describe('#listen', () => {
    describe('Arguments', () => {
      describe('An Event Pattern', () => {
        it('what events the listener will run upon');
      });
      describe('A Listener  - A function to be run on matching events', () => {
        it('May return nothing or a sync value');
        it('May return an Observable');
        it('May return a Promise');
      });
      describe('Config - concurrency and re-triggering', () => {
        it('See #listen / #trigger specs');
      });
    });

    it('returns a subscription', () => {
      const result = listen(true, () => null);

      expect(result).to.be.instanceOf(Subscription);
    });
  });

  describe('#trigger, #query', () => {
    it('does not find events triggered before the query', function() {
      let counter = 0;
      trigger('count/start');
      this.subscription = query('count/start').subscribe(() => {
        counter++;
      });
      trigger('count/start');
      expect(counter).to.equal(1);
    });
  });

  describe('#query, #trigger', () => {
    it('finds events triggered after the query', function() {
      const eventMatcher = true;

      const seen = eventsMatching(eventMatcher, this);

      // trigger events
      const event2 = { type: 'e2', payload: randomId() };
      trigger(event.type, event.payload);
      trigger(event2.type, event2.payload);

      expect(seen.value).to.eql([event, event2]);
    });
  });

  describe('#filter, #trigger', () => {
    it('runs synchronously', () => {
      filter(true, () => {
        callCount++;
      });
      trigger('foo');
      expect(callCount).to.equal(1);
    });

    it('can modify the event', () => {
      filter(true, mutator);
      const result = trigger(event.type, event.payload);
      expect(result).to.have.property('mutantProp', ':)');
    });

    it('affects only specified events', () => {
      let bac = 0;
      filter('beer', () => {
        bac += 0.1;
      });
      filter('wine', () => {
        bac += 0.2;
      });
      trigger('wine');
      expect(bac).to.equal(0.2);
    });

    it('can throw for the triggerer', () => {
      filter(true, takesException);
      expect(triggerEvent).to.throw();
    });

    it('can throw and resume taking events', () => {
      filter(true, thrower);
      expect(triggerEvent).to.throw();
      expect(callCount).to.equal(1);
      expect(triggerEvent).to.throw();
      expect(callCount).to.equal(2);
    });
  });

  describe('#filter, #filter, #trigger', () => {
    it('calls filters in order added', () => {
      const doubler = (e: Event) => {
        e.payload *= 2;
      };
      const speaker = (e: Event) => {
        e.payload = `The number is ${e.payload}`;
      };

      filter(true, doubler);
      filter(true, speaker);
      const result = trigger('any', 7);
      expect(result.payload).to.equal('The number is 14');
    });
    it('aborts later filters if earlier ones throw', () => {
      const healthy = () => {
        callCount++;
      };

      filter(true, ill);
      filter(true, healthy);
      expect(triggerEvent).to.throw();
      expect(callCount).to.equal(1);
    });
    it('runs no listeners if an exception thrown', () => {
      let listenerCallCount = 0;
      const healthy = () => {
        listenerCallCount++;
      };

      filter(true, ill);
      listen(true, healthy);
      expect(triggerEvent).to.throw();
      expect(listenerCallCount).to.equal(0);
    });
  });

  describe('#filter, #trigger, #filter.unsubscribe, #trigger', () => {
    it('stops filtering events', () => {
      let sub = filter(true, mutator);
      let result = trigger(event.type, event.payload);
      expect(result).to.have.property('mutantProp', ':)');

      sub.unsubscribe();
      result = trigger(event.type, event.payload);
      expect(result).not.to.have.property('mutantProp', ':)');
    });
  });

  describe('#listen, #trigger', () => {
    it('listener is run only on matching events', () => {
      listen('known-event', () => {
        callCount++;
      });
      trigger('unknown-event');
      expect(callCount).to.equal(0);
    });

    it('does not throw for the triggerer', () => {
      listen(true, thrower);
      expect(triggerEvent).not.to.throw();
      expect(callCount).to.equal(1);
    });

    it('is removed if it throws', () => {
      listen(true, thrower);
      expect(triggerEvent).not.to.throw();
      expect(callCount).to.equal(1);
      expect(triggerEvent).not.to.throw();
      expect(callCount).to.equal(1);
    });

    it('is removed if its Observable errors', () => {
      listen(true, throwsError);
      expect(triggerEvent).not.to.throw();
      expect(callCount).to.equal(1);
      expect(triggerEvent).not.to.throw();
      expect(callCount).to.equal(1);
    });

    it('cannot modify the event', () => {
      listen(true, mutator);
      const result = triggerEvent();
      expect(result).not.to.have.property('mutantProp');
    });

    it('can be used to trigger new events asynchronously from Promises', async function() {
      const seen = eventsMatching(true, this);
      listen('cause', () =>
        delay(1, () => {
          trigger('effect');
        })
      );
      trigger('cause');
      expect(seen.value).to.eql([{ type: 'cause' }]);
      await delay(2);
      expect(seen.value).to.eql([{ type: 'cause' }, { type: 'effect' }]);
    });

    it('can be used to trigger new events asynchronously from Observables', async function() {
      const seen = eventsMatching(true, this);
      listen('cause', () =>
        after(1, () => {
          trigger('effect');
        })
      );
      trigger('cause');
      expect(seen.value).to.eql([{ type: 'cause' }]);
      await delay(2);
      expect(seen.value).to.eql([{ type: 'cause' }, { type: 'effect' }]);
    });

    it('can trigger `next` events via config', async function() {
      const seen = eventsMatching(true, this);
      listen('cause', () => after(1, () => '⚡️'), {
        trigger: { next: 'effect' },
      });
      trigger('cause');
      expect(seen.value).to.eql([{ type: 'cause' }]);
      await delay(2);
      expect(seen.value).to.eql([
        { type: 'cause' },
        { type: 'effect', payload: '⚡️' },
      ]);
    });

    it('can trigger `error` events when it dies via config', async function() {
      const seen = eventsMatching(true, this);
      listen('cause', throwsError, { trigger: { error: 'cause/error' } });
      trigger('cause');
      trigger('cause');
      expect(seen.value[0]).to.eql({ type: 'cause' });
      expect(seen.value[1].type).to.eq('cause/error');
      expect(seen.value[1].payload).to.be.instanceOf(Error);
      expect(seen.value[2]).to.eql({ type: 'cause' });

      // no more errors since the listener was still unsubscribed
      expect(seen.value).to.have.length(3);
    });

    it('can trigger `complete` events via config', async function() {
      const seen = eventsMatching(true, this);
      listen('cause', () => of(2.718), {
        trigger: { next: 'effect', complete: 'cause/complete' },
      });
      trigger('cause');

      expect(seen.value).to.eql([
        { type: 'cause' },
        { type: 'effect', payload: 2.718 },
        { type: 'cause/complete' },
      ]);
    });
  });

  describe('#listen, #listen, #trigger', () => {
    it('errors in one listener dont affect the others', function() {
      const seen = eventsMatching(true, this);
      listen(true, throwsError);
      listen(true, () => {
        callCount++;
      });
      triggerEvent();
      triggerEvent();
      expect(seen.value).to.have.length(2);

      expect(callCount).to.equal(3);
    });

    it('runs listeners concurrently', async function() {
      const seen = eventsMatching(true, this);
      listen('tick/start', threeTicksTriggered(1, 3, 'tick'));
      listen('tick/start', threeTicksTriggered(1, 3, 'tock'));

      trigger('tick/start');
      await delay(10);
      expect(seen.value).to.eql([
        { type: 'tick/start' },
        { type: 'tick', payload: 1 },
        { type: 'tock', payload: 1 },
        { type: 'tick', payload: 2 },
        { type: 'tock', payload: 2 },
        { type: 'tick', payload: 3 },
        { type: 'tock', payload: 3 },
      ]);
    });
  });

  describe('Concurrency Modes: #listen, #trigger, #trigger', () => {
    it('ignore (mute/exhaustMap)', async function() {
      const seen = eventsMatching(true, this);
      listen('tick/start', ({ payload }) => threeTicksTriggered(payload, 3)(), {
        mode: ignore,
      });

      // 2 within a short time
      trigger('tick/start', 1);
      trigger('tick/start', 7); // ignored
      await delay(10);
      expect(seen.value).to.eql([
        { type: 'tick/start', payload: 1 },
        { type: 'tick/start', payload: 7 },
        { type: 'tick', payload: 1 },
        { type: 'tick', payload: 2 },
        { type: 'tick', payload: 3 },
      ]);
    });

    it('toggle (toggle/toggleMap)', async function() {
      const seen = eventsMatching(true, this);
      listen(
        'tick/start',
        ({ payload }) => {
          trigger('tick', 'sync');
          return threeTicksTriggered(payload, 3)();
        },
        {
          mode: toggle,
        }
      );

      // 2 within a short time
      trigger('tick/start', 1);
      trigger('tick/start', 2);
      trigger('tick/start', 3);

      await delay(10);
      expect(seen.value).to.eql([
        { type: 'tick/start', payload: 1 },
        { type: 'tick', payload: 'sync' },
        // the async part was toggled off
        { type: 'tick/start', payload: 2 },
        { type: 'tick', payload: 'sync' },
        // a new run went to completion
        { type: 'tick/start', payload: 3 },
        { type: 'tick', payload: 'sync' },
        { type: 'tick', payload: 3 },
        { type: 'tick', payload: 4 },
        { type: 'tick', payload: 5 },
      ]);
    });

    it('replace (cutoff/switchMap', async function() {
      const seen = eventsMatching(true, this);
      listen('tick/start', ({ payload }) => threeTicksTriggered(payload, 3)(), {
        mode: replace,
      });

      // 2 within a short time
      const sub = query('tick').subscribe(() => {
        trigger('tick/start', 7);
        sub.unsubscribe();
      });
      trigger('tick/start', 1);

      await delay(20);
      expect(seen.value).to.eql([
        { type: 'tick/start', payload: 1 },
        { type: 'tick', payload: 1 },
        { type: 'tick/start', payload: 7 },
        { type: 'tick', payload: 7 },
        { type: 'tick', payload: 8 },
        { type: 'tick', payload: 9 },
      ]);
    });

    it('start (parallel/mergeMap)', async function() {
      const seen = eventsMatching(true, this);
      listen('tick/start', ({ payload }) => threeTicksTriggered(payload, 3)(), {
        mode: parallel,
      });

      // 2 within a short time
      trigger('tick/start', 1);
      trigger('tick/start', 7);
      await delay(20);
      expect(seen.value).to.eql([
        { type: 'tick/start', payload: 1 },
        { type: 'tick/start', payload: 7 },
        { type: 'tick', payload: 1 },
        { type: 'tick', payload: 7 },
        { type: 'tick', payload: 2 },
        { type: 'tick', payload: 8 },
        { type: 'tick', payload: 3 },
        { type: 'tick', payload: 9 },
      ]);
    });

    it('enqueue (serial/concatMap)', async function() {
      const seen = eventsMatching(true, this);
      listen('tick/start', ({ payload }) => threeTicksTriggered(payload, 3)(), {
        mode: serial,
      });

      // 2 within a short time
      trigger('tick/start', 1);
      trigger('tick/start', 7);
      await delay(20);
      expect(seen.value).to.eql([
        { type: 'tick/start', payload: 1 },
        { type: 'tick/start', payload: 7 },
        { type: 'tick', payload: 1 },
        { type: 'tick', payload: 2 },
        { type: 'tick', payload: 3 },
        { type: 'tick', payload: 7 },
        { type: 'tick', payload: 8 },
        { type: 'tick', payload: 9 },
      ]);
    });
  });

  describe('#listen, #trigger, #listen.unsubscribe', () => {
    it('cancels in-flight listeners', async function() {
      const seen = eventsMatching(true, this);
      const sub = listen('cause', () =>
        after(1, () => {
          trigger('effect');
        })
      );
      trigger('cause');
      expect(seen.value).to.eql([{ type: 'cause' }]);
      sub.unsubscribe();
      await delay(2);
      expect(seen.value).to.eql([{ type: 'cause' }]);
    });
  });

  describe('Aliases', () => {
    describe('#on', () => {
      it('is an alias for #listen', () => {
        const result = on(true, () => null);

        expect(result).to.be.instanceOf(Subscription);
      });
    });
  });
});

const event = { type: 'anytype', payload: randomId() };
const ignore = ConcurrencyMode.ignore;
const toggle = ConcurrencyMode.toggle;
const replace = ConcurrencyMode.replace;
const parallel = ConcurrencyMode.parallel;
const serial = ConcurrencyMode.serial;

const takesException: Filter = () => {
  throw new Error(`Error: ${randomId()}`);
};

const mutator: Filter = (e: Event) => {
  // @ts-ignore
  e.mutantProp = ':)';
};

const triggerEvent = () => {
  return trigger(event.type, event.payload);
};

const delay = (ms: number, fn?: any) =>
  new Promise(resolve => {
    setTimeout(() => resolve(fn && fn()), ms);
  });

const threeTicksTriggered = (
  from: number,
  count: number,
  type = 'tick'
) => () => {
  return range(from, count, asyncScheduler).pipe(
    tap(n => {
      trigger(type, n);
    })
  );
};
