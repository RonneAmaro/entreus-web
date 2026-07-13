-- Remove direct browser-role access to the orphan cleanup queue.

revoke all privileges
on table public.profile_media_copy_orphans
from public;

revoke all privileges
on table public.profile_media_copy_orphans
from anon;

revoke all privileges
on table public.profile_media_copy_orphans
from authenticated;

grant select, insert, update, delete
on table public.profile_media_copy_orphans
to service_role;