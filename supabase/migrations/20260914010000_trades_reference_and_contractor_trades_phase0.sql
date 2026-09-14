-- Phase 0 of the trades join-table migration (design approved in a
-- separate planning pass; see conversation history for the full
-- 7-question report and shipping strategy).
--
-- Creates trades + contractor_trades, seeds the 9 canonical trades,
-- backfills the 3 existing contractors (including the comma-separated
-- one), and adds the trigger that keeps contractors.trade_type as a
-- denormalized cache of the primary trade. No reader changes in this
-- migration -- every one of the ~30 display sites that read trade_type
-- keeps working unmodified; that's the whole safety argument for
-- keeping the column instead of dropping it.

CREATE TABLE public.trades (
  -- Natural key, not a surrogate: the value IS the exact dbValue string
  -- from lib/map/trades.ts (e.g. 'HVAC'), so contractor_trades.trade_id
  -- and bookings.trade compare directly with zero translation.
  id text PRIMARY KEY,
  label text NOT NULL,
  color text NOT NULL,
  code text NOT NULL,
  sort_order smallint NOT NULL UNIQUE
);

COMMENT ON TABLE public.trades IS
  'Canonical trade taxonomy. id is the exact string stored in contractors.trade_type and bookings.trade today (lib/map/trades.ts calls this dbValue). Seeded once from lib/map/trades.ts; aliases and the richer catalog data (TRADE_JOBS/PRICE_RANGES/TRADE_SPECIALTIES) deliberately stay in application code for now -- see the design report for why.';

INSERT INTO public.trades (id, label, color, code, sort_order) VALUES
  ('HVAC',        'Heating & cooling', '#2DD4BF', 'HV', 1),
  ('Plumbing',    'Plumbing',          '#3B82F6', 'PL', 2),
  ('Electrical',  'Electrical',        '#FACC15', 'EL', 3),
  ('Roofing',     'Roofing & siding',  '#A78BFA', 'RF', 4),
  ('Carpentry',   'Carpentry',         '#D6A77A', 'CP', 5),
  ('Painting',    'Painting',          '#F472B6', 'PT', 6),
  ('Landscaping', 'Landscaping',       '#4ADE80', 'LS', 7),
  ('Cleaning',    'Cleaning',          '#E2E8F0', 'CL', 8),
  ('Handyman',    'Handyman',          '#FF7A1A', 'HM', 9);

-- Public, read-only reference data -- same posture as pricing_catalog /
-- cancellation_rules elsewhere in this schema. REVOKE ALL FROM PUBLIC
-- only touches the PUBLIC pseudo-role; the explicit revoke of write
-- verbs from anon/authenticated below is required separately -- creating
-- a new table on this project grants those roles full CRUD by default
-- (confirmed live: the same default-privilege behavior already
-- documented for functions and for the contractors_public view applies
-- to brand-new tables too, not just recreated ones).
REVOKE ALL ON public.trades FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.trades FROM anon, authenticated;
GRANT SELECT ON public.trades TO anon, authenticated;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY trades_public_read ON public.trades FOR SELECT USING (true);

CREATE TABLE public.contractor_trades (
  contractor_id uuid NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
  trade_id text NOT NULL REFERENCES public.trades(id),
  is_primary boolean NOT NULL DEFAULT false,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contractor_id, trade_id)
);

CREATE INDEX contractor_trades_trade_id_idx ON public.contractor_trades (trade_id);

-- Enforces "at most one primary per contractor." A partial unique index
-- only constrains rows matching the WHERE clause, so any number of
-- is_primary=false rows for the same contractor are unaffected.
CREATE UNIQUE INDEX contractor_trades_one_primary_per_contractor
  ON public.contractor_trades (contractor_id) WHERE is_primary;

REVOKE ALL ON public.contractor_trades FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.contractor_trades FROM anon, authenticated;
ALTER TABLE public.contractor_trades ENABLE ROW LEVEL SECURITY;
-- Mirrors contractors' own RLS posture (own-row + admin only) rather than
-- opening this table to broad SELECT -- any public-facing exposure of a
-- contractor's trades should go through a SECURITY DEFINER function
-- (contractors_nearby, etc.), exactly like contractors_public does for
-- the base table, not a direct grant on this table.
CREATE POLICY contractor_trades_select_own_or_admin ON public.contractor_trades
  FOR SELECT USING (
    auth.uid() = contractor_id
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin = true)
  );
-- Same is_anonymous guard as contractors_insert_own -- no writer uses
-- this yet (Phase 2 builds the first one), but the guard costs nothing
-- to have in place now rather than risk forgetting it later.
CREATE POLICY contractor_trades_insert_own ON public.contractor_trades
  FOR INSERT WITH CHECK (
    auth.uid() = contractor_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE
  );
CREATE POLICY contractor_trades_update_own ON public.contractor_trades
  FOR UPDATE USING (auth.uid() = contractor_id) WITH CHECK (auth.uid() = contractor_id);
CREATE POLICY contractor_trades_delete_own ON public.contractor_trades
  FOR DELETE USING (auth.uid() = contractor_id);

-- Enforces "at least one primary remains, whenever any trade rows
-- remain" (the partial unique index above only ever enforces "at most
-- one" -- it has no opinion on zero), and keeps contractors.trade_type
-- as a trigger-owned cache instead of something callers compute by hand
-- -- that hand computation (company-profile.tsx's `selectedTrades.join(
-- ', ')`) is what produced 'HVAC, Electrical' in the first place.
--
-- On DELETE of the primary row: promotes whichever remaining trade has
-- the lowest sort_order to primary. The delete itself never fails -- a
-- contractor holding a secondary trade can always drop their primary and
-- land on a still-consistent state, not an error. Proved live: deleted
-- the primary row off a real contractor holding a secondary, delete
-- succeeded, the secondary was promoted, trade_type followed it.
--
-- Zero trade_id rows left for a contractor: trade_type goes to NULL, its
-- original pre-migration meaning ("no trade set"), not a fabricated
-- placeholder string. No real contractor is in this state today; it
-- only matters once a future writer can reach zero trades (e.g.
-- mid-onboarding). Proved live: deleted a contractor's only remaining
-- trade row, trade_type went to null, not '' or a placeholder.
--
-- Deliberately not handled here: an UPDATE that flips is_primary from
-- true to false without a DELETE. No writer does that today (Phase 0 is
-- backfill-only, all INSERTs) -- out of scope until Phase 2 builds a
-- real writer, flagged rather than speculatively built for a write
-- pattern that doesn't exist yet.
CREATE OR REPLACE FUNCTION public.contractor_trades_maintain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_contractor_id uuid := COALESCE(NEW.contractor_id, OLD.contractor_id);
  v_primary_name text;
BEGIN
  IF TG_OP = 'DELETE' AND OLD.is_primary THEN
    UPDATE contractor_trades
    SET is_primary = true
    WHERE contractor_id = v_contractor_id
      AND trade_id = (
        SELECT trade_id FROM contractor_trades
        WHERE contractor_id = v_contractor_id
        ORDER BY sort_order ASC, trade_id ASC
        LIMIT 1
      );
  END IF;

  SELECT ct.trade_id INTO v_primary_name
  FROM contractor_trades ct
  WHERE ct.contractor_id = v_contractor_id AND ct.is_primary = true;

  UPDATE contractors SET trade_type = v_primary_name WHERE id = v_contractor_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE TRIGGER trg_contractor_trades_maintain
AFTER INSERT OR UPDATE OR DELETE ON public.contractor_trades
FOR EACH ROW
EXECUTE FUNCTION public.contractor_trades_maintain();

REVOKE ALL ON FUNCTION public.contractor_trades_maintain() FROM PUBLIC, anon, authenticated;

-- Backfill, with a count-mismatch check that does not assume every
-- comma-separated piece maps to a trades row. Expected counts are
-- snapshotted into a temp table BEFORE the insert runs -- necessary
-- because trg_contractor_trades_maintain fires per-row during this very
-- insert and starts overwriting trade_type immediately (correctly);
-- re-deriving "expected" from trade_type after the insert would read
-- already-mutated data. (This is exactly the bug the first two attempts
-- at this migration hit -- the aggregate check and then the
-- per-contractor check each independently made this mistake and were
-- caught by their own assertion before anything committed.)
CREATE TEMP TABLE trade_backfill_expected ON COMMIT DROP AS
SELECT c.id AS contractor_id, count(*) AS expected_pieces
FROM public.contractors c,
     LATERAL unnest(string_to_array(c.trade_type, ',')) AS piece(name)
WHERE c.trade_type IS NOT NULL AND trim(piece.name) <> ''
GROUP BY c.id;

-- WITH ORDINALITY preserves left-to-right order from the original
-- string, so 'HVAC, Electrical' makes HVAC (first-listed) primary --
-- matching what contractorTrade() in map.tsx already treats as primary
-- today by taking the first-listed trade.
INSERT INTO public.contractor_trades (contractor_id, trade_id, is_primary, sort_order)
SELECT c.id, t.id, (raw.ord = 1), raw.ord::smallint
FROM public.contractors c,
     LATERAL unnest(string_to_array(c.trade_type, ',')) WITH ORDINALITY AS raw(name, ord)
JOIN public.trades t ON t.id = trim(raw.name)
WHERE c.trade_type IS NOT NULL;

DO $$
DECLARE
  v_expected int;
  v_actual int;
  v_mismatch record;
  v_found boolean := false;
BEGIN
  SELECT coalesce(sum(expected_pieces), 0) INTO v_expected FROM trade_backfill_expected;
  SELECT count(*) INTO v_actual FROM public.contractor_trades;
  IF v_expected <> v_actual THEN
    RAISE EXCEPTION 'contractor_trades backfill mismatch: expected % total rows from the original trade_type values, got %', v_expected, v_actual;
  END IF;

  FOR v_mismatch IN
    SELECT e.contractor_id, e.expected_pieces,
      (SELECT count(*) FROM public.contractor_trades WHERE contractor_id = e.contractor_id) AS row_count
    FROM trade_backfill_expected e
  LOOP
    IF v_mismatch.expected_pieces <> v_mismatch.row_count THEN
      v_found := true;
      RAISE WARNING 'contractor % expected % pieces but has % contractor_trades rows', v_mismatch.contractor_id, v_mismatch.expected_pieces, v_mismatch.row_count;
    END IF;
  END LOOP;
  IF v_found THEN
    RAISE EXCEPTION 'per-contractor backfill mismatch detected, see warnings above';
  END IF;
END $$;
