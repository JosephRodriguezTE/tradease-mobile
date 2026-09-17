-- Removes test payment_intents rows created by MockPaymentProvider
-- (lib/payment/mock.ts) -- every row it creates is tagged provider='mock'.
-- Run manually; not a migration, not applied automatically.
--
-- work_orders.payment_intent_id references these rows, so it has to be
-- cleared first or the delete leaves a dangling reference.
--
-- payment_events rows for these intents are left in place deliberately --
-- they're an audit log, not live state, and cascading their deletion
-- here would erase the one place mock activity is actually traceable.

update work_orders set payment_intent_id = null
  where payment_intent_id in (select id from payment_intents where provider = 'mock');

delete from payment_intents where provider = 'mock';
