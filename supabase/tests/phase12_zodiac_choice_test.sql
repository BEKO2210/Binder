-- The star sign is the person's decision, and "off" has to mean off everywhere.
--
-- Age in years plus a star sign narrows a birth date to the thirty days of that
-- sign, and the birth date is the one field this system never gives out. The
-- sign stays a feature; publishing it became a switch. A profile that hides it
-- must also disappear from a search by sign — otherwise the filter answers the
-- question the switch was turned off to keep.
begin;

create extension if not exists pgtap;

select plan(4);

select ok(
  (select count(*) = 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'zodiac_public'),
  'profiles carries the choice'
);

select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'zodiac_public'),
  'true',
  'existing profiles keep publishing their sign'
);

-- A hidden sign is not searchable: same person, same birth date, only the
-- switch differs.
select is(
  private.passes_attribute_filters('{"zodiac":["leo"]}'::jsonb, null, null, null, null, null, null, null, null, null, null, date '1990-08-05', true),
  true,
  'a published Leo matches a search for Leo'
);

select is(
  private.passes_attribute_filters('{"zodiac":["leo"]}'::jsonb, null, null, null, null, null, null, null, null, null, null, date '1990-08-05', false),
  false,
  'the same Leo with the sign hidden is not found by that search'
);

select * from finish();
rollback;
