-- Force PostgREST schema/config reload after nexus schema exposure changes.
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
