-- One filter function, not two.
--
-- Adding the sign's visibility as a parameter left the twelve-argument version
-- in place. Both callers were changed to pass thirteen, so the old one is dead
-- code — and dead code with a name this important is a trap: the next caller
-- written from memory would silently get the version that ignores the switch.
drop function if exists private.passes_attribute_filters(jsonb, smallint, text, text, text, text, text, text, text, text, text, date);
