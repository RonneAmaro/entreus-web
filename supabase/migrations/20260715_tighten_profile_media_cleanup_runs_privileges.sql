-- Keep the cleanup run history non-destructive, including for service_role.

revoke all privileges
on table public.profile_media_cleanup_runs
from service_role;

grant select, insert, update
on table public.profile_media_cleanup_runs
to service_role;