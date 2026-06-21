-- Read-only verification; never select applicant rows or personal data.
select to_regclass('public.creator_interest_requests') as table_name;
select relrowsecurity from pg_class where oid = 'public.creator_interest_requests'::regclass;
select policyname, cmd from pg_policies where schemaname='public' and tablename='creator_interest_requests' order by policyname;
select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.creator_interest_requests'::regclass;
select indexname from pg_indexes where schemaname='public' and tablename='creator_interest_requests';
select status, count(*) from public.creator_interest_requests group by status order by status;
